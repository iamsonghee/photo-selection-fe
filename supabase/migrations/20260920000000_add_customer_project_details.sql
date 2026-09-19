ALTER TABLE public.customer_projects
  ADD COLUMN IF NOT EXISTS shoot_date date,
  ADD COLUMN IF NOT EXISTS selection_deadline date,
  ADD COLUMN IF NOT EXISTS studio_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_projects_studio_name_length'
  ) THEN
    ALTER TABLE public.customer_projects
      ADD CONSTRAINT customer_projects_studio_name_length
      CHECK (studio_name IS NULL OR char_length(studio_name) <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.customer_projects.shoot_date IS '셀프 고객 프로젝트 촬영일';
COMMENT ON COLUMN public.customer_projects.selection_deadline IS '셀프 고객 프로젝트 셀렉 마감일';
COMMENT ON COLUMN public.customer_projects.studio_name IS '외부 작가 또는 스튜디오명';
