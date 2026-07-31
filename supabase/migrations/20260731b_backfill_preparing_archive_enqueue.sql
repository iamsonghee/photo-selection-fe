-- 일회성 백필: 이 기능 배포 이전에 이미 원본 압축이 전부 완료된 preparing 프로젝트는
-- original_status='completed' 이벤트가 다시 발생하지 않아 _maybe_enqueue_archive_build()가
-- 한 번도 호출되지 않는다 — original_archive_status가 영구히 NULL로 남아 아카이브가
-- 생성되지 않고 링크 활성화도 계속 차단되는 문제를 막기 위한 백필.
--
-- 대상(전부 충족해야 함):
--   - status = 'preparing' (이미 활성화된 selecting/confirmed/... 이후 프로젝트는 절대 포함하지
--     않음 — 20260731_original_archive_download.sql의 "백필 없음(B안)" 정책과 별개 문제이며,
--     이미 활성화된 링크에 다운로드를 소급 노출하지 않는다는 점은 동일하게 유지한다)
--   - include_original = true
--   - original_archive_status IS NULL (이미 enqueue된 적 없음 — 멱등, 재실행해도 안전)
--   - 원본 대상 사진(= original_status가 NULL이 아닌 사진)이 1장 이상
--   - 그 사진들이 전부 'completed' (실패/진행중이 하나라도 있으면 대상에서 제외)
--
-- original_download_started_at은 여기서 기록하지 않는다 — 다운로드 30일 기산은 기존
-- 계획대로 실제 preparing→selecting 전환 시점(초대 링크 활성화)에만 기록된다. 이 백필은
-- original_archive_status만 'pending'으로 올려 기존에 이미 배포된 original_archive_worker()가
-- 다음 폴링 주기(5초)에 자연히 claim해 파트 생성·ZIP 빌드를 진행하게 만드는 역할만 한다.

UPDATE public.projects p
SET original_archive_status = 'pending'
WHERE p.status = 'preparing'
  AND p.include_original = true
  AND p.original_archive_status IS NULL
  AND EXISTS (
    SELECT 1 FROM public.photos ph
    WHERE ph.project_id = p.id AND ph.original_status = 'completed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.photos ph
    WHERE ph.project_id = p.id
      AND ph.original_status IS NOT NULL
      AND ph.original_status <> 'completed'
  );
