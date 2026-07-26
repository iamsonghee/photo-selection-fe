-- 베타 운영 피드백(버그 제보/기능 제안) 테이블. 신규.
-- 현재는 작가(photographer)만 제출 가능하지만, 향후 고객 제보도 받을 수 있도록
-- reporter_type을 두 값 모두 허용해둔다.
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_type text NOT NULL CHECK (reporter_type IN ('photographer', 'customer')),
  photographer_id uuid REFERENCES public.photographers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('bug', 'suggestion')),
  message text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_created_at ON public.feedback(created_at DESC);
CREATE INDEX idx_feedback_status ON public.feedback(status);

-- 모든 읽기/쓰기는 서버(관리자 서비스 롤 또는 세션 검증된 API 라우트)를 통해서만 수행한다.
-- 브라우저(anon/authenticated 롤)의 직접 접근은 허용하지 않는다.
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
