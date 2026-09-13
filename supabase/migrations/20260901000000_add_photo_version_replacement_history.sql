-- 같은 보정 단계(V1 또는 V2)에서 파일을 교체해도 이전 파일과 검토 결과를 보존한다.
-- 고객에게 노출되는 현재 보정본은 photo_versions에 그대로 유지하고, 이 테이블은
-- 작가 상세보기의 교체 이력만 담당한다. 보정/재보정 회차와 projects.status는 변경하지 않는다.

CREATE TABLE IF NOT EXISTS public.photo_version_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL CHECK (version IN (1, 2)),
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  source_photo_version_id UUID,
  r2_url TEXT NOT NULL,
  r2_thumb_url TEXT,
  photographer_memo TEXT,
  file_size BIGINT,
  filename TEXT,
  r2_delivery_url TEXT,
  delivery_filename TEXT,
  delivery_file_size BIGINT,
  delivery_content_type TEXT,
  delivery_ready_at TIMESTAMPTZ,
  review_status TEXT CHECK (review_status IN ('approved', 'revision_requested')),
  customer_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  review_created_at TIMESTAMPTZ,
  original_created_at TIMESTAMPTZ NOT NULL,
  superseded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photo_id, version, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_photo_version_revisions_photo_version
  ON public.photo_version_revisions(photo_id, version, revision_no DESC);

ALTER TABLE public.photo_version_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.photo_version_revisions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.photo_version_revisions TO service_role;


CREATE OR REPLACE FUNCTION public.replace_photo_versions_with_history(p_rows JSONB)
RETURNS SETOF public.photo_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_photo_id UUID;
  v_version SMALLINT;
  v_existing public.photo_versions%ROWTYPE;
  v_saved public.photo_versions%ROWTYPE;
  v_review public.version_reviews%ROWTYPE;
  v_has_existing BOOLEAN;
  v_has_review BOOLEAN;
  v_revision_no INTEGER;
BEGIN
  IF p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'photo version rows are required' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN
    -- 여러 요청이 같은 사진 묶음을 서로 다른 순서로 교체해도 잠금 순서가 같도록 한다.
    SELECT value
    FROM jsonb_array_elements(p_rows)
    ORDER BY value->>'photo_id', (value->>'version')::SMALLINT
  LOOP
    v_photo_id := NULLIF(v_row->>'photo_id', '')::UUID;
    v_version := NULLIF(v_row->>'version', '')::SMALLINT;

    IF v_photo_id IS NULL OR v_version NOT IN (1, 2) THEN
      RAISE EXCEPTION 'valid photo_id and version are required' USING ERRCODE = '22023';
    END IF;

    -- 같은 사진에 대한 동시 교체를 직렬화한다. 프로젝트/검토 상태는 건드리지 않는다.
    PERFORM 1 FROM public.photos WHERE id = v_photo_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'photo not found' USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.photo_versions
    WHERE photo_id = v_photo_id
      AND version = v_version
    FOR UPDATE;
    v_has_existing := FOUND;

    IF v_has_existing THEN
      -- 응답 유실 뒤 같은 업로드를 재시도한 경우에는 동일 파일을 다시 이력으로 남기지 않는다.
      IF v_existing.r2_url = v_row->>'r2_url'
         AND v_existing.r2_thumb_url IS NOT DISTINCT FROM NULLIF(v_row->>'r2_thumb_url', '')
         AND v_existing.r2_delivery_url IS NOT DISTINCT FROM NULLIF(v_row->>'r2_delivery_url', '') THEN
        RETURN NEXT v_existing;
        CONTINUE;
      END IF;

      SELECT *
      INTO v_review
      FROM public.version_reviews
      WHERE photo_version_id = v_existing.id
      LIMIT 1
      FOR UPDATE;
      v_has_review := FOUND;

      IF v_has_review AND v_review.status = 'approved' THEN
        RAISE EXCEPTION 'approved photo versions cannot be replaced' USING ERRCODE = 'P0001';
      END IF;

      SELECT COALESCE(MAX(revision_no), 0) + 1
      INTO v_revision_no
      FROM public.photo_version_revisions
      WHERE photo_id = v_photo_id
        AND version = v_version;

      INSERT INTO public.photo_version_revisions (
        photo_id,
        version,
        revision_no,
        source_photo_version_id,
        r2_url,
        r2_thumb_url,
        photographer_memo,
        file_size,
        filename,
        r2_delivery_url,
        delivery_filename,
        delivery_file_size,
        delivery_content_type,
        delivery_ready_at,
        review_status,
        customer_comment,
        reviewed_at,
        review_created_at,
        original_created_at
      ) VALUES (
        v_existing.photo_id,
        v_existing.version,
        v_revision_no,
        v_existing.id,
        v_existing.r2_url,
        v_existing.r2_thumb_url,
        v_existing.photographer_memo,
        v_existing.file_size,
        v_existing.filename,
        v_existing.r2_delivery_url,
        v_existing.delivery_filename,
        v_existing.delivery_file_size,
        v_existing.delivery_content_type,
        v_existing.delivery_ready_at,
        CASE WHEN v_has_review THEN v_review.status ELSE NULL END,
        CASE WHEN v_has_review THEN v_review.customer_comment ELSE NULL END,
        CASE WHEN v_has_review THEN v_review.reviewed_at ELSE NULL END,
        CASE WHEN v_has_review THEN v_review.created_at ELSE NULL END,
        v_existing.created_at
      );

      -- 현재 보정본의 검토 결과만 초기화한다. 방금 저장한 과거 검토 결과는 유지된다.
      DELETE FROM public.version_reviews
      WHERE photo_version_id = v_existing.id;

      UPDATE public.photo_versions
      SET r2_url = v_row->>'r2_url',
          r2_thumb_url = NULLIF(v_row->>'r2_thumb_url', ''),
          photographer_memo = NULLIF(v_row->>'photographer_memo', ''),
          file_size = NULLIF(v_row->>'file_size', '')::BIGINT,
          filename = NULLIF(v_row->>'filename', ''),
          r2_delivery_url = NULLIF(v_row->>'r2_delivery_url', ''),
          delivery_filename = NULLIF(v_row->>'delivery_filename', ''),
          delivery_file_size = NULLIF(v_row->>'delivery_file_size', '')::BIGINT,
          delivery_content_type = NULLIF(v_row->>'delivery_content_type', ''),
          delivery_ready_at = NULLIF(v_row->>'delivery_ready_at', '')::TIMESTAMPTZ,
          created_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_saved;
    ELSE
      INSERT INTO public.photo_versions (
        photo_id,
        version,
        r2_url,
        r2_thumb_url,
        photographer_memo,
        file_size,
        filename,
        r2_delivery_url,
        delivery_filename,
        delivery_file_size,
        delivery_content_type,
        delivery_ready_at
      ) VALUES (
        v_photo_id,
        v_version,
        v_row->>'r2_url',
        NULLIF(v_row->>'r2_thumb_url', ''),
        NULLIF(v_row->>'photographer_memo', ''),
        NULLIF(v_row->>'file_size', '')::BIGINT,
        NULLIF(v_row->>'filename', ''),
        NULLIF(v_row->>'r2_delivery_url', ''),
        NULLIF(v_row->>'delivery_filename', ''),
        NULLIF(v_row->>'delivery_file_size', '')::BIGINT,
        NULLIF(v_row->>'delivery_content_type', ''),
        NULLIF(v_row->>'delivery_ready_at', '')::TIMESTAMPTZ
      )
      RETURNING * INTO v_saved;
    END IF;

    RETURN NEXT v_saved;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.photo_version_revisions IS
  'Immutable snapshots of replaced files within the same V1/V2 retouch stage.';
COMMENT ON FUNCTION public.replace_photo_versions_with_history(JSONB) IS
  'Atomically archives replaceable retouch files and reviews, rejects approved versions, then writes the current V1/V2 files without advancing workflow state.';

REVOKE ALL ON FUNCTION public.replace_photo_versions_with_history(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_photo_versions_with_history(JSONB) TO service_role;
