-- 셀프 고객 사진의 AI 장면(촬영 시각 공백으로 나누고 Gemini가 촬영 종류별 장면 목록 중 이름을 고른다).
-- clip-service의 유사컷 분석 실행이 이어서 만든다. 다시 정리하면 프로젝트 장면을 지우고 새로 만든다.

CREATE TABLE IF NOT EXISTS public.customer_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  scene_index integer NOT NULL,
  name text,
  start_at timestamp,
  end_at timestamp,
  photo_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_scenes_project_idx
  ON public.customer_scenes(project_id, scene_index);

ALTER TABLE public.customer_photos
  ADD COLUMN IF NOT EXISTS scene_id uuid
  REFERENCES public.customer_scenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_photos_scene_idx
  ON public.customer_photos(scene_id);

ALTER TABLE public.customer_scenes ENABLE ROW LEVEL SECURITY;
