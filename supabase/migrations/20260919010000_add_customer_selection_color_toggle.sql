-- customer_selections.color_tags 동시 저장 lost-update 방지.
-- 작가 플로우에서 이미 겪은 문제(20260729_selections_color_tags_array.sql)와 동일한 클래스라
-- 같은 원자적 add/remove RPC 패턴을 그대로 재사용한다 — 여러 참가자가 동시에 같은 사진에
-- 서로 다른 색을 찜하는 것이 이 기능의 핵심 시나리오라 처음부터 배열 전체교체 방식을 쓰지 않는다.

CREATE OR REPLACE FUNCTION toggle_customer_selection_color(
  p_project_id uuid, p_photo_id uuid, p_color text, p_add boolean
) RETURNS text[] AS $$
DECLARE result text[];
BEGIN
  IF p_color NOT IN ('red', 'yellow', 'green', 'blue', 'purple') THEN
    RAISE EXCEPTION 'invalid color: %', p_color;
  END IF;
  INSERT INTO customer_selections (project_id, photo_id, color_tags)
  VALUES (p_project_id, p_photo_id, CASE WHEN p_add THEN ARRAY[p_color] ELSE ARRAY[]::text[] END)
  ON CONFLICT (project_id, photo_id) DO UPDATE SET
    color_tags = CASE
      WHEN p_add THEN array_append(array_remove(customer_selections.color_tags, p_color), p_color)
      ELSE array_remove(customer_selections.color_tags, p_color)
    END,
    updated_at = now()
  RETURNING color_tags INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION toggle_customer_selection_color(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION toggle_customer_selection_color(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION toggle_customer_selection_color(uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION toggle_customer_selection_color(uuid, uuid, text, boolean) TO service_role;
