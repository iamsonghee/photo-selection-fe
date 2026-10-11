-- SQL Editor에서 실행할 보정 마이그레이션. 기존 별점·찜·선택 기록은 삭제하지 않는다.
BEGIN;

CREATE OR REPLACE FUNCTION public.keep_project_selection_ratings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 0은 미평가 기본값이다. 기존 별점을 그대로 저장한 것도 신규 별점 입력이 아니다.
  IF NEW.rating BETWEEN 1 AND 5
    AND (TG_OP = 'INSERT' OR OLD.rating IS DISTINCT FROM NEW.rating) THEN
    UPDATE public.projects SET selection_uses_ratings = true
    WHERE id = NEW.project_id AND NOT selection_uses_ratings;
  END IF;
  RETURN NEW;
END;
$$;

-- 사용자가 하트 화면으로 복구를 요청한 프로젝트만 표시 설정을 되돌린다.
UPDATE public.projects SET selection_uses_ratings = false
WHERE id = '16c7d133-a139-48b6-b911-b870ce791c2c';

COMMIT;
