-- 베타 신청자의 실제 사용 행동을 관찰하기 위한 최소 이벤트 테이블(plan/beta-system.md §8.4, §12 4단계).
-- project_logs(project_id NOT NULL, 프로젝트 상태 머신 전용)가 커버하지 못하는 프로젝트 비종속
-- 이벤트(회원가입/첫로그인)와, 프로젝트에는 연결되지만 상태 전이가 아닌 조회성 이벤트(고객 링크 접속)를
-- 담는다. 프로젝트 생성/사진업로드/셀렉완료/납품완료 등은 이미 project_logs/projects로 확인 가능해
-- 여기서 다시 기록하지 않는다.
CREATE TABLE public.beta_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid REFERENCES public.photographers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('signup_completed', 'first_login', 'customer_link_visited')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb
);

CREATE INDEX idx_beta_usage_events_photographer ON public.beta_usage_events(photographer_id, occurred_at DESC);
CREATE INDEX idx_beta_usage_events_project ON public.beta_usage_events(project_id);

-- 작가 단위 이벤트(signup_completed/first_login, project_id는 항상 null)는 작가+타입당 1건만 —
-- 애플리케이션에서 "이미 기록됐는지" 조회 없이 그냥 insert 후 유니크 위반이면 무시하는 방식으로
-- 멱등성을 보장한다(회원가입/로그인처럼 자주 발생하는 경로에서 매번 SELECT를 먼저 하지 않기 위함).
CREATE UNIQUE INDEX idx_beta_usage_events_photographer_type_unique
  ON public.beta_usage_events(photographer_id, event_type)
  WHERE photographer_id IS NOT NULL AND project_id IS NULL;

-- 프로젝트 단위 이벤트(customer_link_visited)도 프로젝트당 1건만 — 고객이 링크를 여러 번 열어도
-- "최초 접속" 시점만 남긴다. 고객 트래픽 경로라 매 요청 SELECT를 피하려는 목적도 동일하다.
CREATE UNIQUE INDEX idx_beta_usage_events_project_type_unique
  ON public.beta_usage_events(project_id, event_type)
  WHERE project_id IS NOT NULL;

-- 모든 읽기/쓰기는 서버(service role)를 통해서만 수행한다.
ALTER TABLE public.beta_usage_events ENABLE ROW LEVEL SECURITY;
