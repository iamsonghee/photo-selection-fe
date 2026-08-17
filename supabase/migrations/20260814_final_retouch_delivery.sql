-- 최종 보정본 원본 크기 납품: 검토용 축소본과 별도 원본 자산 + 검토 회차별 immutable ZIP 후보.

ALTER TABLE public.photo_versions
  ADD COLUMN IF NOT EXISTS r2_delivery_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_filename TEXT,
  ADD COLUMN IF NOT EXISTS delivery_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS delivery_content_type TEXT,
  ADD COLUMN IF NOT EXISTS delivery_ready_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.final_delivery_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  review_version SMALLINT NOT NULL CHECK (review_version IN (1, 2)),
  manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_count INT NOT NULL,
  byte_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','ready','failed','obsolete')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.final_delivery_archive_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID NOT NULL REFERENCES public.final_delivery_archives(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  part_number INT NOT NULL,
  r2_key TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_count INT NOT NULL,
  byte_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','obsolete')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (archive_id, part_number)
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS active_final_delivery_archive_id UUID
    REFERENCES public.final_delivery_archives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS final_delivery_archives_pending_idx
  ON public.final_delivery_archives(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS final_delivery_parts_pending_idx
  ON public.final_delivery_archive_parts(created_at) WHERE status = 'pending';

-- 보정본 검토 시작과 그 회차의 납품 후보 스냅샷 생성을 한 트랜잭션으로 처리한다.
CREATE OR REPLACE FUNCTION public.start_retouch_review_with_archive(
  p_project_id UUID,
  p_version INT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_manifest JSONB;
  v_selected_count INT;
  v_archive_id UUID;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
  IF p_version = 1 AND v_project.status <> 'editing' THEN RAISE EXCEPTION 'invalid_project_status'; END IF;
  IF p_version = 2 AND v_project.status <> 'editing_v2' THEN RAISE EXCEPTION 'invalid_project_status'; END IF;

  SELECT count(*) INTO v_selected_count
  FROM public.selections WHERE project_id = p_project_id AND is_selected = true;
  IF v_selected_count = 0 THEN RAISE EXCEPTION 'no_selected_photos'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'photo_id', p.id,
      'key', pv.r2_delivery_url,
      'filename', pv.delivery_filename,
      'byte_size', pv.delivery_file_size,
      'content_type', pv.delivery_content_type
    ) ORDER BY p.number)
  INTO v_manifest
  FROM public.selections s
  JOIN public.photos p ON p.id = s.photo_id AND p.project_id = p_project_id
  LEFT JOIN LATERAL (
    SELECT vr.status, vr.reviewed_at
    FROM public.version_reviews vr
    WHERE vr.photo_id = p.id
    ORDER BY vr.reviewed_at DESC NULLS LAST, vr.created_at DESC
    LIMIT 1
  ) latest_review ON true
  JOIN LATERAL (
    SELECT v.r2_delivery_url, v.delivery_filename, v.delivery_file_size, v.delivery_content_type
    FROM public.photo_versions v
    WHERE v.photo_id = p.id
      AND (
        (p_version = 1 AND v.version = 1)
        OR
        (p_version = 2 AND (
          (latest_review.status = 'revision_requested' AND v.version = 2
            AND v.delivery_ready_at > latest_review.reviewed_at)
          OR (latest_review.status IS DISTINCT FROM 'revision_requested' AND v.version <= 2)
        ))
      )
      AND v.r2_delivery_url IS NOT NULL
      AND v.delivery_ready_at IS NOT NULL
    ORDER BY v.version DESC
    LIMIT 1
  ) pv ON true
  WHERE s.project_id = p_project_id AND s.is_selected = true;

  IF jsonb_array_length(COALESCE(v_manifest, '[]'::jsonb)) <> v_selected_count THEN
    RAISE EXCEPTION 'delivery_versions_incomplete';
  END IF;

  UPDATE public.final_delivery_archives
  SET status = 'obsolete'
  WHERE id = v_project.active_final_delivery_archive_id AND status <> 'obsolete';
  UPDATE public.final_delivery_archive_parts
  SET status = 'obsolete'
  WHERE archive_id = v_project.active_final_delivery_archive_id
    AND status IN ('pending','processing','failed');

  INSERT INTO public.final_delivery_archives(project_id, review_version, manifest, file_count, byte_size)
  VALUES (
    p_project_id, p_version::smallint, v_manifest, v_selected_count,
    (SELECT COALESCE(sum((entry->>'byte_size')::bigint), 0) FROM jsonb_array_elements(v_manifest) entry)
  ) RETURNING id INTO v_archive_id;

  UPDATE public.projects
  SET status = CASE WHEN p_version = 1 THEN 'reviewing_v1' ELSE 'reviewing_v2' END,
      active_final_delivery_archive_id = v_archive_id,
      updated_at = now()
  WHERE id = p_project_id;
  RETURN v_archive_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_retouch_delivery_archive(
  p_project_id UUID,
  p_delivered BOOLEAN
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_archive_id UUID;
BEGIN
  SELECT active_final_delivery_archive_id INTO v_archive_id
  FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_archive_id IS NULL THEN RETURN; END IF;
  IF p_delivered THEN
    UPDATE public.final_delivery_archives SET finalized_at = now() WHERE id = v_archive_id;
  ELSE
    UPDATE public.final_delivery_archives SET status = 'obsolete' WHERE id = v_archive_id;
    UPDATE public.final_delivery_archive_parts SET status = 'obsolete'
      WHERE archive_id = v_archive_id AND status IN ('pending','processing','failed');
    UPDATE public.projects SET active_final_delivery_archive_id = NULL WHERE id = p_project_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_final_delivery_archives(p_limit INT DEFAULT 1)
RETURNS SETOF public.final_delivery_archives
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY UPDATE public.final_delivery_archives
  SET status = 'processing', processing_started_at = now(), attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.final_delivery_archives WHERE status = 'pending'
    ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_final_delivery_archive_parts(p_limit INT DEFAULT 1)
RETURNS SETOF public.final_delivery_archive_parts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY UPDATE public.final_delivery_archive_parts p
  SET status = 'processing', processing_started_at = now(), attempts = attempts + 1
  WHERE p.id IN (
    SELECT part.id FROM public.final_delivery_archive_parts part
    JOIN public.final_delivery_archives a ON a.id = part.archive_id
    WHERE part.status = 'pending' AND a.status = 'processing'
    ORDER BY part.created_at LIMIT p_limit FOR UPDATE OF part SKIP LOCKED
  ) RETURNING p.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_final_delivery_archive_part(
  p_part_id UUID, p_archive_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.final_delivery_archive_parts
  SET status = 'completed', completed_at = now(), processing_started_at = NULL
  WHERE id = p_part_id AND status = 'processing';
  IF NOT EXISTS (
    SELECT 1 FROM public.final_delivery_archive_parts
    WHERE archive_id = p_archive_id AND status <> 'completed'
  ) THEN
    UPDATE public.final_delivery_archives
    SET status = 'ready', completed_at = now(), processing_started_at = NULL
    WHERE id = p_archive_id AND status = 'processing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_final_delivery_archive_part(
  p_part_id UUID, p_archive_id UUID, p_last_error TEXT, p_permanent BOOLEAN DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_permanent THEN
    UPDATE public.final_delivery_archive_parts SET status = 'failed', last_error = p_last_error
      WHERE id = p_part_id AND status = 'processing';
    UPDATE public.final_delivery_archives SET status = 'failed', last_error = p_last_error,
      processing_started_at = NULL WHERE id = p_archive_id AND status = 'processing';
  ELSE
    UPDATE public.final_delivery_archive_parts SET status = 'pending', last_error = p_last_error,
      processing_started_at = NULL WHERE id = p_part_id AND status = 'processing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stuck_final_delivery_archives(p_stuck_minutes INT DEFAULT 15)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.final_delivery_archives a
  SET status = 'pending', processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
    AND NOT EXISTS (SELECT 1 FROM public.final_delivery_archive_parts p WHERE p.archive_id = a.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stuck_final_delivery_parts(p_stuck_minutes INT DEFAULT 45)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.final_delivery_archive_parts
  SET status = 'pending', processing_started_at = NULL
  WHERE status = 'processing' AND attempts < max_attempts
    AND processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.final_delivery_archive_parts
  SET status = 'failed', processing_started_at = NULL, last_error = 'stuck timeout exceeded'
  WHERE status = 'processing' AND attempts >= max_attempts
    AND processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval;
  UPDATE public.final_delivery_archives a SET status = 'failed', processing_started_at = NULL,
    last_error = 'archive part retry limit exceeded'
  WHERE status = 'processing' AND EXISTS (
    SELECT 1 FROM public.final_delivery_archive_parts p WHERE p.archive_id = a.id AND p.status = 'failed'
  );
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.start_retouch_review_with_archive(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_retouch_delivery_archive(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_final_delivery_archives(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_final_delivery_archive_parts(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_final_delivery_archive_part(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_final_delivery_archive_part(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stuck_final_delivery_archives(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_stuck_final_delivery_parts(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_retouch_review_with_archive(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_retouch_delivery_archive(UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_final_delivery_archives(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_final_delivery_archive_parts(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_final_delivery_archive_part(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_final_delivery_archive_part(UUID, UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stuck_final_delivery_archives(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stuck_final_delivery_parts(INT) TO service_role;

ALTER TABLE public.final_delivery_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_delivery_archive_parts ENABLE ROW LEVEL SECURITY;
