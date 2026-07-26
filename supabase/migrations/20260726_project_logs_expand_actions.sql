-- project_logs.action CHECK 제약을 8개 프로젝트 상태 전이 전부로 확장
-- (기존: created, uploaded, selecting, confirmed, editing 5개만 허용)
ALTER TABLE public.project_logs DROP CONSTRAINT IF EXISTS project_logs_action_check;

ALTER TABLE public.project_logs
  ADD CONSTRAINT project_logs_action_check
  CHECK (action IN (
    'created', 'uploaded', 'selecting', 'confirmed', 'editing',
    'reviewing_v1', 'editing_v2', 'reviewing_v2', 'delivered'
  ));
