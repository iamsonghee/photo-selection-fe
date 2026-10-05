-- 작가 업로드 사진의 원본 촬영 시각. 나중에 이미지 분석(장면 나누기 등)에 쓰려고 지금부터 모아 둔다.
-- 셀프 고객(customer_photos.taken_at/taken_at_source)과 같은 방식: 브라우저가 압축 전 원본 EXIF
-- (DateTimeOriginal, 없으면 파일 수정 시각)를 읽어 보내고, 카메라 시계에는 시간대가 없으므로
-- timestamp(시간대 없음)로 저장한다. 출처는 'exif' | 'file'. 기존 사진은 NULL이다.
-- BE는 이 마이그레이션 전후 어느 쪽에 배포돼도 된다 — 이전 함수는 row JSON의 taken_at 키를 읽지 않고 무시한다.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS taken_at_source TEXT CHECK (taken_at_source IN ('exif', 'file'));

COMMENT ON COLUMN public.photos.taken_at IS
  'Camera-local capture time (no time zone) read by the browser from the source file before compression.';
COMMENT ON COLUMN public.photos.taken_at_source IS
  'Where taken_at came from: exif (DateTimeOriginal) or file (File.lastModified fallback).';

-- 20260828100000_add_photo_source_metadata.sql의 정의에 taken_at·taken_at_source만 더했다.
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
            source_last_modified = COALESCE(replay_photo.source_last_modified, NULLIF(v_row->>'source_last_modified', '')::BIGINT),
            taken_at = COALESCE(replay_photo.taken_at, NULLIF(v_row->>'taken_at', '')::TIMESTAMP),
            taken_at_source = COALESCE(replay_photo.taken_at_source, NULLIF(v_row->>'taken_at_source', ''))
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
      source_content_type, source_last_modified,
      taken_at, taken_at_source
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
      NULLIF(v_row->>'source_last_modified', '')::BIGINT,
      NULLIF(v_row->>'taken_at', '')::TIMESTAMP,
      NULLIF(v_row->>'taken_at_source', '')
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
  'Idempotently inserts sequential photos, source metadata, taken_at, and original jobs using (project_id, client_upload_id).';

REVOKE ALL ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) TO service_role;
