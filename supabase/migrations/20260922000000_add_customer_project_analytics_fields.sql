ALTER TABLE public.customer_projects
  ADD COLUMN IF NOT EXISTS photographer_name text,
  ADD COLUMN IF NOT EXISTS shoot_region text,
  ADD COLUMN IF NOT EXISTS shoot_location text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_projects_photographer_name_length') THEN
    ALTER TABLE public.customer_projects ADD CONSTRAINT customer_projects_photographer_name_length
      CHECK (photographer_name IS NULL OR char_length(photographer_name) <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_projects_shoot_region_length') THEN
    ALTER TABLE public.customer_projects ADD CONSTRAINT customer_projects_shoot_region_length
      CHECK (shoot_region IS NULL OR char_length(shoot_region) <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_projects_shoot_location_length') THEN
    ALTER TABLE public.customer_projects ADD CONSTRAINT customer_projects_shoot_location_length
      CHECK (shoot_location IS NULL OR char_length(shoot_location) <= 150);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_projects_shoot_type_valid') THEN
    ALTER TABLE public.customer_projects ADD CONSTRAINT customer_projects_shoot_type_valid
      CHECK (shoot_type IS NULL OR shoot_type IN ('wedding', 'family', 'graduation', 'profile', 'etc'));
  END IF;
END $$;

COMMENT ON COLUMN public.customer_projects.studio_name IS '촬영을 맡긴 스튜디오 또는 업체명';
COMMENT ON COLUMN public.customer_projects.photographer_name IS '촬영을 담당한 작가명';
COMMENT ON COLUMN public.customer_projects.shoot_region IS '사용자가 입력한 촬영 지역';
COMMENT ON COLUMN public.customer_projects.shoot_location IS '사용자가 입력한 구체적인 촬영 장소명';
