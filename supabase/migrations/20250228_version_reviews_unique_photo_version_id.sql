-- version_reviews.photo_version_id 에 UNIQUE 제약이 없으면 upsert(..., onConflict: "photo_version_id") 가 실패함.
-- 테이블이 마이그레이션 없이 생성된 경우 등에 대비해 제약 추가. 이미 있으면 스킵.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'version_reviews_photo_version_id_key'
      AND conrelid = 'public.version_reviews'::regclass
  ) THEN
    ALTER TABLE public.version_reviews
    ADD CONSTRAINT version_reviews_photo_version_id_key
    UNIQUE (photo_version_id);
  END IF;
END $$;
