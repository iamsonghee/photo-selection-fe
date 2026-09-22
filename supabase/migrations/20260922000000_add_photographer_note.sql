-- 작가만 보는 프로젝트 메모 (고객에게는 절대 노출되지 않음)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS photographer_note text;
