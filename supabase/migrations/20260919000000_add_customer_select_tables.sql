-- 고객 직접 셀렉 서비스(단계 0 분석 결과 결정: 별도 테이블 모델, 사용자 확인 완료).
-- 작가 프로젝트(projects/photos/selections)와 생애주기·소유권 모델이 달라 재사용하지 않는다
-- (docs/customer-design.md가 아니라 이번 기획 전용 문서 — 단계 1 산출물 참고).
--
-- 소유자(owner_id)는 기존 photographers와 같은 Supabase Auth(auth.users)를 그대로 쓴다
-- (Google/Kakao — src/components/AuthModal.tsx와 동일 로그인 흐름, redirectPath만 다르게 진입).
-- 공유 링크로 들어오는 참가자(예: 배우자)는 계정을 만들지 않는다 — project_participants와 같은
-- 패턴으로 "색 = 참가자 슬롯" 표시용 명단만 공유 저장한다(본인 확인 수단 아님).

CREATE TABLE IF NOT EXISTS public.customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  shoot_type text,
  target_count integer NOT NULL DEFAULT 30 CHECK (target_count > 0),
  photo_count integer NOT NULL DEFAULT 0,
  -- 참가자가 로그인 없이 들어오는 유일한 경로. 짧은 랜덤 문자열이며 추측 방지 목적 외 권한 체크는 아니다.
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'base64url'),
  exported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_project_participants (
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('red', 'yellow', 'green', 'blue', 'purple')),
  nickname text NOT NULL DEFAULT '' CHECK (char_length(nickname) <= 20),
  -- 배민 스타일 "다 골랐어요" 완료 표시.
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, color)
);

CREATE TABLE IF NOT EXISTS public.customer_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  -- 원본 파일명 그대로 보관(기획 요구사항 — 파일명 유지).
  filename text NOT NULL,
  order_index integer NOT NULL,
  -- R2 키 prefix만 저장, 실제 thumb/preview 두 변형은 BE 업로드 파이프라인이 같은 규칙으로 생성.
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_photos_project_order_idx
  ON public.customer_photos (project_id, order_index);

-- 사진당 한 행 — 기존 selections와 동일하게 평점/코멘트는 프로젝트 전체 공용, color_tags 배열로
-- "누가 찜했는지"만 참가자별로 구분한다(요청사항: 실시간 반영되는 공통 셀렉, 개인별 셀렉 아님).
CREATE TABLE IF NOT EXISTS public.customer_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.customer_photos(id) ON DELETE CASCADE,
  rating smallint CHECK (rating BETWEEN 0 AND 5),
  color_tags text[] NOT NULL DEFAULT '{}',
  comment text,
  is_selected boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, photo_id)
);

COMMENT ON TABLE public.customer_projects IS
  '고객이 직접 소유하는 셀렉 프로젝트(외부 작가용). projects/photographer_id 생애주기와 무관.';
COMMENT ON COLUMN public.customer_projects.share_token IS
  '참가자가 로그인 없이 참여하는 링크 토큰. 추측 방지 목적, 강한 인증 수단 아님.';
COMMENT ON TABLE public.customer_project_participants IS
  'project_participants와 동일 패턴 — 색=참가자 슬롯 표시용 명단 + 배민 스타일 완료 표시.';
COMMENT ON TABLE public.customer_selections IS
  '사진당 1행 — rating/comment는 공용, color_tags로 참가자별 찜 여부만 구분.';

-- 모든 읽기/쓰기는 서버(service role, Next.js API 라우트)를 통해서만 수행한다 — project_participants와 동일 관례.
ALTER TABLE public.customer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_project_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_selections ENABLE ROW LEVEL SECURITY;
