-- selections 테이블 RLS: 고객 플로우는 API Route(Service Role)로 처리하므로
-- 여기서는 작가(authenticated)만 본인 프로젝트 selections 조회 가능하도록 함.
--
-- 참고: projects.photographer_id 가 photographers.id 를 참조하면 아래처럼 변경:
--   WHERE photographer_id IN (SELECT id FROM public.photographers WHERE auth_id = auth.uid())

ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "작가는 본인 프로젝트 selections 조회" ON public.selections;

CREATE POLICY "작가는 본인 프로젝트 selections 조회"
  ON public.selections FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE photographer_id = auth.uid()
    )
  );
