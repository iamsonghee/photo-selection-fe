-- 셀프 고객 장면 정리 신뢰도.
-- 1) 촬영 시각 출처: 'exif'(원본 EXIF) | 'file'(EXIF가 없어 파일 수정 시각으로 대신함 — HEIC·카카오톡 등).
--    장면 경계와 "촬영 시각 있음" 비율에는 'file'을 쓰지 않는다(정렬 참고용). 이 컬럼 이전 행은 NULL — 기존처럼 그대로 쓴다.
ALTER TABLE public.customer_photos
  ADD COLUMN IF NOT EXISTS taken_at_source text
  CHECK (taken_at_source IN ('exif', 'file'));

-- 2) 실행 진행 갱신 시각(heartbeat). 멈춘 실행 판정은 시작 시각이 아니라 마지막 진행 기준.
ALTER TABLE public.customer_ai_runs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3) 프로젝트·종류별 진행 중 실행은 하나만. 인덱스 만들기 전에 이미 겹친 진행 중 실행은 최신 하나만 남기고 닫는다.
UPDATE public.customer_ai_runs r
SET status = 'failed', error = '중복 실행으로 닫음', completed_at = now()
WHERE status = 'processing'
  AND EXISTS (
    SELECT 1 FROM public.customer_ai_runs newer
    WHERE newer.project_id = r.project_id AND newer.kind = r.kind
      AND newer.status = 'processing' AND newer.created_at > r.created_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS customer_ai_runs_one_processing_idx
  ON public.customer_ai_runs(project_id, kind)
  WHERE status = 'processing';
