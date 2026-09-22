ALTER TABLE public.customer_participant_presence
  ADD COLUMN IF NOT EXISTS current_photo_id uuid REFERENCES public.customer_photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS view_updated_at timestamptz;

COMMENT ON COLUMN public.customer_participant_presence.current_photo_id IS
  '참여자가 현재 상세보기 중인 사진. null이면 갤러리를 보고 있다.';
COMMENT ON COLUMN public.customer_participant_presence.view_updated_at IS
  '같은 참여자의 여러 기기 중 가장 최근 화면 조작을 판단하는 시각';
