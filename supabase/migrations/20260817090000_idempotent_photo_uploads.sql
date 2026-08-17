-- 브라우저가 응답을 받지 못해 /photos를 재시도해도 같은 사진과 original_job을 재사용한다.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS client_upload_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS photos_project_client_upload_id_uidx
  ON public.photos(project_id, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

ALTER TABLE public.admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;
ALTER TABLE public.admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_action_check CHECK (action IN (
    'beta_granted','beta_ended','beta_suspended','beta_period_changed',
    'project_limit_hit','photo_limit_hit','upload_idempotency_replay'
  ));

CREATE OR REPLACE FUNCTION public.insert_photos_with_numbers(p_project_id UUID, p_rows JSONB)
RETURNS SETOF public.photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base INTEGER;
  v_row JSONB;
  v_photo public.photos%ROWTYPE;
  v_job JSONB;
  v_client_upload_id UUID;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.number), 0)::INTEGER INTO v_base
  FROM public.photos p
  WHERE p.project_id = p_project_id;

  FOR v_row IN
    SELECT row_data
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(row_data, idx)
    ORDER BY idx
  LOOP
    v_client_upload_id := NULLIF(v_row->>'client_upload_id', '')::UUID;

    IF v_client_upload_id IS NOT NULL THEN
      SELECT * INTO v_photo
      FROM public.photos
      WHERE project_id = p_project_id
        AND client_upload_id = v_client_upload_id;

      IF FOUND THEN
        RETURN NEXT v_photo;
        CONTINUE;
      END IF;
    END IF;

    v_base := v_base + 1;
    INSERT INTO public.photos (
      project_id, number, r2_thumb_url, r2_preview_url,
      file_size, original_filename, r2_original_url,
      original_ready_at, original_status, client_upload_id
    ) VALUES (
      p_project_id,
      v_base,
      v_row->>'r2_thumb_url',
      v_row->>'r2_preview_url',
      (v_row->>'file_size')::INTEGER,
      v_row->>'original_filename',
      NULLIF(v_row->>'r2_original_url', ''),
      (v_row->>'original_ready_at')::TIMESTAMPTZ,
      NULLIF(v_row->>'original_status', ''),
      v_client_upload_id
    )
    RETURNING * INTO v_photo;

    v_job := v_row->'_original_job';
    IF v_job IS NOT NULL AND jsonb_typeof(v_job) = 'object' THEN
      INSERT INTO public.original_jobs (
        photo_id, project_id, r2_source_key, source_content_type, status,
        original_filename, original_file_size, original_last_modified, original_content_type
      ) VALUES (
        v_photo.id,
        p_project_id,
        v_job->>'r2_source_key',
        v_job->>'source_content_type',
        'awaiting_upload',
        NULLIF(v_job->>'original_filename', ''),
        NULLIF(v_job->>'original_file_size', '')::BIGINT,
        NULLIF(v_job->>'original_last_modified', '')::BIGINT,
        NULLIF(v_job->>'original_content_type', '')
      );
    END IF;

    RETURN NEXT v_photo;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) IS
  'Idempotently inserts sequential photos and original jobs using (project_id, client_upload_id).';

REVOKE ALL ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_photos_with_numbers(UUID, JSONB) TO service_role;
