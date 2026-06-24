-- claim_photo_number_base only held the project-row lock for the duration of the
-- "read max(number)" RPC call. The actual photos INSERT happened much later, in a
-- separate PostgREST call, after slow per-file image resize + R2 upload work — by then
-- the lock was long released. Concurrent upload batches (the FE sends several /photos
-- requests in parallel) could therefore all claim the same base_number and end up
-- inserting overlapping/duplicate `number` values.
--
-- Fix: do the "lock project row -> compute base -> insert with sequential numbers" as
-- one atomic function call, executed only after all the slow work (resize/R2 upload) is
-- already done. The lock is now held only across a cheap MAX() + INSERT, closing the race.
CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id uuid, p_rows jsonb)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::integer INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  RETURN QUERY
  INSERT INTO public.photos (project_id, number, r2_thumb_url, r2_preview_url, file_size, original_filename)
  SELECT
    p_project_id,
    v_base + idx::integer,
    row_data->>'r2_thumb_url',
    row_data->>'r2_preview_url',
    (row_data->>'file_size')::integer,
    row_data->>'original_filename'
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.insert_photos_with_numbers(uuid, jsonb) IS
  'Atomically locks the project row, computes max(photos.number), and inserts the given rows with sequential numbers in one transaction (called after image resize/R2 upload already completed, so the lock window is just the INSERT itself).';

REVOKE ALL ON FUNCTION public.insert_photos_with_numbers(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_photos_with_numbers(uuid, jsonb) TO service_role;

-- claim_photo_number_base is superseded by insert_photos_with_numbers above and is no
-- longer called from application code.
DROP FUNCTION IF EXISTS public.claim_photo_number_base(uuid);
