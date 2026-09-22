ALTER TABLE public.customer_projects
  ADD COLUMN IF NOT EXISTS lifetime_uploaded_count integer NOT NULL DEFAULT 0;

UPDATE public.customer_projects
SET lifetime_uploaded_count = photo_count
WHERE lifetime_uploaded_count = 0 AND photo_count > 0;

ALTER TABLE public.customer_projects
  DROP CONSTRAINT IF EXISTS customer_projects_lifetime_uploaded_count_nonnegative;

ALTER TABLE public.customer_projects
  ADD CONSTRAINT customer_projects_lifetime_uploaded_count_nonnegative
  CHECK (lifetime_uploaded_count >= 0);

COMMENT ON COLUMN public.customer_projects.lifetime_uploaded_count IS
  '삭제 여부와 무관한 프로젝트 누적 성공 업로드 장수. 유료 정책 측정용이며 현재 제한에는 사용하지 않는다.';
