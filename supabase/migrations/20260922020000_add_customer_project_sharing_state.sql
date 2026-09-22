ALTER TABLE public.customer_projects
  ADD COLUMN IF NOT EXISTS sharing_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customer_projects.sharing_enabled IS
  'false면 현재 공유 토큰과 기존 참여자 쿠키를 모두 거부한다. 새 링크 발급 시 true로 전환한다.';
