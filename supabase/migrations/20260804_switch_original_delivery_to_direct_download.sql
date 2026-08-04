-- ZIP 준비 대기 중이던 고객 링크도 원본 파일 직접 다운로드로 전환한다.
-- 기존에 ZIP 준비 완료 시점이 없어 30일 기산이 시작되지 않았던 selecting 프로젝트는,
-- 전환 적용 시점을 다운로드 기간의 시작으로 삼는다.
UPDATE public.projects
SET original_download_started_at = now()
WHERE include_original = true
  AND status = 'selecting'
  AND original_download_started_at IS NULL;
