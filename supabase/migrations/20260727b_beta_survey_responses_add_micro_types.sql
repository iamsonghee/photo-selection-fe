-- 첫 프로젝트 진행 중 마이크로 설문 3종(생성 후/원본 업로드 후/셀렉 회신받았을 때) 추가.
-- 기존 beta_survey_responses.survey_type CHECK가 link_sent/first_delivery/second_delivery만
-- 허용해서 새 값을 추가로 허용하도록 제약을 확장한다. 테이블 구조(answers jsonb 등)는 그대로 —
-- survey_type 값만 늘어난다(plan/beta-system.md §7.1 마이크로 설문 참고).
ALTER TABLE public.beta_survey_responses
  DROP CONSTRAINT IF EXISTS beta_survey_responses_survey_type_check;

ALTER TABLE public.beta_survey_responses
  ADD CONSTRAINT beta_survey_responses_survey_type_check
  CHECK (survey_type IN (
    'link_sent',
    'project_created',
    'original_uploaded',
    'selection_received',
    'first_delivery',
    'second_delivery'
  ));
