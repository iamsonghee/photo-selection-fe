-- 운영 DB의 legacy projects 테이블에는 delivered_at이 없어 납품 완료 후
-- 최종 보정본 다운로드 API가 프로젝트를 조회하지 못했다.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- 기존 코드는 상태 전환과 updated_at을 같은 시각으로 저장했다. 운영의 기존
-- delivered 행은 모두 이 값을 실제 납품 시각의 복구 근거로 사용한다.
UPDATE public.projects
SET delivered_at = COALESCE(updated_at, created_at, now())
WHERE status = 'delivered'
  AND delivered_at IS NULL;

-- 앱/API/RPC/관리 콘솔 등 어떤 쓰기 경로를 사용하더라도 delivered 전환과
-- delivered_at 기록이 같은 DB 트랜잭션에서 일어나도록 보장한다.
CREATE OR REPLACE FUNCTION public.ensure_project_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_ensure_delivered_at ON public.projects;
CREATE TRIGGER projects_ensure_delivered_at
BEFORE INSERT OR UPDATE OF status, delivered_at ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.ensure_project_delivered_at();

-- 트리거를 우회하는 비정상 데이터도 스키마 불변식으로 거부한다.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_delivered_at_required;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_delivered_at_required
  CHECK (status <> 'delivered' OR delivered_at IS NOT NULL);
