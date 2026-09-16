CREATE OR REPLACE FUNCTION public.replace_photographer_recommendations(
  p_project_id uuid,
  p_photographer_id uuid,
  p_photo_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  PERFORM 1
  FROM public.projects
  WHERE id = p_project_id
    AND photographer_id = p_photographer_id
    AND status = 'preparing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_project_not_editable';
  END IF;

  UPDATE public.photos
  SET is_photographer_recommended = (id = ANY(COALESCE(p_photo_ids, ARRAY[]::uuid[])))
  WHERE project_id = p_project_id
    AND is_photographer_recommended IS DISTINCT FROM (id = ANY(COALESCE(p_photo_ids, ARRAY[]::uuid[])));

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_photographer_recommendations(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_photographer_recommendations(uuid, uuid, uuid[]) TO service_role;
