-- "묶음에서 제외" — 사진 자체는 지우지 않고 유사컷 그룹 소속만 해제한다.
-- delete_photo_and_resolve_group과 동일한 잠금 순서(사진 행 -> 그룹 행 FOR UPDATE)와
-- 재배치 규칙(남은 인원 <2면 그룹 해체, 대표컷이었으면 blur_variance 기준 재지정, 아니면
-- photo_count만 갱신)을 그대로 따르되, DELETE FROM photos 대신 similarity_group_id만 NULL로
-- 바꾼다.
--
-- 주의: 이 함수 호출 뒤에는 clip-service의 sync-groups(저장된 임베딩만으로 그룹을 처음부터
-- 다시 계산)를 절대 호출하지 않는다 — 방금 작가가 명시적으로 그룹에서 뺀 사진을 sync-groups가
-- 다시 같은 그룹으로 합쳐버릴 수 있다(수동 오버라이드 무효화). 이 수동 제외 상태는 다음
-- "AI 유사컷 분석"을 명시적으로 다시 돌리기 전까지 유지되어야 한다.
CREATE OR REPLACE FUNCTION public.remove_photo_from_group(p_photo_id uuid)
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

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('groupId', NULL);
  END IF;

  -- 같은 그룹에 대한 동시 변경 요청을 직렬화 (delete_photo_and_resolve_group과 동일한 잠금 순서)
  PERFORM 1 FROM public.photo_groups WHERE id = v_group_id FOR UPDATE;

  -- 사진 자체는 지우지 않고 그룹 소속만 해제한다.
  UPDATE public.photos SET similarity_group_id = NULL WHERE id = p_photo_id;

  SELECT COUNT(*)::integer INTO v_remaining_count
  FROM public.photos WHERE similarity_group_id = v_group_id;

  IF v_remaining_count < 2 THEN
    -- 그룹 해체: FK(photos.similarity_group_id ON DELETE SET NULL)가 남은 멤버(있다면)의
    -- similarity_group_id를 자동으로 NULL 처리한다.
    DELETE FROM public.photo_groups WHERE id = v_group_id;
    RETURN jsonb_build_object('groupId', v_group_id, 'action', 'disbanded', 'remainingCount', v_remaining_count);
  END IF;

  IF v_was_representative THEN
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

COMMENT ON FUNCTION public.remove_photo_from_group(uuid) IS
  'Removes one photo from its similarity group without deleting the photo row (reassigns representative photo, updates photo_count, or disbands the group if fewer than 2 members remain). Manual override — callers must NOT invoke clip-service sync-groups afterward.';

REVOKE ALL ON FUNCTION public.remove_photo_from_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_photo_from_group(uuid) TO service_role;
