-- 클로즈드 베타 사용자 등급/이용량 제한 시스템.
-- 등급: 관리자(ADMIN_EMAILS, 코드 상수) / 베타(beta_status='active' + 기간 유효) / 일반(그 외 전부).
-- 기존 가입자도 컬럼 기본값(beta_status='not_invited', total_projects_created=0)에서 시작한다 — 그랜드파더링 없음.
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS beta_status text NOT NULL DEFAULT 'not_invited'
    CHECK (beta_status IN ('not_invited','active','ended','suspended')),
  ADD COLUMN IF NOT EXISTS beta_start_date date,
  ADD COLUMN IF NOT EXISTS beta_end_date date,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS total_projects_created integer NOT NULL DEFAULT 0;
-- total_projects_created: 일반(Trial) 사용자의 "삭제 후 재생성" 우회를 막기 위한 누적 생성 카운터.
-- 프로젝트 생성 성공 시마다 +1, 삭제해도 감소하지 않음. 기존 가입자도 백필 없이 0부터 시작(이 정책 적용 이후의 생성만 카운트).

-- 가입 전 이메일 사전 등록(초대) — 등록된 이메일로 가입하면 자동으로 베타 부여됨.
CREATE TABLE public.beta_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  admin_note text
);
ALTER TABLE public.beta_invitations ENABLE ROW LEVEL SECURITY;

-- 관리자 행위(베타 부여/종료/중지/기간변경) + 시스템 이벤트(프로젝트/업로드 제한 발생) 감사 로그.
-- project_logs(project_id NOT NULL)와 달리 프로젝트와 무관한 사용자 단위 이벤트도 담을 수 있어야 해서 별도 테이블로 분리.
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  actor text NOT NULL CHECK (actor IN ('admin','system')),
  action text NOT NULL CHECK (action IN (
    'beta_granted','beta_ended','beta_suspended','beta_period_changed',
    'project_limit_hit','photo_limit_hit'
  )),
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_logs_photographer_created ON public.admin_audit_logs(photographer_id, created_at DESC);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
