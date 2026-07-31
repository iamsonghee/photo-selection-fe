-- 납품용 원본 고객 다운로드: 아카이브(ZIP) 비동기 생성 + 30일 다운로드 기한
-- 의존: 20260723_photos_original_columns.sql, 20260724_original_jobs_and_photos_status.sql,
--       20260725_add_include_original_to_projects.sql
-- 멱등(idempotent): 테이블/컬럼이 이미 존재해도 안전하게 재실행 가능
-- 백필 없음(B안) — 기존 프로젝트는 original_archive_status/original_download_started_at NULL 유지

-- ── 1. projects 컬럼 추가 ────────────────────────────────────────────────────

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS original_archive_status TEXT
        CHECK (original_archive_status IN ('pending','processing','ready','failed')),
    ADD COLUMN IF NOT EXISTS original_download_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS original_archive_processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS projects_archive_pending_idx ON public.projects(created_at)
    WHERE original_archive_status = 'pending';
CREATE INDEX IF NOT EXISTS projects_archive_processing_idx ON public.projects(original_archive_processing_started_at)
    WHERE original_archive_status = 'processing';

-- ── 2. photos 컬럼 추가 ──────────────────────────────────────────────────────

ALTER TABLE public.photos
    ADD COLUMN IF NOT EXISTS original_compressed_size BIGINT;

-- ── 3. original_archive_parts 테이블 ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.original_archive_parts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    part_number            INT  NOT NULL,
    r2_key                 TEXT NOT NULL,
    file_count             INT  NOT NULL,
    byte_size              BIGINT NOT NULL,
    manifest               JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 이 파트에 포함될 photo_id 배열(스냅샷)
    status                 TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','completed','failed')),
    attempts               INT  NOT NULL DEFAULT 0,
    max_attempts           INT  NOT NULL DEFAULT 3,
    last_error             TEXT,
    processing_started_at  TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    deleted_at             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_archive_project_part UNIQUE (project_id, part_number)
);

CREATE INDEX IF NOT EXISTS archive_parts_pending_idx ON public.original_archive_parts(created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS archive_parts_processing_idx ON public.original_archive_parts(processing_started_at)
    WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS archive_parts_cleanup_idx ON public.original_archive_parts(project_id)
    WHERE status = 'completed' AND deleted_at IS NULL;

-- ── 4. complete_original_job 시그니처 확장 (p_file_size, 하위 호환 DEFAULT NULL) ──

CREATE OR REPLACE FUNCTION public.complete_original_job(
    p_job_id UUID,
    p_photo_id UUID,
    p_r2_original_url TEXT,
    p_completed_at TIMESTAMPTZ DEFAULT now(),
    p_file_size BIGINT DEFAULT NULL
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
        original_status = 'completed',
        original_compressed_size = COALESCE(p_file_size, original_compressed_size)
    WHERE id = p_photo_id;
END;
$$;

-- ── 5. enqueue_original_archive_build: 원자적 조건확인 + enqueue ─────────────
-- include_original=true 프로젝트의 원본 대상 사진 전부가 completed(실패 0건)일 때만
-- NULL → pending 전환. 파트 row는 여기서 만들지 않음(claim 단계에서 생성).

CREATE OR REPLACE FUNCTION public.enqueue_original_archive_build(p_project_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.projects
  SET original_archive_status = 'pending'
  WHERE id = p_project_id
    AND include_original = true
    AND original_archive_status IS NULL
    AND EXISTS (
      SELECT 1 FROM public.photos
      WHERE project_id = p_project_id AND original_status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.photos
      WHERE project_id = p_project_id
        AND original_status IS NOT NULL
        AND original_status <> 'completed'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- ── 6. claim_original_archive_builds: pending 프로젝트 원자적 claim ──────────

CREATE OR REPLACE FUNCTION public.claim_original_archive_builds(p_limit INT DEFAULT 1)
RETURNS SETOF public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.projects
  SET original_archive_status = 'processing',
      original_archive_processing_started_at = now()
  WHERE id IN (
    SELECT id FROM public.projects
    WHERE original_archive_status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ── 7. claim_original_archive_parts: pending 파트 원자적 claim ───────────────

CREATE OR REPLACE FUNCTION public.claim_original_archive_parts(p_limit INT DEFAULT 1)
RETURNS SETOF public.original_archive_parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.original_archive_parts
  SET status = 'processing',
      processing_started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.original_archive_parts
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ── 8. complete_archive_part: 파트 완료 + 전체 완료 시 프로젝트 ready ────────

CREATE OR REPLACE FUNCTION public.complete_archive_part(
    p_part_id UUID,
    p_project_id UUID,
    p_completed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_archive_parts
    SET status = 'completed', completed_at = p_completed_at
    WHERE id = p_part_id;

    IF NOT EXISTS (
        SELECT 1 FROM public.original_archive_parts
        WHERE project_id = p_project_id AND status <> 'completed'
    ) THEN
        -- 'processing'일 때만 ready로 — 이미 형제 파트가 실패시켜 'failed'가 된 경우 덮어쓰지 않음
        UPDATE public.projects
        SET original_archive_status = 'ready',
            original_archive_processing_started_at = NULL
        WHERE id = p_project_id AND original_archive_status = 'processing';
    END IF;
END;
$$;

-- ── 9. fail_archive_part: 재시도 가능 시 pending 복귀, 소진 시 확정 실패 ─────

CREATE OR REPLACE FUNCTION public.fail_archive_part(
    p_part_id UUID,
    p_project_id UUID,
    p_last_error TEXT,
    p_permanent BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_permanent THEN
        UPDATE public.original_archive_parts
        SET status = 'failed', last_error = p_last_error
        WHERE id = p_part_id;

        UPDATE public.projects
        SET original_archive_status = 'failed',
            original_archive_processing_started_at = NULL
        WHERE id = p_project_id AND original_archive_status = 'processing';
    ELSE
        UPDATE public.original_archive_parts
        SET status = 'pending', last_error = p_last_error, processing_started_at = NULL
        WHERE id = p_part_id;
    END IF;
END;
$$;

-- ── 10. retry_archive_build: 신규 enqueue 아님 — 기존 failed 파트만 되돌림 ──

CREATE OR REPLACE FUNCTION public.retry_archive_build(p_project_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.projects
  SET original_archive_status = 'processing',
      original_archive_processing_started_at = now()
  WHERE id = p_project_id AND original_archive_status = 'failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    UPDATE public.original_archive_parts
    SET status = 'pending', attempts = 0, last_error = NULL, processing_started_at = NULL
    WHERE project_id = p_project_id AND status = 'failed';
  END IF;

  RETURN v_count > 0;
END;
$$;

-- ── 11. recover_stuck_original_archive_builds: 파트 생성 전 프로젝트 고착 복구 ──
-- claim(pending→processing) 후 파트 insert 전에 워커가 죽은 경우를 복구한다.

CREATE OR REPLACE FUNCTION public.recover_stuck_original_archive_builds(p_stuck_minutes INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.projects
  SET original_archive_status = 'pending',
      original_archive_processing_started_at = NULL
  WHERE original_archive_status = 'processing'
    AND original_archive_processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.original_archive_parts WHERE project_id = projects.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 12. recover_stuck_original_archive_parts: 파트 단위 고착 복구 ────────────

CREATE OR REPLACE FUNCTION public.recover_stuck_original_archive_parts(p_stuck_minutes INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- 재시도 가능한 stuck 파트 → pending
  UPDATE public.original_archive_parts
  SET status = 'pending', processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
    AND attempts < max_attempts;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 재시도 소진 stuck 파트 → failed
  UPDATE public.original_archive_parts p
  SET status = 'failed', last_error = 'processing timeout after max_attempts'
  WHERE p.status = 'processing'
    AND p.processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
    AND p.attempts >= p.max_attempts;

  -- failed 파트가 하나라도 있으면 프로젝트도 failed로 확정
  UPDATE public.projects proj
  SET original_archive_status = 'failed', original_archive_processing_started_at = NULL
  WHERE proj.original_archive_status = 'processing'
    AND EXISTS (
      SELECT 1 FROM public.original_archive_parts p
      WHERE p.project_id = proj.id AND p.status = 'failed'
    );

  RETURN v_count;
END;
$$;
