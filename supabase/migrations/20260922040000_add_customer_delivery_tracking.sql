ALTER TABLE public.customer_projects
  ADD COLUMN IF NOT EXISTS delivery_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivered_at timestamptz;

UPDATE public.customer_projects
SET delivery_count = 1,
    last_delivered_at = COALESCE(last_delivered_at, updated_at, created_at)
WHERE exported = true AND delivery_count = 0;

ALTER TABLE public.customer_projects
  DROP CONSTRAINT IF EXISTS customer_projects_delivery_count_nonnegative;

ALTER TABLE public.customer_projects
  ADD CONSTRAINT customer_projects_delivery_count_nonnegative CHECK (delivery_count >= 0);

COMMENT ON COLUMN public.customer_projects.delivery_count IS '현재 결과를 작가에게 전달 완료로 표시한 누적 횟수';
COMMENT ON COLUMN public.customer_projects.last_delivered_at IS '가장 최근 전달 완료 시각';
