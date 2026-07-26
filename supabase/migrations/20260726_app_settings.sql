-- 관리자 설정 화면(/admin/settings)에서 실시간으로 편집 가능한 정책 값 저장용 싱글턴 테이블.
-- 기존 beta-limits.ts / beta_policy.py 하드코딩 상수를 대체한다. id=1 행 하나만 존재.
CREATE TABLE public.app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  general_max_projects integer NOT NULL DEFAULT 1,
  general_max_photos_per_project integer NOT NULL DEFAULT 500,
  beta_max_projects_total integer NOT NULL DEFAULT 10,
  beta_max_photos_per_project integer NOT NULL DEFAULT 2000,
  beta_max_revision_count integer NOT NULL DEFAULT 2,
  beta_default_duration_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO public.app_settings (id) VALUES (1);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- 정책 없음 — service-role 클라이언트(getAdminClient())만 접근, anon/authenticated는 RLS로 차단.
