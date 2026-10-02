-- 셀프 고객 AI 실행별 Gemini 사용량 합계(비용 확인용): { calls, prompt_tokens, output_tokens, thinking_tokens, total_tokens }.
-- 장면 이름·품질 판정 실행이 끝날 때 기록한다. thinking 토큰은 출력 단가로 과금되지만 output_tokens에 포함되지 않아 따로 둔다.
ALTER TABLE public.customer_ai_runs
  ADD COLUMN IF NOT EXISTS usage jsonb;
