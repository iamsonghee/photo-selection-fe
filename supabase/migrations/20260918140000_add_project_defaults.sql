-- 작가마다 반복 사용하는 프로젝트 기준을 저장하고 새 프로젝트에 복사한다.
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS default_selection_deadline_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_include_original boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_upload_strategy text NOT NULL DEFAULT 'parallel';

ALTER TABLE public.photographers
  DROP CONSTRAINT IF EXISTS photographers_default_selection_deadline_days_check,
  ADD CONSTRAINT photographers_default_selection_deadline_days_check
    CHECK (default_selection_deadline_days BETWEEN 1 AND 365),
  DROP CONSTRAINT IF EXISTS photographers_default_upload_strategy_check,
  ADD CONSTRAINT photographers_default_upload_strategy_check
    CHECK (default_upload_strategy IN ('preview_first', 'parallel'));

-- 기존 프로젝트는 현재 동작을 유지한다. 새 프로젝트는 생성 시 작가 기본값을 복사한다.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS selection_deadline_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS upload_strategy text NOT NULL DEFAULT 'preview_first';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_selection_deadline_days_check,
  ADD CONSTRAINT projects_selection_deadline_days_check
    CHECK (selection_deadline_days BETWEEN 1 AND 365),
  DROP CONSTRAINT IF EXISTS projects_upload_strategy_check,
  ADD CONSTRAINT projects_upload_strategy_check
    CHECK (upload_strategy IN ('preview_first', 'parallel'));

CREATE OR REPLACE FUNCTION public.activate_project_for_selection(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_photo_count BIGINT;
  v_incomplete_original_count BIGINT;
BEGIN
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_project.status = 'selecting' THEN RETURN 'already_active'; END IF;
  IF v_project.status <> 'preparing' THEN RETURN 'invalid_state'; END IF;

  SELECT count(*) INTO v_photo_count
  FROM public.photos
  WHERE project_id = p_project_id;

  IF v_photo_count < v_project.required_count THEN RETURN 'insufficient_photos'; END IF;

  IF v_project.include_original AND v_project.upload_strategy = 'parallel' THEN
    SELECT count(*) INTO v_incomplete_original_count
    FROM public.photos
    WHERE project_id = p_project_id
      AND original_status IS DISTINCT FROM 'completed';
    IF v_incomplete_original_count > 0 THEN RETURN 'originals_incomplete'; END IF;
  END IF;

  UPDATE public.projects
  SET status = 'selecting', photo_count = v_photo_count, updated_at = now()
  WHERE id = p_project_id;

  IF v_project.include_original THEN
    PERFORM public.enqueue_original_archive_build(p_project_id);
  END IF;

  RETURN 'activated';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_project_for_selection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_project_for_selection(UUID) TO service_role;

COMMENT ON FUNCTION public.activate_project_for_selection(UUID) IS
  'Starts customer selection after previews, or after originals for projects using the parallel safe-start strategy.';
