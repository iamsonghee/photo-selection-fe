-- 단계 7 — 보정본 비교·재요청 흐름(S10~S13). 원본(customer_photos) 1장에 여러 회차의
-- 보정본이 쌓일 수 있어(무제한 재보정 — 작가 플로우의 v1/v2 상한과 다름) 별도 테이블로 둔다.
CREATE TABLE IF NOT EXISTS public.customer_photo_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.customer_photos(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  filename text NOT NULL,
  thumb_url text,
  preview_url text,
  -- pending: 아직 비교 안 함, confirmed: 확정, redo: 재보정 요청(사유 필수)
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'confirmed', 'redo')),
  redo_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_photo_versions_photo_idx
  ON public.customer_photo_versions (photo_id, round);

-- S13 완료 표시. 별도 상태 머신 없이 이 한 플래그로 충분하다(진행 중 화면은 버전 존재 여부로 판단).
ALTER TABLE public.customer_projects ADD COLUMN IF NOT EXISTS retouch_done boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_photo_versions ENABLE ROW LEVEL SECURITY;
