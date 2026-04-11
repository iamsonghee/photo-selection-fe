-- 1) display_id 컬럼 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS display_id TEXT;

-- 2) 기존 행 백필 (created_at 순, 작가·날짜별 순번)
WITH ranked AS (
  SELECT
    id,
    to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD') AS date_str,
    ROW_NUMBER() OVER (
      PARTITION BY photographer_id, to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD')
      ORDER BY created_at
    ) AS seq
  FROM projects
  WHERE display_id IS NULL
)
UPDATE projects p
SET display_id = r.date_str || '-' || lpad(r.seq::TEXT, 3, '0')
FROM ranked r
WHERE p.id = r.id;

-- 3) 자동 생성 트리거 함수
CREATE OR REPLACE FUNCTION set_project_display_id()
RETURNS TRIGGER AS $$
DECLARE
  seq_num INT;
  date_str TEXT;
BEGIN
  date_str := to_char(NEW.created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq_num
  FROM projects
  WHERE photographer_id = NEW.photographer_id
    AND to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD') = date_str;
  NEW.display_id := date_str || '-' || lpad(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) 트리거 등록
DROP TRIGGER IF EXISTS trg_set_project_display_id ON projects;
CREATE TRIGGER trg_set_project_display_id
BEFORE INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION set_project_display_id();
