DROP TABLE IF EXISTS public.project_logs;

CREATE TABLE public.project_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'uploaded', 'selecting', 'confirmed', 'editing')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_logs_photographer_created
  ON public.project_logs(photographer_id, created_at DESC);

ALTER TABLE public.project_logs ENABLE ROW LEVEL SECURITY;

-- photographer_id = photographers.id, auth_id = auth.uid() (둘 다 uuid, 캐스팅 없음)
CREATE POLICY "작가는 본인 project_logs 조회"
  ON public.project_logs FOR SELECT
  USING (
    photographer_id IN (SELECT id FROM public.photographers WHERE auth_id = auth.uid())
  );