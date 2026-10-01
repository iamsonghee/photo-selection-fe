-- 셀렉 마감 기본 기간은 작가가 직접 설정하기 전까지 비워 둔다.
ALTER TABLE public.photographers
  ALTER COLUMN default_selection_deadline_days DROP NOT NULL,
  ALTER COLUMN default_selection_deadline_days DROP DEFAULT;

-- 기존 30일은 최초 마이그레이션이 일괄 입력한 값이므로 미설정 상태로 되돌린다.
UPDATE public.photographers
SET default_selection_deadline_days = NULL
WHERE default_selection_deadline_days = 30;
