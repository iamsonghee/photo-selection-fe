CREATE TABLE public.upload_performance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  app_version text CHECK (app_version IS NULL OR length(app_version) <= 128),
  device text NOT NULL CHECK (device IN ('pc', 'mobile')),
  includes_original boolean NOT NULL,
  file_count integer NOT NULL CHECK (file_count >= 0),
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  transferred_bytes bigint NOT NULL CHECK (transferred_bytes >= 0),
  saved_count integer NOT NULL CHECK (saved_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  retry_count integer NOT NULL CHECK (retry_count >= 0),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'incomplete', 'stopped', 'interrupted')),
  elapsed_ms bigint NOT NULL CHECK (elapsed_ms >= 0),
  first_original_ms bigint CHECK (first_original_ms IS NULL OR first_original_ms >= 0),
  first_saved_ms bigint CHECK (first_saved_ms IS NULL OR first_saved_ms >= 0),
  finalize_ms bigint NOT NULL CHECK (finalize_ms >= 0),
  original_concurrency jsonb,
  file_stage_ms jsonb NOT NULL,
  upload_strategy text CHECK (upload_strategy IS NULL OR upload_strategy IN ('preview_first', 'parallel'))
);

CREATE INDEX upload_performance_logs_created_at_idx
  ON public.upload_performance_logs (created_at);

ALTER TABLE public.upload_performance_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.upload_performance_logs FROM anon, authenticated;
GRANT INSERT ON TABLE public.upload_performance_logs TO service_role;

COMMENT ON TABLE public.upload_performance_logs IS
  '작가 업로드 세션의 파일·프로젝트 식별정보 없는 집계 성능 기록. API service role만 쓴다.';
