-- 일회성 백필: delete_photo_and_resolve_group RPC(20260720_delete_photo_group_cleanup.sql) 도입
-- 이전에 발생한 손상된 photo_groups 데이터를 정리한다. 과거에는 사진 삭제 시 그룹을 전혀
-- 정리하지 않았으므로, 대표컷이 사라진 채 방치된 그룹이나 실제 멤버 수와 photo_count가
-- 어긋난 그룹이 남아있을 수 있다.
DO $$
DECLARE
  v_group RECORD;
  v_new_representative uuid;
BEGIN
  -- 1) 멤버가 1명 이하로 줄어든 그룹 해체
  --    (photos.similarity_group_id는 ON DELETE SET NULL이라, 남은 1명이 있어도 그룹 삭제 시 자동으로 풀린다)
  FOR v_group IN
    SELECT pg.id
    FROM public.photo_groups pg
    WHERE (SELECT COUNT(*) FROM public.photos ph WHERE ph.similarity_group_id = pg.id) < 2
  LOOP
    DELETE FROM public.photo_groups WHERE id = v_group.id;
  END LOOP;

  -- 2) 대표컷이 사라진(NULL) 채 남아있는 그룹에 새 대표컷 지정
  --    (delete_photo_and_resolve_group과 동일한 근사 규칙: blur_variance 내림차순, 동률/NULL이면 number 오름차순)
  FOR v_group IN
    SELECT id FROM public.photo_groups WHERE representative_photo_id IS NULL
  LOOP
    SELECT id INTO v_new_representative
    FROM public.photos
    WHERE similarity_group_id = v_group.id
    ORDER BY blur_variance DESC NULLS LAST, number ASC
    LIMIT 1;

    IF v_new_representative IS NOT NULL THEN
      UPDATE public.photo_groups SET representative_photo_id = v_new_representative WHERE id = v_group.id;
    END IF;
  END LOOP;

  -- 3) photo_count를 실제 멤버 수로 재계산
  UPDATE public.photo_groups pg
  SET photo_count = sub.actual_count
  FROM (
    SELECT similarity_group_id AS group_id, COUNT(*) AS actual_count
    FROM public.photos
    WHERE similarity_group_id IS NOT NULL
    GROUP BY similarity_group_id
  ) sub
  WHERE pg.id = sub.group_id AND pg.photo_count IS DISTINCT FROM sub.actual_count;
END;
$$;
