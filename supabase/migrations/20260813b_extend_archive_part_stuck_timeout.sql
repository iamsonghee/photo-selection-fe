-- archive part(ZIP 빌드+R2 업로드) stuck 복구 임계값을 15분 -> 45분으로 완화한다.
-- part 크기(ARCHIVE_PART_MAX_BYTES)를 키우면 다운로드+압축+업로드 총 소요 시간이
-- 비례해 길어질 수 있어, 정상 처리 중인 part가 조기에 stuck으로 오분류되는 것을 막는다.
-- (프로젝트 claim 단계용 recover_stuck_original_archive_builds의 15분 기준은 변경하지 않는다 —
--  해당 단계는 DB 조회/insert만 하므로 part 크기와 무관하게 항상 빠르다.)
-- 함수 본문은 20260731_original_archive_download.sql과 동일, DEFAULT 값만 변경.

CREATE OR REPLACE FUNCTION public.recover_stuck_original_archive_parts(p_stuck_minutes INT DEFAULT 45)
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
