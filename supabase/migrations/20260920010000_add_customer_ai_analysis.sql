-- 셀프 고객 사진용 Gemini 분석 저장소.
-- 기존 projects/photos 분석 테이블과 분리해 작가 프로젝트 상태와 섞이지 않게 한다.

CREATE TABLE IF NOT EXISTS public.customer_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('similarity', 'quality')),
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  image_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_ai_runs_project_kind_idx
  ON public.customer_ai_runs(project_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_ai_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.customer_photos(id) ON DELETE CASCADE,
  model text NOT NULL,
  dimension integer NOT NULL,
  version text NOT NULL,
  embedding double precision[] NOT NULL,
  source_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, photo_id, model, dimension, version)
);

CREATE TABLE IF NOT EXISTS public.customer_photo_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  representative_photo_id uuid REFERENCES public.customer_photos(id) ON DELETE SET NULL,
  photo_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_photos
  ADD COLUMN IF NOT EXISTS similarity_group_id uuid
  REFERENCES public.customer_photo_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_photos_similarity_group_idx
  ON public.customer_photos(similarity_group_id);

CREATE TABLE IF NOT EXISTS public.customer_quality_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.customer_photos(id) ON DELETE CASCADE,
  model text NOT NULL,
  prompt_version text NOT NULL,
  eyes_closed text NOT NULL CHECK (eyes_closed IN ('ok', 'possible', 'likely', 'unknown')),
  blur_or_shake text NOT NULL CHECK (blur_or_shake IN ('ok', 'possible', 'likely', 'unknown')),
  focus_issue text NOT NULL CHECK (focus_issue IN ('ok', 'possible', 'likely', 'unknown')),
  face_occluded text NOT NULL CHECK (face_occluded IN ('ok', 'possible', 'likely', 'unknown')),
  primary_subject_detected boolean,
  notes text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, photo_id, model, prompt_version)
);

ALTER TABLE public.customer_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_photo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_quality_assessments ENABLE ROW LEVEL SECURITY;
