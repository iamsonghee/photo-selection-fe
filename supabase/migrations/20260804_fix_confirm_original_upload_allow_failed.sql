-- 버그 수정: 작가 업로드 페이지에서 "사진 업로드는 완료됐는데 고객 초대 링크 활성화
-- 버튼이 '정리 중…'에서 영구히 멈추는" 문제 — 원인 체인 중 마지막 고리.
--
-- 원인 체인:
--   1) 원본 파일의 presigned PUT(R2 직접 업로드)이 조용히 실패해도 non-fatal로 처리되어
--      해당 photo의 original_jobs.status는 'awaiting_upload'에 남는다(별도 커밋에서 FE가
--      업로드 종료 직후 복구 배너를 다시 확인하도록 수정함).
--   2) 24시간이 지나면 stuck_job_sweep_worker가 이 job을 'failed'로 전환한다
--      (last_error: "source file never uploaded (24h timeout)").
--   3) 원본 아카이브 enqueue(enqueue_original_archive_build)는 프로젝트의 모든 사진이
--      'completed'여야만 실행되므로, 'failed'가 하나라도 있으면 원본_archive_status가
--      NULL에서 영원히 바뀌지 않고, FE는 NULL을 "정리 중…"으로 표시한다(별도 커밋에서
--      /originals/pending API가 failed job도 복구 배너에 포함하도록 수정함).
--   4) 그런데 복구 배너에서 재업로드를 시도해도, confirm_original_upload가
--      "WHERE status = 'awaiting_upload'"로만 매칭해 'failed' 행은 0건 업데이트되고
--      아무 에러도 없이 조용히 실패한다 — 사용자가 재시도해도 영구히 고착된다.
--
-- 이 마이그레이션은 4)를 고쳐, 복구 배너에서 재업로드한 원본이 실제로 'pending'으로
-- 전환되어 정상 워커 파이프라인(claim_original_job → 압축 → 완료)에 다시 들어가도록 한다.
CREATE OR REPLACE FUNCTION public.confirm_original_upload(p_job_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_jobs
    SET status = 'pending', attempts = 0
    WHERE id = p_job_id AND status IN ('awaiting_upload', 'failed');

    UPDATE public.photos p
    SET original_status = 'pending'
    FROM public.original_jobs j
    WHERE j.id = p_job_id
      AND j.photo_id = p.id
      AND p.original_status IN ('awaiting_upload', 'failed');
END;
$$;
