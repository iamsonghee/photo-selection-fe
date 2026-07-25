-- 원본(납품) 파일을 초기 업로드 시 함께 저장하는 구조로 변경
-- photos 테이블에 원본 URL 컬럼 추가, delivery_files 테이블 제거

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS r2_original_url TEXT,
  ADD COLUMN IF NOT EXISTS original_uploaded_at TIMESTAMPTZ;

-- RPC 함수 업데이트: r2_original_url, original_uploaded_at 컬럼 포함
CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id uuid, p_rows jsonb)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::integer INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  RETURN QUERY
  INSERT INTO public.photos (project_id, number, r2_thumb_url, r2_preview_url, file_size, original_filename, r2_original_url, original_uploaded_at)
  SELECT
    p_project_id,
    v_base + idx::integer,
    row_data->>'r2_thumb_url',
    row_data->>'r2_preview_url',
    (row_data->>'file_size')::integer,
    row_data->>'original_filename',
    NULLIF(row_data->>'r2_original_url', ''),
    (row_data->>'original_uploaded_at')::timestamptz
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.insert_photos_with_numbers(uuid, jsonb) IS
  'Atomically locks the project row, computes max(photos.number), and inserts the given rows with sequential numbers in one transaction. Supports optional r2_original_url and original_uploaded_at for original file storage.';

-- delivery_files 테이블 제거 (원본 정보는 photos 테이블로 통합)
DROP TABLE IF EXISTS public.delivery_files;
