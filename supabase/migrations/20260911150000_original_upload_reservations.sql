-- Early direct PUTs must remain discoverable even if the preview request never arrives.
-- No project FK: deleting a project must not erase the orphan-cleanup ledger.
CREATE TABLE public.original_upload_reservations (
  project_id uuid NOT NULL,
  client_upload_id uuid NOT NULL,
  source_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint NOT NULL CHECK (file_size > 0),
  last_modified bigint NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'cleaning')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  cleanup_claimed_at timestamptz,
  cleanup_token uuid,
  PRIMARY KEY (project_id, client_upload_id)
);
ALTER TABLE public.original_upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.original_upload_reservations FROM anon, authenticated;
GRANT ALL ON public.original_upload_reservations TO service_role;
CREATE INDEX original_upload_reservations_expiry ON public.original_upload_reservations (expires_at);

CREATE FUNCTION public.reserve_original_upload(
  p_project_id uuid, p_photographer_id uuid, p_client_upload_id uuid,
  p_filename text, p_content_type text, p_file_size bigint, p_last_modified bigint,
  p_limit integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project public.projects;
  v_existing public.original_upload_reservations;
  v_count bigint;
  v_key text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND OR v_project.photographer_id <> p_photographer_id THEN RAISE EXCEPTION 'original_reservation_not_found'; END IF;
  IF v_project.status <> 'preparing' OR NOT coalesce(v_project.include_original, false) THEN RAISE EXCEPTION 'original_reservation_not_allowed'; END IF;
  IF p_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp') OR p_file_size <= 0 THEN RAISE EXCEPTION 'original_reservation_invalid_file'; END IF;
  -- Already registered photos use their job's recover/confirm path, never a fresh early PUT.
  IF EXISTS (SELECT 1 FROM public.photos WHERE project_id = p_project_id AND client_upload_id = p_client_upload_id) THEN
    RETURN jsonb_build_object('deferred', true);
  END IF;
  SELECT * INTO v_existing FROM public.original_upload_reservations
    WHERE project_id = p_project_id AND client_upload_id = p_client_upload_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.state = 'cleaning' THEN RAISE EXCEPTION 'original_reservation_cleaning'; END IF;
    IF v_existing.original_filename <> p_filename OR v_existing.content_type <> p_content_type
      OR v_existing.file_size <> p_file_size OR v_existing.last_modified <> p_last_modified THEN
      RAISE EXCEPTION 'original_reservation_metadata_mismatch';
    END IF;
    UPDATE public.original_upload_reservations SET expires_at = now() + interval '48 hours'
      WHERE project_id = p_project_id AND client_upload_id = p_client_upload_id;
    RETURN jsonb_build_object('source_key', v_existing.source_key, 'deferred', false);
  END IF;
  IF p_limit IS NOT NULL THEN
    SELECT (SELECT count(*) FROM public.photos WHERE project_id = p_project_id)
      + (SELECT count(*) FROM public.original_upload_reservations r WHERE r.project_id = p_project_id
        AND NOT EXISTS (SELECT 1 FROM public.photos p WHERE p.project_id = r.project_id AND p.client_upload_id = r.client_upload_id)) INTO v_count;
    IF v_count >= p_limit THEN RAISE EXCEPTION 'original_reservation_limit'; END IF;
  END IF;
  v_key := 'originals/source/' || p_project_id || '/' || replace(p_client_upload_id::text, '-', '') ||
    CASE p_content_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
  INSERT INTO public.original_upload_reservations(project_id, client_upload_id, source_key, original_filename, content_type, file_size, last_modified)
    VALUES (p_project_id, p_client_upload_id, v_key, p_filename, p_content_type, p_file_size, p_last_modified);
  RETURN jsonb_build_object('source_key', v_key, 'deferred', false);
END;
$$;

-- The preview request renews a lease before it can create a photo/job. Once cleanup claims
-- an expired reservation, a late preview request cannot race the object deletion.
CREATE FUNCTION public.renew_original_upload_reservation(
  p_project_id uuid, p_client_upload_id uuid, p_filename text, p_content_type text,
  p_file_size bigint, p_last_modified bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing public.original_upload_reservations;
BEGIN
  SELECT * INTO v_existing FROM public.original_upload_reservations
    WHERE project_id = p_project_id AND client_upload_id = p_client_upload_id FOR UPDATE;
  IF NOT FOUND OR v_existing.state <> 'reserved' THEN RAISE EXCEPTION 'original_reservation_unavailable'; END IF;
  IF v_existing.original_filename <> p_filename OR v_existing.content_type <> p_content_type
    OR v_existing.file_size <> p_file_size OR v_existing.last_modified <> p_last_modified THEN
    RAISE EXCEPTION 'original_reservation_metadata_mismatch';
  END IF;
  UPDATE public.original_upload_reservations SET expires_at = now() + interval '48 hours'
    WHERE project_id = p_project_id AND client_upload_id = p_client_upload_id;
END;
$$;

CREATE FUNCTION public.claim_expired_original_uploads(p_limit integer DEFAULT 50)
RETURNS SETOF public.original_upload_reservations LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.original_upload_reservations r
    SET state = 'cleaning', cleanup_claimed_at = now(), cleanup_token = gen_random_uuid()
    WHERE (r.project_id, r.client_upload_id) IN (
      SELECT project_id, client_upload_id FROM public.original_upload_reservations
      WHERE (state = 'reserved' AND expires_at < now())
         OR (state = 'cleaning' AND cleanup_claimed_at < now() - interval '10 minutes')
      ORDER BY expires_at LIMIT greatest(1, least(p_limit, 50)) FOR UPDATE SKIP LOCKED
    ) RETURNING r.*;
$$;

REVOKE ALL ON FUNCTION public.reserve_original_upload(uuid, uuid, uuid, text, text, bigint, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_original_upload_reservation(uuid, uuid, text, text, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_expired_original_uploads(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_original_upload(uuid, uuid, uuid, text, text, bigint, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_original_upload_reservation(uuid, uuid, text, text, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_expired_original_uploads(integer) TO service_role;
