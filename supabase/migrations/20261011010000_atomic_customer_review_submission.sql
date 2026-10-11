-- SQL Editor에서도 실행 가능. FE 배포 전에 적용한다.
BEGIN;
CREATE OR REPLACE FUNCTION public.submit_customer_version_reviews(
  p_project_id uuid, p_expected_status text, p_reviews jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_expected jsonb;
  v_status text;
  v_version int;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND OR p_expected_status IS NULL
    OR p_expected_status NOT IN ('reviewing_v1', 'reviewing_v2')
    OR v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'invalid_review_state';
  END IF;
  IF p_reviews IS NULL OR jsonb_typeof(p_reviews) <> 'array' THEN
    RAISE EXCEPTION 'invalid_reviews';
  END IF;
  v_version := CASE WHEN p_expected_status = 'reviewing_v2' THEN 2 ELSE 1 END;
  -- 보정본 교체와 제출이 같은 version 행을 동시에 변경하지 못하게 한다.
  PERFORM pv.id FROM public.photo_versions pv
  JOIN public.photos p ON p.id = pv.photo_id
  WHERE p.project_id = p_project_id AND pv.version = v_version
  ORDER BY pv.photo_id, pv.version FOR UPDATE OF pv;

  SELECT jsonb_agg(jsonb_build_object('photo_version_id', latest.id, 'photo_id', p.id))
  INTO v_expected
  FROM public.selections s
  JOIN public.photos p ON p.id = s.photo_id AND p.project_id = p_project_id
  JOIN LATERAL (
    SELECT pv.id FROM public.photo_versions pv
    WHERE pv.photo_id = p.id AND pv.version = v_version
    ORDER BY pv.created_at DESC, pv.id DESC LIMIT 1
  ) latest ON true
  WHERE s.project_id = p_project_id AND s.is_selected = true;

  IF v_expected IS NULL OR jsonb_array_length(p_reviews) <> jsonb_array_length(v_expected)
    OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_reviews) r(photo_version_id uuid, photo_id uuid, status text, customer_comment text)
      WHERE r.status IS NULL OR r.status NOT IN ('approved', 'revision_requested')
        OR length(r.customer_comment) > 100
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(v_expected) e(photo_version_id uuid, photo_id uuid)
          WHERE e.photo_version_id = r.photo_version_id AND e.photo_id = r.photo_id
        )
    ) OR (SELECT count(DISTINCT r->>'photo_version_id') FROM jsonb_array_elements(p_reviews) r) <> jsonb_array_length(p_reviews)
  THEN RAISE EXCEPTION 'invalid_reviews'; END IF;

  INSERT INTO public.version_reviews (photo_version_id, photo_id, status, customer_comment, reviewed_at)
  SELECT r.photo_version_id, r.photo_id, r.status, r.customer_comment, now()
  FROM jsonb_to_recordset(p_reviews) r(photo_version_id uuid, photo_id uuid, status text, customer_comment text)
  ON CONFLICT (photo_version_id) DO UPDATE SET
    status = EXCLUDED.status, customer_comment = EXCLUDED.customer_comment, reviewed_at = EXCLUDED.reviewed_at;

  v_status := CASE WHEN COALESCE(v_project.revision_round, 0) < COALESCE(v_project.max_revision_count, 0)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_reviews) r WHERE r->>'status' = 'revision_requested')
    THEN 'editing_v2' ELSE 'delivered' END;
  UPDATE public.projects SET status = v_status, updated_at = now(),
    revision_round = CASE WHEN v_status = 'editing_v2' THEN COALESCE(v_project.revision_round, 0) + 1 ELSE revision_round END,
    delivered_at = CASE WHEN v_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = p_project_id;
  DELETE FROM public.version_review_drafts WHERE project_id = p_project_id;
  PERFORM public.resolve_retouch_delivery_archive(p_project_id, v_status = 'delivered');
  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_customer_version_reviews(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_customer_version_reviews(uuid, text, jsonb) TO service_role;
COMMIT;
