-- 선택 사진 삭제를 사진별 HTTP/RPC 반복 대신 한 트랜잭션으로 처리한다.
-- 스토리지 객체는 DB 트랜잭션 밖에서 삭제해야 하므로, 먼저 삭제 대상 키를 한 번에 읽고
-- API가 R2 삭제를 완료한 뒤 delete_photos_and_resolve_groups를 호출한다.

CREATE OR REPLACE FUNCTION public.get_photo_delete_assets(
  p_project_id uuid,
  p_photo_ids uuid[]
)
RETURNS TABLE (
  photo_id uuid,
  r2_thumb_url text,
  r2_preview_url text,
  r2_original_url text,
  r2_source_keys text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS photo_id,
    p.r2_thumb_url,
    p.r2_preview_url,
    p.r2_original_url,
    COALESCE(
      ARRAY(
        SELECT oj.r2_source_key
        FROM public.original_jobs oj
        WHERE oj.photo_id = p.id
          AND oj.r2_source_key IS NOT NULL
      ),
      ARRAY[]::text[]
    ) AS r2_source_keys
  FROM public.photos p
  WHERE p.project_id = p_project_id
    AND p.id = ANY(COALESCE(p_photo_ids, ARRAY[]::uuid[]));
$$;

COMMENT ON FUNCTION public.get_photo_delete_assets(uuid, uuid[]) IS
  'Returns every R2 object reference needed before bulk deleting selected project photos.';

REVOKE ALL ON FUNCTION public.get_photo_delete_assets(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_photo_delete_assets(uuid, uuid[]) TO service_role;


CREATE OR REPLACE FUNCTION public.delete_photos_and_resolve_groups(
  p_project_id uuid,
  p_photo_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photo_ids uuid[];
  v_group_ids uuid[];
  v_group_id uuid;
  v_requested_count integer;
  v_existing_count integer;
  v_remaining_count integer;
  v_representative_id uuid;
  v_new_project_count integer;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT photo_id ORDER BY photo_id), ARRAY[]::uuid[])
  INTO v_photo_ids
  FROM unnest(COALESCE(p_photo_ids, ARRAY[]::uuid[])) AS requested(photo_id);

  v_requested_count := cardinality(v_photo_ids);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'photo ids are required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0001';
  END IF;

  -- 단일 사진 RPC와 동일한 잠금 순서: 사진 행 -> 그룹 행. UUID 순서로 잠가 교착을 피한다.
  PERFORM 1
  FROM public.photos
  WHERE project_id = p_project_id
    AND id = ANY(v_photo_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT COUNT(*)::integer
  INTO v_existing_count
  FROM public.photos
  WHERE project_id = p_project_id
    AND id = ANY(v_photo_ids);

  IF v_existing_count <> v_requested_count THEN
    RAISE EXCEPTION 'one or more photos do not belong to the project' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT similarity_group_id ORDER BY similarity_group_id)
      FILTER (WHERE similarity_group_id IS NOT NULL),
    ARRAY[]::uuid[]
  )
  INTO v_group_ids
  FROM public.photos
  WHERE project_id = p_project_id
    AND id = ANY(v_photo_ids);

  PERFORM 1
  FROM public.photo_groups
  WHERE id = ANY(v_group_ids)
  ORDER BY id
  FOR UPDATE;

  -- 기존 단일 삭제도 사진/그룹 처리 뒤 projects UPDATE에서 이 행을 잠근다. 같은 순서를
  -- 유지하면서 프로젝트별 photo_count 최종 계산을 직렬화한다.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;

  DELETE FROM public.photos
  WHERE project_id = p_project_id
    AND id = ANY(v_photo_ids);

  FOREACH v_group_id IN ARRAY v_group_ids LOOP
    SELECT COUNT(*)::integer
    INTO v_remaining_count
    FROM public.photos
    WHERE similarity_group_id = v_group_id;

    IF v_remaining_count < 2 THEN
      -- FK가 남은 한 장의 similarity_group_id를 NULL로 정리한다.
      DELETE FROM public.photo_groups WHERE id = v_group_id;
      CONTINUE;
    END IF;

    SELECT representative_photo_id
    INTO v_representative_id
    FROM public.photo_groups
    WHERE id = v_group_id;

    -- 삭제된 대표컷은 FK ON DELETE SET NULL이므로 저장된 품질값으로 한 번만 재선정한다.
    IF v_representative_id IS NULL THEN
      SELECT id
      INTO v_representative_id
      FROM public.photos
      WHERE similarity_group_id = v_group_id
      ORDER BY blur_variance DESC NULLS LAST, number ASC
      LIMIT 1;
    END IF;

    UPDATE public.photo_groups
    SET representative_photo_id = v_representative_id,
        photo_count = v_remaining_count
    WHERE id = v_group_id;
  END LOOP;

  SELECT COUNT(*)::integer
  INTO v_new_project_count
  FROM public.photos
  WHERE project_id = p_project_id;

  UPDATE public.projects
  SET photo_count = v_new_project_count,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'deletedCount', v_requested_count,
    'photoCount', v_new_project_count,
    'affectedGroupCount', cardinality(v_group_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.delete_photos_and_resolve_groups(uuid, uuid[]) IS
  'Atomically bulk deletes selected photos, repairs every affected similarity group, and updates project photo_count once.';

REVOKE ALL ON FUNCTION public.delete_photos_and_resolve_groups(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_photos_and_resolve_groups(uuid, uuid[]) TO service_role;
