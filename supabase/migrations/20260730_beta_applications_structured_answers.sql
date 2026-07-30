-- 베타 신청서 선택형 전환(주관식 축소) — 새 구조화 응답을 저장할 jsonb 컬럼 추가.
-- 기존 genre/monthly_shoot_count/avg_photos_per_project/current_workflow 컬럼은
-- 타입 변경 없이 그대로 유지한다(breaking migration 없음) — 신규 제출부터 대표값
-- (선택된 첫 장르, 구간 대표 정수, 선택지 요약 텍스트)을 계속 채워 넣어 기존 어드민
-- 목록 테이블·정렬 로직이 무변경으로 계속 동작하게 한다. 실제 선택형 응답 원본은
-- additional_answers(jsonb)에 안정적인 key로 저장하고, 화면에서만 라벨로 변환한다
-- (beta_survey_responses.answers와 동일한 패턴).
ALTER TABLE public.beta_applications
  ADD COLUMN IF NOT EXISTS additional_answers jsonb;

-- "A-CUT에 기대하는 점"은 이번 개편에서 필수 → 선택 입력으로 완화.
ALTER TABLE public.beta_applications
  ALTER COLUMN reason DROP NOT NULL;
