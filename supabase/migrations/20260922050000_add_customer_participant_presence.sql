CREATE TABLE IF NOT EXISTS public.customer_participant_presence (
  project_id uuid NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  participant_color text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, participant_color),
  FOREIGN KEY (project_id, participant_color)
    REFERENCES public.customer_project_participants(project_id, color) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_participant_presence_recent_idx
  ON public.customer_participant_presence (project_id, last_seen_at DESC);

ALTER TABLE public.customer_participant_presence ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_participant_presence IS
  '셀프 고객 공동 선택 화면의 참여자별 최근 접속 시각. 30초 이내 heartbeat를 온라인으로 본다.';
