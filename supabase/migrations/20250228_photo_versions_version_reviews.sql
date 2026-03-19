-- photo_versions: 보정본 버전 (v1/v2) per photo
CREATE TABLE IF NOT EXISTS public.photo_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  version smallint NOT NULL CHECK (version IN (1, 2)),
  r2_url text NOT NULL,
  photographer_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(photo_id, version)
);

CREATE INDEX IF NOT EXISTS idx_photo_versions_photo_id ON public.photo_versions(photo_id);

-- version_reviews: 고객 검토 결과 (확정/재보정요청)
CREATE TABLE IF NOT EXISTS public.version_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_version_id uuid NOT NULL REFERENCES public.photo_versions(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('approved', 'revision_requested')),
  customer_comment text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(photo_version_id)
);

CREATE INDEX IF NOT EXISTS idx_version_reviews_photo_version_id ON public.version_reviews(photo_version_id);
CREATE INDEX IF NOT EXISTS idx_version_reviews_photo_id ON public.version_reviews(photo_id);

-- projects: delivered_at 컬럼 추가 (납품 완료 시각)
-- status 신규값(reviewing_v1, editing_v2, reviewing_v2, delivered)은 text 타입이면 그대로 사용 가능
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
