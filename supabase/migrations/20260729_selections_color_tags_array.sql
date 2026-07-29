-- 컬러칩(색상 태그) 동시 저장 시 lost update 수정.
-- 기존 color_tag(TEXT, "red,blue" 콤마 문자열)는 전체 배열 교체 방식이라
-- 서로 다른 세션이 동시에 다른 색을 추가하면 한쪽이 완전히 유실된다.
-- color_tags(TEXT[])를 새 source of truth로 두고, 색상 하나 단위의 원자적
-- add/remove RPC로 전환한다.

-- 1. 배열 컬럼 추가 + 백필(빈 값/공백/중복/허용되지 않은 색상 정리)
ALTER TABLE selections ADD COLUMN IF NOT EXISTS color_tags TEXT[] NOT NULL DEFAULT '{}';

UPDATE selections
SET color_tags = COALESCE((
  SELECT ARRAY(
    SELECT DISTINCT trim(c)
    FROM unnest(string_to_array(color_tag, ',')) AS c
    WHERE trim(c) IN ('red', 'yellow', 'green', 'blue', 'purple')
  )
), '{}')
WHERE color_tag IS NOT NULL;

-- 2. 원자적 add/remove RPC. ON CONFLICT는 (project_id, photo_id) 컬럼 목록으로
--    지정해 실제 unique 제약 이름(selections_project_id_photo_id_key)에 의존하지 않는다.
CREATE OR REPLACE FUNCTION toggle_selection_color(
  p_project_id uuid, p_photo_id uuid, p_color text, p_add boolean
) RETURNS text[] AS $$
DECLARE result text[];
BEGIN
  IF p_color NOT IN ('red', 'yellow', 'green', 'blue', 'purple') THEN
    RAISE EXCEPTION 'invalid color: %', p_color;
  END IF;
  INSERT INTO selections (project_id, photo_id, color_tags)
  VALUES (p_project_id, p_photo_id, CASE WHEN p_add THEN ARRAY[p_color] ELSE ARRAY[]::text[] END)
  ON CONFLICT (project_id, photo_id) DO UPDATE SET
    color_tags = CASE
      WHEN p_add THEN array_append(array_remove(selections.color_tags, p_color), p_color)
      ELSE array_remove(selections.color_tags, p_color)
    END
  RETURNING color_tags INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SECURITY DEFINER 함수는 기본적으로 PUBLIC 실행 권한을 가질 수 있어, anon/authenticated
-- 롤(브라우저 노출 anon 키로 PostgREST /rpc/ 엔드포인트를 통해 누구나 호출 가능)이 Next.js API
-- 라우트의 검증을 완전히 우회해 직접 호출할 위험이 있다 — 반드시 회수한다.
REVOKE ALL ON FUNCTION toggle_selection_color(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION toggle_selection_color(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION toggle_selection_color(uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION toggle_selection_color(uuid, uuid, text, boolean) TO service_role;

-- 3. 배포 전환 구간 임시 동기화 트리거.
--    마이그레이션(백필)과 신버전 프론트 배포 사이에는 시간차가 있어, 그 사이 구버전 앱이
--    여전히 살아있는 브라우저 탭에서 color_tag(구 필드)로 계속 쓰기를 시도할 수 있다.
--    신버전은 color_tags만 읽으므로, 이 구간의 구버전 쓰기가 안 보이면(유실) 안 된다.
--    이 트리거는 color_tag가 실제로 바뀔 때만 color_tags에 동기화한다 — 신버전 RPC는
--    color_tag를 아예 건드리지 않으므로 이 조건에 걸리지 않아 신버전의 원자적 병합
--    결과를 덮어쓰지 않는다.
--    ⚠️ 신버전이 완전히 롤아웃된 것을 확인한 뒤, 별도 승인을 거쳐 이 트리거와 함수를
--    DROP하고 API에서 레거시 color_tag 필드를 명시적으로 거부하도록 강화한다(이번 라운드 범위 아님).
CREATE OR REPLACE FUNCTION sync_color_tag_to_color_tags() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.color_tag IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.color_tag IS DISTINCT FROM OLD.color_tag) THEN
    NEW.color_tags := COALESCE((
      SELECT ARRAY(
        SELECT DISTINCT trim(c) FROM unnest(string_to_array(NEW.color_tag, ',')) AS c
        WHERE trim(c) IN ('red', 'yellow', 'green', 'blue', 'purple')
      )
    ), '{}');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_color_tag_to_color_tags ON selections;
CREATE TRIGGER trg_sync_color_tag_to_color_tags
  BEFORE INSERT OR UPDATE ON selections
  FOR EACH ROW EXECUTE FUNCTION sync_color_tag_to_color_tags();
