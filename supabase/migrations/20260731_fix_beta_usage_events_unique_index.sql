-- 버그 수정: 프로젝트 삭제 시 "duplicate key value violates unique constraint
-- idx_beta_usage_events_photographer_type_unique" 오류로 삭제 자체가 실패하는 문제.
--
-- 원인: beta_usage_events.project_id는 ON DELETE SET NULL이라, 프로젝트 삭제 시
-- 해당 프로젝트에 연결된 customer_link_visited 행의 project_id가 같은 트랜잭션 안에서
-- NULL로 바뀐다. 기존 idx_beta_usage_events_photographer_type_unique는
-- "photographer_id + event_type, project_id IS NULL"만 걸러서 signup_completed/
-- first_login(원래부터 project_id가 항상 null인 작가 단위 이벤트) 멱등성을 보장하려던
-- 것인데, event_type 조건이 없어 customer_link_visited까지 함께 걸린다. 한 작가가
-- 고객 방문 기록이 있는 프로젝트를 두 개 이상 삭제하면, 두 번째 삭제에서 NULL로 바뀌는
-- project_id가 첫 번째 삭제로 이미 NULL이 된 행과 (photographer_id, event_type)이
-- 같아져 유니크 위반 → DELETE 트랜잭션 전체가 롤백된다.
--
-- 수정: 인덱스 대상을 원래 의도대로 signup_completed/first_login로 한정한다.
-- customer_link_visited는 project_id가 NULL이 되는 경우가 "프로젝트 삭제로 고아가 된
-- 기록"뿐이라 애초에 유니크로 묶어 멱등성을 보장할 대상이 아니다.
DROP INDEX IF EXISTS public.idx_beta_usage_events_photographer_type_unique;

CREATE UNIQUE INDEX idx_beta_usage_events_photographer_type_unique
  ON public.beta_usage_events(photographer_id, event_type)
  WHERE photographer_id IS NOT NULL
    AND project_id IS NULL
    AND event_type IN ('signup_completed', 'first_login');
