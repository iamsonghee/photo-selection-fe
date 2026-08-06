-- 원본 ZIP은 고객 링크가 열린 뒤에만 만든다. 링크 활성화가 원본 처리 완료보다 먼저
-- 일어나는 경우에도, 마지막 원본 완료 이벤트가 안전하게 작업을 등록하도록 보완한다.
-- 또한 과거에 상태가 NULL로 남아 ZIP 작업이 한 번도 생성되지 않은 활성 프로젝트를 복구한다.

CREATE OR REPLACE FUNCTION public.enqueue_original_archive_build(p_project_id UUID)
RETURNS BOOLEAN
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
    AND status IN ('selecting', 'confirmed', 'editing', 'reviewing_v1', 'editing_v2', 'reviewing_v2', 'delivered')
    AND original_archive_status IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.photos
      WHERE project_id = p_project_id AND original_status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.photos
      WHERE project_id = p_project_id
        AND original_status IS DISTINCT FROM 'completed'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- 기존 complete_original_job을 확장한다. 링크가 열린 뒤 마지막 원본이 완료될 때에도
-- 위 RPC가 실행되어, 링크 활성화 시점의 단발성 enqueue 실패/미완료 상태에 의존하지 않는다.
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
DECLARE
    v_project_id UUID;
BEGIN
    UPDATE public.original_jobs
    SET status = 'completed', completed_at = p_completed_at
    WHERE id = p_job_id;

    UPDATE public.photos
    SET r2_original_url = p_r2_original_url,
        original_ready_at = p_completed_at,
        original_status = 'completed',
        original_compressed_size = COALESCE(p_file_size, original_compressed_size)
    WHERE id = p_photo_id
    RETURNING project_id INTO v_project_id;

    IF v_project_id IS NOT NULL THEN
        PERFORM public.enqueue_original_archive_build(v_project_id);
    END IF;
END;
$$;

-- 30일 다운로드 기간이 남은 프로젝트 중, 모든 원본이 완료됐지만 enqueue가 누락된
-- 건을 한 번에 복구한다. pending 상태가 된 행은 기존 워커가 바로 claim한다.
UPDATE public.projects p
SET original_archive_status = 'pending'
WHERE p.include_original = true
  AND p.status IN ('selecting', 'confirmed', 'editing', 'reviewing_v1', 'editing_v2', 'reviewing_v2', 'delivered')
  AND p.original_archive_status IS NULL
  AND p.original_download_started_at IS NOT NULL
  AND p.original_download_started_at + INTERVAL '30 days' > now()
  AND EXISTS (
    SELECT 1 FROM public.photos ph
    WHERE ph.project_id = p.id AND ph.original_status = 'completed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.photos ph
    WHERE ph.project_id = p.id
      AND ph.original_status IS DISTINCT FROM 'completed'
  );
