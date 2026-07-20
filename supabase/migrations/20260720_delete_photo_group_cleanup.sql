-- 사진 삭제 시 photo_groups(유사컷 그룹) 정합성이 깨지는 문제 수정.
-- 기존에는 DELETE /api/photographer/photos/[photoId]가 photos 행만 지우고 photo_groups는
-- 전혀 건드리지 않았다. 대표컷(representative_photo_id)이 삭제되면 FK(ON DELETE SET NULL)로
-- 그 값만 NULL이 될 뿐 새 대표컷이 지정되지 않고, FE의 그룹 접기 렌더링 로직은 대표컷 조건을
-- 만족하는 사진이 하나도 없으면 그 그룹의 모든 멤버를 화면에서 누락시킨다. 또한 photo_count는
-- 갱신되지 않아 "+N" 배지가 실제 잔여 수보다 많게 표시된다.
--
-- "삭제 -> 그룹 재조회 -> 재지정/카운트 갱신"을 여러 PostgREST 호출로 나누면 그 사이에 원자성이
-- 깨질 수 있으므로(insert_photos_with_numbers와 동일한 이유), 하나의 함수 안에서 그룹 행을
-- 잠그고 전부 처리한다.
CREATE OR REPLACE FUNCTION public.delete_photo_and_resolve_group(p_photo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_was_representative boolean;
  v_remaining_count integer;
  v_new_representative uuid;
BEGIN
  SELECT p.similarity_group_id, (pg.representative_photo_id = p.id)
  INTO v_group_id, v_was_representative
  FROM public.photos p
  LEFT JOIN public.photo_groups pg ON pg.id = p.similarity_group_id
  WHERE p.id = p_photo_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo not found' USING ERRCODE = 'P0001';
  END IF;

  -- 같은 그룹에 대한 동시 삭제 요청을 직렬화 (그룹 행이 있을 때만)
  IF v_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.photo_groups WHERE id = v_group_id FOR UPDATE;
  END IF;

  DELETE FROM public.photos WHERE id = p_photo_id;
  -- representative_photo_id는 FK(ON DELETE SET NULL)로 이미 NULL 처리되었을 수 있음

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('groupId', NULL);
  END IF;

  SELECT COUNT(*)::integer INTO v_remaining_count
  FROM public.photos WHERE similarity_group_id = v_group_id;

  IF v_remaining_count < 2 THEN
    -- 그룹 해체: FK(photos.similarity_group_id ON DELETE SET NULL)가 남은 멤버(있다면)의
    -- similarity_group_id를 자동으로 NULL 처리한다.
    DELETE FROM public.photo_groups WHERE id = v_group_id;
    RETURN jsonb_build_object('groupId', v_group_id, 'action', 'disbanded', 'remainingCount', v_remaining_count);
  END IF;

  IF v_was_representative THEN
    -- 근사치 재지정: blur_variance(값이 클수록 선명) 내림차순, 동률/NULL이면 number 오름차순.
    -- clip-service의 원래 대표컷 산정(블러+노출 합성 점수)과 완전히 동일하지는 않다 —
    -- 여기서는 이미 저장된 blur_variance만 재사용하며 노출 점수는 반영하지 않는다.
    SELECT id INTO v_new_representative
    FROM public.photos
    WHERE similarity_group_id = v_group_id
    ORDER BY blur_variance DESC NULLS LAST, number ASC
    LIMIT 1;

    UPDATE public.photo_groups
    SET representative_photo_id = v_new_representative, photo_count = v_remaining_count
    WHERE id = v_group_id;

    RETURN jsonb_build_object(
      'groupId', v_group_id,
      'action', 'reassigned',
      'representativePhotoId', v_new_representative,
      'photoCount', v_remaining_count
    );
  END IF;

  UPDATE public.photo_groups SET photo_count = v_remaining_count WHERE id = v_group_id;
  RETURN jsonb_build_object('groupId', v_group_id, 'action', 'updated', 'photoCount', v_remaining_count);
END;
$$;

COMMENT ON FUNCTION public.delete_photo_and_resolve_group(uuid) IS
  'Atomically deletes a photo and repairs its similarity group (reassigns representative photo, updates photo_count, or disbands the group if fewer than 2 members remain).';

REVOKE ALL ON FUNCTION public.delete_photo_and_resolve_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_photo_and_resolve_group(uuid) TO service_role;
