-- R2에 저장된 썸네일+미리보기 JPEG 합계 바이트 (없으면 NULL)
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS file_size bigint;

COMMENT ON COLUMN public.photos.file_size IS 'Total bytes on R2: thumb JPEG + preview JPEG after encode';
