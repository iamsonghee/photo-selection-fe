-- 베타 서비스 내 설문(plan/beta-system.md §7) 응답 저장 — 시점 트리거형 다문항 구조화 응답.
-- 상시 자유 제출 채널인 feedback 테이블과는 스키마를 공유하지 않는다(§7.3, §8.3).
-- survey_type별 문항 구성이 서로 달라 answers를 jsonb로 두고, 새 설문 시점이 추가돼도
-- 컬럼 마이그레이션 없이 확장한다(beta_usage_events.meta와 동일 패턴).
-- "노출"은 별도로 기록하지 않는다 — later_until/skipped_at/submitted_at이 전부 비어있으면
-- 방문마다 다시 보여준다("조건 충족 시 1회 노출"은 "방문당 1회"를 뜻하며 "영구 1회"가 아님, §7.2).
-- survey_type CHECK에는 ①·③(link_sent/second_delivery)도 §8.3 기준으로 미리 포함해두지만,
-- 이번 단계(5단계)에서 실제로 트리거·문항이 구현되는 값은 first_delivery뿐이다.
CREATE TABLE public.beta_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid REFERENCES public.photographers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  survey_type text NOT NULL CHECK (survey_type IN ('link_sent', 'first_delivery', 'second_delivery')),
  answers jsonb,
  later_until timestamptz,
  skipped_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photographer_id, survey_type)
);

CREATE INDEX idx_beta_survey_responses_photographer ON public.beta_survey_responses(photographer_id);

ALTER TABLE public.beta_survey_responses ENABLE ROW LEVEL SECURITY;
-- 모든 읽기/쓰기는 서버(service role)를 통해서만 수행한다.
