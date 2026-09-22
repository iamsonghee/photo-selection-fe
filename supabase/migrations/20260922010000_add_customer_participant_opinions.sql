-- 참가자별 별점/의견. 최종 선택(customer_selections.is_selected)은 소유자만 결정한다.
CREATE TABLE IF NOT EXISTS public.customer_participant_opinions (
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES public.customer_photos(id) ON DELETE CASCADE,
  participant_color text NOT NULL,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 150),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, photo_id, participant_color),
  FOREIGN KEY (project_id, participant_color)
    REFERENCES public.customer_project_participants(project_id, color) ON DELETE CASCADE,
  CONSTRAINT customer_participant_opinions_color_valid
    CHECK (participant_color IN ('red', 'yellow', 'green', 'blue', 'purple'))
);

ALTER TABLE public.customer_participant_opinions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_participant_opinions IS
  '공유 참여자의 사진별 개인 별점과 공개 의견. 최종 선택과 분리해 참가자끼리 서로 볼 수 있다.';
COMMENT ON TABLE public.customer_selections IS
  '사진당 1행 — 소유자의 최종 선택과 참가자별 찜 색상을 저장. 참가자 별점/의견은 customer_participant_opinions에 저장.';
