-- 셀프 고객 장면 검수(관리자): 운영자가 AI 장면을 보고 정답 장면(경계·이름)을 남긴다.
-- 서비스 화면의 장면(customer_scenes)은 바꾸지 않는다 — 정답은 AI 기준값·이름 목록·프롬프트를 바꿀 때 채점용으로만 쓴다.
-- 프로젝트당 한 건(다시 저장하면 덮어쓴다). 사진은 복사하지 않고 사진 ID만 기록한다.

CREATE TABLE IF NOT EXISTS public.customer_scene_labels (
  project_id uuid PRIMARY KEY REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  shoot_type text,
  -- 정답 장면: [{ "name": text, "photoIds": [uuid, ...] }] (촬영 시간순)
  scenes jsonb NOT NULL,
  -- 검수할 때 화면에 있던 AI 장면: 같은 모양. 정답과 비교(채점)할 기준.
  ai_scenes jsonb,
  -- 그때 AI 설정: { "gapMinutes": 3, "catalog": [...], "qualityPromptVersion": "v1-people" }
  ai_settings jsonb,
  note text,
  labeled_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_scene_labels ENABLE ROW LEVEL SECURITY;
