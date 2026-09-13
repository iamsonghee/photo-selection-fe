-- 고객 보정본 검토의 "아직 제출하지 않은 판단"을 서버에 둔다.
--
-- 왜 version_reviews를 재사용하지 않는가:
--   1) version_reviews.status = 'approved' 행이 있으면 replace_photo_versions_with_history가
--      해당 보정본 교체를 거부한다(20260901120000). 고객이 제출도 하지 않은 초안 때문에
--      작가가 파일을 못 바꾸게 되면 안 된다.
--   2) 작가 워크플로 화면은 version_reviews를 "고객이 낸 최종 결과"로 읽는다. 초안이 결과로 샌다.
--
-- 그래서 초안은 별도 테이블에 두고, 제출 시에만 version_reviews로 옮긴 뒤 비운다.
-- 셀렉(selections)과 마찬가지로 **링크 단위 공유**다 — 같은 링크를 연 기기끼리 같은 판단을 본다.

CREATE TABLE IF NOT EXISTS public.version_review_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  photo_version_id uuid NOT NULL REFERENCES public.photo_versions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('approved', 'revision_requested')),
  customer_comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 사진 버전 하나당 초안 하나. 판단 취소는 행 삭제로 표현한다(행 없음 = 미검토).
  UNIQUE(photo_version_id)
);

CREATE INDEX IF NOT EXISTS idx_version_review_drafts_project_id
  ON public.version_review_drafts(project_id);

-- 고객 경로는 service_role(API Route)로만 접근한다 — anon/authenticated에는 열지 않는다.
ALTER TABLE public.version_review_drafts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.version_review_drafts IS
  'Unsubmitted customer retouch-review decisions, shared across devices on the same access token. Moved into version_reviews on submit.';
