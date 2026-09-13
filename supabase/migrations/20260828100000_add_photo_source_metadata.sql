-- 원본 업로드 목록에서 가공 산출물(file_size)이 아닌 실제 선택 파일의 메타데이터를 표시한다.
-- source_width/source_height는 브라우저 압축 단계 또는 서버의 기존 썸네일 디코딩 단계에서
-- 얻으며, 메타데이터 수집을 위한 추가 이미지 디코딩은 하지 않는다.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS source_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS source_width INTEGER,
  ADD COLUMN IF NOT EXISTS source_height INTEGER,
  ADD COLUMN IF NOT EXISTS source_content_type TEXT,
  ADD COLUMN IF NOT EXISTS source_last_modified BIGINT;

COMMENT ON COLUMN public.photos.file_size IS
  'R2 thumbnail + preview JPEG byte total. Not the selected source file size.';
COMMENT ON COLUMN public.photos.source_file_size IS
  'Browser File.size of the user-selected source image before upload compression.';
COMMENT ON COLUMN public.photos.source_width IS
  'EXIF-oriented pixel width of the selected source image when available.';
COMMENT ON COLUMN public.photos.source_height IS
  'EXIF-oriented pixel height of the selected source image when available.';
COMMENT ON COLUMN public.photos.source_content_type IS
  'MIME type of the selected source image before upload compression.';
COMMENT ON COLUMN public.photos.source_last_modified IS
  'Browser File.lastModified of the selected source image in epoch milliseconds.';

-- 납품 원본 job이 있는 기존 사진은 신뢰할 수 있는 파일 메타데이터만 backfill한다.
-- 픽셀 크기는 기존 데이터로 추정하지 않는다.
WITH job_metadata AS (
  SELECT DISTINCT ON (photo_id)
    photo_id,
    original_file_size,
    original_content_type,
    original_last_modified
  FROM public.original_jobs
  WHERE original_file_size IS NOT NULL
     OR original_content_type IS NOT NULL
     OR original_last_modified IS NOT NULL
  ORDER BY photo_id, created_at DESC
)
UPDATE public.photos AS p
SET source_file_size = COALESCE(p.source_file_size, j.original_file_size),
    source_content_type = COALESCE(p.source_content_type, j.original_content_type),
    source_last_modified = COALESCE(p.source_last_modified, j.original_last_modified)
FROM job_metadata AS j
WHERE p.id = j.photo_id
  AND (
    p.source_file_size IS NULL
    OR p.source_content_type IS NULL
    OR p.source_last_modified IS NULL
  );

CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id UUID, p_rows JSONB)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base INTEGER;
  v_row JSONB;
  v_photo public.photos%ROWTYPE;
  v_job JSONB;
  v_client_upload_id UUID;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::INTEGER INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  FOR v_row IN
    SELECT row_data
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
    ORDER BY idx
  LOOP
    v_client_upload_id := NULLIF(v_row->>'client_upload_id', '')::UUID;

    IF v_client_upload_id IS NOT NULL THEN
      SELECT * INTO v_photo
      FROM public.photos
      WHERE project_id = p_project_id
        AND client_upload_id = v_client_upload_id;

      IF FOUND THEN
        -- 이전 서버가 DB 저장까지 마쳤으나 응답이 유실된 replay도 새 메타데이터로 보강한다.
        UPDATE public.photos AS replay_photo
        SET source_file_size = COALESCE(replay_photo.source_file_size, NULLIF(v_row->>'source_file_size', '')::BIGINT),
            source_width = COALESCE(replay_photo.source_width, NULLIF(v_row->>'source_width', '')::INTEGER),
            source_height = COALESCE(replay_photo.source_height, NULLIF(v_row->>'source_height', '')::INTEGER),
            source_content_type = COALESCE(replay_photo.source_content_type, NULLIF(v_row->>'source_content_type', '')),
            source_last_modified = COALESCE(replay_photo.source_last_modified, NULLIF(v_row->>'source_last_modified', '')::BIGINT)
        WHERE replay_photo.id = v_photo.id
        RETURNING * INTO v_photo;
        RETURN NEXT v_photo;
        CONTINUE;
      END IF;
    END IF;

    v_base := v_base + 1;
    INSERT INTO public.photos (
      project_id, number, r2_thumb_url, r2_preview_url,
      file_size, original_filename, r2_original_url,
      original_ready_at, original_status, client_upload_id,
      source_file_size, source_width, source_height,
      source_content_type, source_last_modified
    ) VALUES (
      p_project_id,
      v_base,
      v_row->>'r2_thumb_url',
      v_row->>'r2_preview_url',
      (v_row->>'file_size')::INTEGER,
      v_row->>'original_filename',
      NULLIF(v_row->>'r2_original_url', ''),
      (v_row->>'original_ready_at')::TIMESTAMPTZ,
      NULLIF(v_row->>'original_status', ''),
      v_client_upload_id,
      NULLIF(v_row->>'source_file_size', '')::BIGINT,
      NULLIF(v_row->>'source_width', '')::INTEGER,
      NULLIF(v_row->>'source_height', '')::INTEGER,
      NULLIF(v_row->>'source_content_type', ''),
      NULLIF(v_row->>'source_last_modified', '')::BIGINT
    )
    RETURNING * INTO v_photo;

    v_job := v_row->'_original_job';
    IF v_job IS NOT NULL AND jsonb_typeof(v_job) = 'object' THEN
      INSERT INTO public.original_jobs (
        photo_id, project_id, r2_source_key, source_content_type, status,
        original_filename, original_file_size, original_last_modified, original_content_type
      ) VALUES (
        v_photo.id,
        p_project_id,
        v_job->>'r2_source_key',
        v_job->>'source_content_type',
        'awaiting_upload',
        NULLIF(v_job->>'original_filename', ''),
        NULLIF(v_job->>'original_file_size', '')::BIGINT,
        NULLIF(v_job->>'original_last_modified', '')::BIGINT,
        NULLIF(v_job->>'original_content_type', '')
      );
    END IF;

    RETURN NEXT v_photo;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) IS
  'Idempotently inserts sequential photos, source metadata, and original jobs using (project_id, client_upload_id).';

REVOKE ALL ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) TO service_role;
