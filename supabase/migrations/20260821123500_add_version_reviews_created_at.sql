-- 운영 DB의 legacy version_reviews 테이블에는 created_at이 없어
-- start_retouch_review_with_archive()의 최신 검토 결과 조회가 실패했다.
ALTER TABLE public.version_reviews
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
