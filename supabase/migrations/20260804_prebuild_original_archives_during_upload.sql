-- 업로드 중 완료된 원본 묶음은 임시 ZIP으로 미리 만든다.
-- 고객에게 노출되는 original_archive_parts와 분리했기 때문에, 작가가 사진을 더
-- 추가하거나 전체 삭제해도 고객용 아카이브의 구성은 바뀌지 않는다.

CREATE TABLE IF NOT EXISTS public.original_archive_staging_parts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    part_number            INT NOT NULL,
    r2_key                 TEXT NOT NULL,
    file_count             INT NOT NULL,
    byte_size              BIGINT NOT NULL,
    manifest               JSONB NOT NULL DEFAULT '[]'::jsonb,
    status                 TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','completed','failed')),
    attempts               INT NOT NULL DEFAULT 0,
    max_attempts           INT NOT NULL DEFAULT 3,
    last_error             TEXT,
    processing_started_at  TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_staging_archive_project_part UNIQUE (project_id, part_number)
);

CREATE INDEX IF NOT EXISTS staging_archive_parts_pending_idx
    ON public.original_archive_staging_parts(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS staging_archive_parts_processing_idx
    ON public.original_archive_staging_parts(processing_started_at) WHERE status = 'processing';

-- 아직 어떤 임시 ZIP에도 들어가지 않은 완료 원본이 target을 채웠을 때에만 한 파트를 만든다.
-- 프로젝트별 advisory lock으로 원본 워커가 여럿이어도 같은 사진을 두 번 담지 않는다.
CREATE OR REPLACE FUNCTION public.enqueue_original_archive_staging_part(
    p_project_id UUID,
    p_target_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_photo RECORD;
    v_manifest JSONB := '[]'::jsonb;
    v_size BIGINT := 0;
    v_count INT := 0;
    v_part_number INT;
    v_part_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text));

    FOR v_photo IN
        SELECT p.id, COALESCE(p.original_compressed_size, 20971520) AS bytes
        FROM public.photos p
        WHERE p.project_id = p_project_id
          AND p.original_status = 'completed'
          AND NOT EXISTS (
              SELECT 1
              FROM public.original_archive_staging_parts s
              WHERE s.project_id = p_project_id
                AND s.status IN ('pending', 'processing', 'completed')
                AND s.manifest @> jsonb_build_array(to_jsonb(p.id::text))
          )
        ORDER BY p.number
    LOOP
        v_manifest := v_manifest || jsonb_build_array(v_photo.id::text);
        v_size := v_size + v_photo.bytes;
        v_count := v_count + 1;
        EXIT WHEN v_size >= p_target_bytes;
    END LOOP;

    IF v_count = 0 OR v_size < p_target_bytes THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(MAX(part_number), 0) + 1 INTO v_part_number
    FROM public.original_archive_staging_parts WHERE project_id = p_project_id;

    INSERT INTO public.original_archive_staging_parts
        (project_id, part_number, r2_key, file_count, byte_size, manifest)
    VALUES
        (p_project_id, v_part_number, '', v_count, v_size, v_manifest)
    RETURNING id INTO v_part_id;

    UPDATE public.original_archive_staging_parts
    SET r2_key = 'originals/archives/' || p_project_id::text || '/prebuilt-' || v_part_id::text || '.zip'
    WHERE id = v_part_id;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_original_archive_staging_parts(p_limit INT DEFAULT 1)
RETURNS SETOF public.original_archive_staging_parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.original_archive_staging_parts
  SET status = 'processing', processing_started_at = now(), attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.original_archive_staging_parts
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_original_archive_staging_part(
    p_part_id UUID,
    p_completed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.original_archive_staging_parts
  SET status = 'completed', completed_at = p_completed_at, processing_started_at = NULL
  WHERE id = p_part_id AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_original_archive_staging_part(
    p_part_id UUID,
    p_last_error TEXT,
    p_permanent BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.original_archive_staging_parts
  SET status = CASE WHEN p_permanent THEN 'failed' ELSE 'pending' END,
      last_error = p_last_error,
      processing_started_at = NULL
  WHERE id = p_part_id AND status = 'processing';
END;
$$;
