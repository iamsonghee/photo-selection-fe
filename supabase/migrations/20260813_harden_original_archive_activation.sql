-- 원본 포함 프로젝트의 활성화/원본 job 생성을 원자화한다.
-- 1) 모든 원본이 completed일 때만 preparing -> selecting + archive pending을 한 트랜잭션에서 수행
-- 2) photo INSERT와 original_job INSERT를 같은 RPC 트랜잭션에 묶어 고아 awaiting_upload 사진 방지
-- 3) 과거 고아 awaiting_upload 사진에는 파일명 기반 복구가 가능한 failed job을 생성

CREATE OR REPLACE FUNCTION public.activate_project_with_original_archive(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_project.status <> 'preparing' OR v_project.include_original IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.photos
    WHERE project_id = p_project_id AND original_status = 'completed'
  ) OR EXISTS (
    SELECT 1 FROM public.photos
    WHERE project_id = p_project_id
      AND original_status IS DISTINCT FROM 'completed'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.projects
  SET status = 'selecting',
      updated_at = now(),
      original_download_started_at = COALESCE(original_download_started_at, now()),
      original_archive_status = COALESCE(original_archive_status, 'pending'),
      original_archive_processing_started_at = NULL
  WHERE id = p_project_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_project_with_original_archive(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_project_with_original_archive(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id UUID, p_rows JSONB)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base INTEGER;
  v_row JSONB;
  v_idx BIGINT;
  v_photo public.photos%ROWTYPE;
  v_job JSONB;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::INTEGER INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  FOR v_row, v_idx IN
    SELECT row_data, idx
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
  LOOP
    INSERT INTO public.photos (
      project_id, number, r2_thumb_url, r2_preview_url,
      file_size, original_filename, r2_original_url,
      original_ready_at, original_status
    ) VALUES (
      p_project_id,
      v_base + v_idx::INTEGER,
      v_row->>'r2_thumb_url',
      v_row->>'r2_preview_url',
      (v_row->>'file_size')::INTEGER,
      v_row->>'original_filename',
      NULLIF(v_row->>'r2_original_url', ''),
      (v_row->>'original_ready_at')::TIMESTAMPTZ,
      NULLIF(v_row->>'original_status', '')
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
  'Atomically inserts sequentially numbered photos and optional nested _original_job rows.';

-- 과거 코드에서 photo INSERT 뒤 job INSERT가 실패해 남은 고아 행을 복구 가능한 job으로 전환한다.
-- 원본 size/lastModified를 알 수 없으므로 FE는 이 job에 한해 파일명 일치로 복구한다.
INSERT INTO public.original_jobs (
  photo_id, project_id, r2_source_key, source_content_type, status,
  original_filename, original_content_type, last_error
)
SELECT
  p.id,
  p.project_id,
  'originals/source/' || p.project_id::TEXT || '/' || replace(p.id::TEXT, '-', '') ||
    CASE
      WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.png' THEN '.png'
      WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.webp' THEN '.webp'
      ELSE '.jpg'
    END,
  CASE
    WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.png' THEN 'image/png'
    WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.webp' THEN 'image/webp'
    ELSE 'image/jpeg'
  END,
  'failed',
  p.original_filename,
  CASE
    WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.png' THEN 'image/png'
    WHEN lower(COALESCE(p.original_filename, '')) LIKE '%.webp' THEN 'image/webp'
    ELSE 'image/jpeg'
  END,
  'missing original job repaired; source file must be reselected'
FROM public.photos p
WHERE p.original_status = 'awaiting_upload'
  AND NOT EXISTS (
    SELECT 1 FROM public.original_jobs j WHERE j.photo_id = p.id
  )
ON CONFLICT (photo_id, job_type) DO NOTHING;

UPDATE public.photos p
SET original_status = 'failed'
WHERE p.original_status = 'awaiting_upload'
  AND EXISTS (
    SELECT 1 FROM public.original_jobs j
    WHERE j.photo_id = p.id
      AND j.last_error = 'missing original job repaired; source file must be reselected'
  );
