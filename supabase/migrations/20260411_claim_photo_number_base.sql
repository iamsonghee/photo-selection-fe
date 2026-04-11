-- Concurrent upload batches used to read max(photos.number) without locking, causing
-- duplicate numbers and silent insert failures. Serialize allocation per project.
CREATE OR REPLACE FUNCTION public.claim_photo_number_base(p_project_id uuid)
RETURNS TABLE(base_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::integer INTO v_max
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  RETURN QUERY SELECT v_max;
END;
$$;

COMMENT ON FUNCTION public.claim_photo_number_base(uuid) IS
  'Locks the project row and returns max(photos.number) before assigning new numbers (max+1..).';

REVOKE ALL ON FUNCTION public.claim_photo_number_base(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_photo_number_base(uuid) TO service_role;
