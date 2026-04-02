-- R2에 저장된 보정본 바이트 수 (리사이즈·JPEG 인코딩 후)
ALTER TABLE public.photo_versions ADD COLUMN IF NOT EXISTS file_size bigint;

COMMENT ON COLUMN public.photo_versions.file_size IS 'Bytes of object stored in R2 after resize/encode';
