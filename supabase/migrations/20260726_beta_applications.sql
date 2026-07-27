-- 클로즈드 베타 신청서(가입 전 잠재 사용자 모집·심사).
-- 기존 beta_invitations(이메일 사전등록→가입시 자동 베타 부여)나 photographers.beta_status(가입 후
-- 이용 등급)와는 목적이 다른 별개 테이블 — 이 테이블은 "가입 전 신청 심사 상태"(축 A)만 관리한다.
-- 두 상태는 자동으로 연동되지 않는다. 상세 설계는 plan/beta-system.md §4, §8.1 참고.
CREATE TABLE public.beta_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text,
  genre text NOT NULL,
  monthly_shoot_count integer NOT NULL,
  avg_photos_per_project integer NOT NULL,
  current_workflow text NOT NULL,
  reason text NOT NULL,
  privacy_consent_at timestamptz NOT NULL,
  contact_consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'reviewing', 'on_hold', 'approved', 'rejected')),
  admin_note text,
  contacted boolean NOT NULL DEFAULT false,
  -- 가입 전에는 null. 로그인 상태로 신청하면 제출 시점에, 이후 가입하면 관리자가 매칭 시점에 채운다.
  matched_photographer_id uuid REFERENCES public.photographers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_beta_applications_status ON public.beta_applications(status);
CREATE INDEX idx_beta_applications_created_at ON public.beta_applications(created_at DESC);
CREATE INDEX idx_beta_applications_matched_photographer ON public.beta_applications(matched_photographer_id);

-- 모든 읽기/쓰기는 서버(관리자 서비스 롤 또는 공개 제출 API 라우트가 서비스 롤로 insert)를 통해서만
-- 수행한다. 브라우저(anon/authenticated 롤)의 직접 접근은 허용하지 않는다.
ALTER TABLE public.beta_applications ENABLE ROW LEVEL SECURITY;
