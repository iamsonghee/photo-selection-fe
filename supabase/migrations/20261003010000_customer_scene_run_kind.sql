-- 장면 정리를 유사컷 분석과 분리한 별도 실행(kind = 'scene'). 장면은 촬영 시각과 장면당 대표 몇 장만 쓰므로
-- 전체 사진 임베딩을 기다리지 않고, "비슷한 사진 묶기"를 끄면 유사컷 분석(임베딩)은 아예 돌지 않는다.
ALTER TABLE public.customer_ai_runs DROP CONSTRAINT IF EXISTS customer_ai_runs_kind_check;
ALTER TABLE public.customer_ai_runs
  ADD CONSTRAINT customer_ai_runs_kind_check CHECK (kind IN ('scene', 'similarity', 'quality'));

-- 실행에 쓴 AI 설정(장면 기준값·이름 목록·모델·프롬프트 버전). 검수 라벨이 채점할 때 "그 장면을 만든 설정"을 그대로 남긴다.
ALTER TABLE public.customer_ai_runs
  ADD COLUMN IF NOT EXISTS settings jsonb;
