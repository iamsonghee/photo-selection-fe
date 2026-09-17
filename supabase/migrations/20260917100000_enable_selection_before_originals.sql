-- 셀렉용 프리뷰가 모두 등록되면 원본 전송 완료를 기다리지 않고 고객 셀렉을 시작한다.
-- 프로젝트 행 잠금은 insert_photos_with_numbers와 공유하므로 활성화와 사진 등록이 직렬화된다.

CREATE OR REPLACE FUNCTION public.activate_project_for_selection(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_photo_count BIGINT;
BEGIN
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_project.status = 'selecting' THEN
    RETURN 'already_active';
  END IF;
  IF v_project.status <> 'preparing' THEN
    RETURN 'invalid_state';
  END IF;

  SELECT count(*) INTO v_photo_count
  FROM public.photos
  WHERE project_id = p_project_id;

  IF v_photo_count < v_project.required_count THEN
    RETURN 'insufficient_photos';
  END IF;

  UPDATE public.projects
  SET status = 'selecting',
      photo_count = v_photo_count,
      updated_at = now()
  WHERE id = p_project_id;

  -- 활성화 전에 원본이 이미 모두 완료된 경우를 처리한다. 아직 미완료라면 마지막
  -- complete_original_job이 같은 멱등 함수를 다시 호출한다.
  IF v_project.include_original THEN
    PERFORM public.enqueue_original_archive_build(p_project_id);
  END IF;

  RETURN 'activated';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_project_for_selection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_project_for_selection(UUID) TO service_role;

COMMENT ON FUNCTION public.activate_project_for_selection(UUID) IS
  'Atomically freezes the preview photo set and starts customer selection without waiting for original uploads.';

-- 고객이 원본 처리보다 먼저 셀렉을 확정할 수 있으므로 ZIP 완료 당시 상태가 selecting이
-- 아니어도 다운로드 기간을 시작해야 한다.
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
        UPDATE public.projects
        SET original_archive_status = 'ready',
            original_archive_processing_started_at = NULL,
            original_download_started_at = COALESCE(original_download_started_at, p_completed_at)
        WHERE id = p_project_id
          AND status IN ('selecting', 'confirmed', 'editing', 'reviewing_v1', 'editing_v2', 'reviewing_v2', 'delivered')
          AND original_archive_status = 'processing';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_original_upload_progress(p_project_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'completed', count(*) FILTER (WHERE original_status = 'completed'),
    'processing', count(*) FILTER (WHERE original_status IN ('pending', 'processing')),
    'needsRecovery', count(*) FILTER (
      WHERE original_status IS NULL OR original_status IN ('awaiting_upload', 'failed')
    )
  )
  FROM public.photos
  WHERE project_id = p_project_id;
$$;

REVOKE ALL ON FUNCTION public.get_original_upload_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_original_upload_progress(UUID) TO service_role;

-- API 검사를 우회하거나 활성화와 늦은 요청이 경쟁해도 selecting 이후 새 사진은 추가되지 않는다.
-- 멱등 replay는 INSERT 없이 기존 photo를 반환하므로 이 트리거의 영향을 받지 않는다.
CREATE OR REPLACE FUNCTION public.enforce_photo_insert_while_preparing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = NEW.project_id
      AND status = 'preparing'
  ) THEN
    RAISE EXCEPTION 'photo_upload_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_insert_while_preparing ON public.photos;
CREATE TRIGGER photos_insert_while_preparing
BEFORE INSERT ON public.photos
FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_insert_while_preparing();
