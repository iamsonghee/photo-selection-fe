-- 같은 고객 링크를 연 여러 세션이 동시에 사진을 선택해도 required_count를 넘지 않게 한다.
-- 프로젝트 행 잠금으로 같은 프로젝트의 선택 변경을 직렬화한 뒤 개수를 확인한다.
CREATE OR REPLACE FUNCTION public.set_customer_selection_states(
  p_project_id uuid,
  p_photo_ids uuid[],
  p_is_selected boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photo_ids uuid[] := COALESCE(p_photo_ids, ARRAY[]::uuid[]);
  v_required_count integer;
  v_selected_count integer;
BEGIN
  SELECT required_count
  INTO v_required_count
  FROM public.projects
  WHERE id = p_project_id
    AND status IN ('selecting', 'preparing')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid_project_state';
  END IF;

  IF cardinality(v_photo_ids) = 0 OR EXISTS (
    SELECT 1
    FROM unnest(v_photo_ids) AS requested(photo_id)
    LEFT JOIN public.photos p
      ON p.id = requested.photo_id AND p.project_id = p_project_id
    WHERE p.id IS NULL
  ) THEN
    RETURN 'invalid_photos';
  END IF;

  IF p_is_selected AND v_required_count > 0 THEN
    SELECT count(*)
    INTO v_selected_count
    FROM public.selections
    WHERE project_id = p_project_id
      AND is_selected = true
      AND NOT (photo_id = ANY(v_photo_ids));

    IF v_selected_count + cardinality(v_photo_ids) > v_required_count THEN
      RETURN 'limit_reached';
    END IF;
  END IF;

  INSERT INTO public.selections (project_id, photo_id, is_selected)
  SELECT p_project_id, photo_id, p_is_selected
  FROM unnest(v_photo_ids) AS requested(photo_id)
  ON CONFLICT (project_id, photo_id) DO UPDATE
  SET is_selected = EXCLUDED.is_selected;

  RETURN 'saved';
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_selection_states(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_selection_states(uuid, uuid[], boolean) TO service_role;
