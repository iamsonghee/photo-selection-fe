-- original_jobs 테이블 생성 + photos 컬럼 변경 + helper functions
-- 의존: 20260723_photos_original_columns.sql
-- 멱등(idempotent): 테이블이 이미 존재해도 안전하게 실행 가능

-- ── 1. original_jobs 테이블 (존재하지 않는 경우에만 생성) ────────────────────

CREATE TABLE IF NOT EXISTS public.original_jobs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id              UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
    project_id            UUID NOT NULL,
    job_type              TEXT NOT NULL DEFAULT 'original_compress',
    r2_source_key         TEXT NOT NULL,        -- originals/source/{project_id}/{hex32}.{ext}
    source_content_type   TEXT NOT NULL,        -- image/jpeg | image/png | image/webp
    status                TEXT NOT NULL DEFAULT 'awaiting_upload'
                              CHECK (status IN ('awaiting_upload','pending','processing','completed','failed')),
    attempts              INT  NOT NULL DEFAULT 0,
    max_attempts          INT  NOT NULL DEFAULT 3,
    last_error            TEXT,
    next_attempt_at       TIMESTAMPTZ,          -- NULL이면 즉시 처리 가능
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    CONSTRAINT uq_photo_job_type UNIQUE (photo_id, job_type)
);

-- ── 1b. 복구 매칭용 원본 파일 메타데이터 컬럼 추가 (없는 경우에만) ──────────

ALTER TABLE public.original_jobs
    ADD COLUMN IF NOT EXISTS original_filename      TEXT,
    ADD COLUMN IF NOT EXISTS original_file_size     BIGINT,               -- file.size (bytes)
    ADD COLUMN IF NOT EXISTS original_last_modified BIGINT,               -- file.lastModified (ms epoch)
    ADD COLUMN IF NOT EXISTS original_content_type  TEXT;                 -- file.type

-- ── 1c. 인덱스 (없는 경우에만) ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS original_jobs_pending_idx     ON public.original_jobs(created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS original_jobs_processing_idx  ON public.original_jobs(processing_started_at)
    WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS original_jobs_awaiting_idx    ON public.original_jobs(created_at)
    WHERE status = 'awaiting_upload';

-- ── 2. photos 컬럼 변경 ──────────────────────────────────────────────────────

ALTER TABLE public.photos
    ADD COLUMN IF NOT EXISTS original_status TEXT
        CHECK (original_status IN ('awaiting_upload','pending','processing','completed','failed'));

-- original_uploaded_at → original_ready_at (처리 완료 시각으로 의미 명확화)
-- 이미 rename된 경우를 위해 조건부 실행
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'photos'
          AND column_name = 'original_uploaded_at'
    ) THEN
        ALTER TABLE public.photos RENAME COLUMN original_uploaded_at TO original_ready_at;
    END IF;
END $$;

-- ── 3. insert_photos_with_numbers RPC 업데이트 ────────────────────────────────

CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id uuid, p_rows jsonb)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::integer INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  RETURN QUERY
  INSERT INTO public.photos (
      project_id, number, r2_thumb_url, r2_preview_url,
      file_size, original_filename, r2_original_url,
      original_ready_at, original_status
  )
  SELECT
    p_project_id,
    v_base + idx::integer,
    row_data->>'r2_thumb_url',
    row_data->>'r2_preview_url',
    (row_data->>'file_size')::integer,
    row_data->>'original_filename',
    NULLIF(row_data->>'r2_original_url', ''),
    (row_data->>'original_ready_at')::timestamptz,
    NULLIF(row_data->>'original_status', '')
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.insert_photos_with_numbers(uuid, jsonb) IS
  'Atomically locks the project row, computes max(photos.number), and inserts rows with sequential numbers. Supports original_status and original_ready_at for async compression tracking.';

-- ── 4. claim_original_job: 원자적 job 클레임 (SELECT FOR UPDATE SKIP LOCKED) ──

CREATE OR REPLACE FUNCTION public.claim_original_job(p_limit INT DEFAULT 1)
RETURNS SETOF public.original_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.original_jobs
  SET status = 'processing',
      processing_started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.original_jobs
    WHERE status = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ── 5. complete_original_job: 완료 처리 (트랜잭션) ────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_original_job(
    p_job_id UUID,
    p_photo_id UUID,
    p_r2_original_url TEXT,
    p_completed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_jobs
    SET status = 'completed', completed_at = p_completed_at
    WHERE id = p_job_id;

    UPDATE public.photos
    SET r2_original_url = p_r2_original_url,
        original_ready_at = p_completed_at,
        original_status = 'completed'
    WHERE id = p_photo_id;
END;
$$;

-- ── 6. fail_original_job: 즉시 실패 처리 ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fail_original_job(
    p_job_id UUID,
    p_photo_id UUID,
    p_last_error TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_jobs
    SET status = 'failed', last_error = p_last_error
    WHERE id = p_job_id;

    UPDATE public.photos
    SET original_status = 'failed'
    WHERE id = p_photo_id;
END;
$$;

-- ── 7. requeue_original_job: backoff 재시도 ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.requeue_original_job(
    p_job_id UUID,
    p_photo_id UUID,
    p_last_error TEXT,
    p_next_attempt_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_jobs
    SET status = 'pending',
        last_error = p_last_error,
        next_attempt_at = p_next_attempt_at
    WHERE id = p_job_id;

    UPDATE public.photos
    SET original_status = 'pending'
    WHERE id = p_photo_id;
END;
$$;

-- ── 8. recover_stuck_original_jobs: stuck processing 복구 ────────────────────

CREATE OR REPLACE FUNCTION public.recover_stuck_original_jobs(
    p_stuck_minutes INT DEFAULT 15,
    p_next_attempt_minutes INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- 재시도 가능한 stuck job → pending
    UPDATE public.original_jobs
    SET status = 'pending',
        next_attempt_at = now() + (p_next_attempt_minutes || ' minutes')::interval
    WHERE status = 'processing'
      AND processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
      AND attempts < max_attempts;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 재시도 소진 stuck job → failed
    UPDATE public.original_jobs j
    SET status = 'failed',
        last_error = 'processing timeout after max_attempts'
    WHERE j.status = 'processing'
      AND j.processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
      AND j.attempts >= j.max_attempts;

    -- photos.original_status 동기화
    UPDATE public.photos p
    SET original_status = j.status
    FROM public.original_jobs j
    WHERE j.photo_id = p.id
      AND j.status IN ('pending', 'failed')
      AND p.original_status = 'processing';

    RETURN v_count;
END;
$$;

-- ── 9. confirm_original_upload: awaiting_upload → pending ────────────────────

CREATE OR REPLACE FUNCTION public.confirm_original_upload(p_job_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_jobs
    SET status = 'pending'
    WHERE id = p_job_id AND status = 'awaiting_upload';

    UPDATE public.photos p
    SET original_status = 'pending'
    FROM public.original_jobs j
    WHERE j.id = p_job_id
      AND j.photo_id = p.id
      AND p.original_status = 'awaiting_upload';
END;
$$;
