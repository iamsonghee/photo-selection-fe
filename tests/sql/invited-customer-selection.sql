\set ON_ERROR_STOP on
-- 빈 임시 PostgreSQL 전용: 운영 DB에서 실행하지 않는다.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE projects (id uuid PRIMARY KEY, photographer_id uuid NOT NULL, required_count int NOT NULL, status text NOT NULL, confirmed_at timestamptz, updated_at timestamptz);
CREATE TABLE photos (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
CREATE TABLE selections (project_id uuid REFERENCES projects(id), photo_id uuid REFERENCES photos(id), is_selected boolean DEFAULT false, rating int DEFAULT 0, color_tags text[], comment text, PRIMARY KEY(project_id, photo_id));
CREATE TABLE project_logs (project_id uuid, photographer_id uuid, action text);
\ir ../../supabase/migrations/20260910000000_add_project_participants.sql
\ir ../../supabase/migrations/20260916000000_enforce_customer_selection_limit.sql
INSERT INTO projects VALUES ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, 'selecting', null, null), ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 1, 'selecting', null, null);
INSERT INTO photos SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000001'::uuid FROM generate_series(1,3) n;
INSERT INTO photos VALUES ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002');
INSERT INTO selections VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', true, 4, ARRAY['blue'], '다시 볼 후보');
\ir ../../supabase/migrations/20261010000000_simplify_invited_customer_selection.sql
\ir ../../supabase/migrations/20261011000000_ignore_unrated_selection_defaults.sql
INSERT INTO selections (project_id, photo_id) VALUES ('00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004');
DO $$ BEGIN
  ASSERT NOT (SELECT selection_uses_ratings FROM projects WHERE id = '00000000-0000-0000-0000-000000000002');
  UPDATE selections SET rating = 0 WHERE project_id = '00000000-0000-0000-0000-000000000002';
  ASSERT NOT (SELECT selection_uses_ratings FROM projects WHERE id = '00000000-0000-0000-0000-000000000002');
END $$;
DELETE FROM selections WHERE project_id = '00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  ASSERT (SELECT selection_uses_ratings FROM projects WHERE id = '00000000-0000-0000-0000-000000000001');
  ASSERT NOT (SELECT selection_uses_ratings FROM projects WHERE id = '00000000-0000-0000-0000-000000000002');
  ASSERT (SELECT count(*) FROM project_participants WHERE color = 'blue') = 1;
  UPDATE selections SET rating = null;
  ASSERT (SELECT selection_uses_ratings FROM projects WHERE id = '00000000-0000-0000-0000-000000000001');
  UPDATE selections SET rating = 4;
  ASSERT confirm_customer_selection('00000000-0000-0000-0000-000000000001', ARRAY['20000000-0000-0000-0000-000000000001']::uuid[]) = 'invalid_photos';
  ASSERT confirm_customer_selection('00000000-0000-0000-0000-000000000001', ARRAY['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001']::uuid[]) = 'invalid_photos';
  ASSERT confirm_customer_selection('00000000-0000-0000-0000-000000000001', ARRAY['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004']::uuid[]) = 'invalid_photos';
  ASSERT confirm_customer_selection('00000000-0000-0000-0000-000000000001', ARRAY['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002']::uuid[]) = 'saved';
  ASSERT (SELECT count(*) FROM selections WHERE is_selected) = 2;
  ASSERT (SELECT comment = '다시 볼 후보' AND rating = 4 AND color_tags = ARRAY['blue'] AND NOT is_selected FROM selections WHERE photo_id = '20000000-0000-0000-0000-000000000003');
  ASSERT (SELECT count(*) FROM project_logs) = 1;
  ASSERT set_customer_selection_states('00000000-0000-0000-0000-000000000001', ARRAY['20000000-0000-0000-0000-000000000003']::uuid[], true) = 'invalid_project_state';
  UPDATE projects SET status = 'selecting' WHERE id = '00000000-0000-0000-0000-000000000001';
  ASSERT (SELECT comment = '다시 볼 후보' FROM selections WHERE photo_id = '20000000-0000-0000-0000-000000000003');
END $$;
CREATE FUNCTION fail_test_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test log failure'; END $$;
CREATE TRIGGER fail_test_log BEFORE INSERT ON project_logs FOR EACH ROW EXECUTE FUNCTION fail_test_log();
DO $$ BEGIN
  BEGIN
    PERFORM confirm_customer_selection('00000000-0000-0000-0000-000000000002', ARRAY['20000000-0000-0000-0000-000000000004']::uuid[]);
    RAISE EXCEPTION 'expected log failure';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'test log failure';
  END;
  ASSERT (SELECT status = 'selecting' FROM projects WHERE id = '00000000-0000-0000-0000-000000000002');
  ASSERT NOT EXISTS (SELECT 1 FROM selections WHERE project_id = '00000000-0000-0000-0000-000000000002');
  ASSERT NOT has_function_privilege('anon', 'confirm_customer_selection(uuid,uuid[])', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'confirm_customer_selection(uuid,uuid[])', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'confirm_customer_selection(uuid,uuid[])', 'EXECUTE');
END $$;
\echo 'PASS: sticky legacy ratings, reserved legacy participants, retained candidates, count/ownership checks, confirmation locking, rollback and RPC permissions'
