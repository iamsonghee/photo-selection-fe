\set ON_ERROR_STOP on
-- 임시 PostgreSQL 전용. 운영 DB에서 실행하지 않는다.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE EXTENSION dblink;
CREATE TABLE projects (id uuid PRIMARY KEY, status text, revision_round int NOT NULL DEFAULT 0, max_revision_count int NOT NULL DEFAULT 1, updated_at timestamptz, delivered_at timestamptz);
CREATE TABLE photos (id uuid PRIMARY KEY, project_id uuid REFERENCES projects);
CREATE TABLE selections (project_id uuid, photo_id uuid, is_selected boolean DEFAULT false, rating int DEFAULT 0);
CREATE TABLE photo_versions (id uuid PRIMARY KEY, photo_id uuid REFERENCES photos, version int, created_at timestamptz DEFAULT now());
CREATE TABLE version_reviews (photo_version_id uuid UNIQUE REFERENCES photo_versions, photo_id uuid REFERENCES photos, status text CHECK(status IN ('approved','revision_requested')), customer_comment text, reviewed_at timestamptz);
CREATE TABLE version_review_drafts (project_id uuid, comment text);
CREATE TABLE resolved (project_id uuid, delivered boolean);
CREATE FUNCTION resolve_retouch_delivery_archive(uuid, boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO resolved VALUES ($1,$2) $$;
\ir ../../supabase/migrations/20261011010000_atomic_customer_review_submission.sql
INSERT INTO projects (id,status) VALUES ('00000000-0000-0000-0000-000000000001','reviewing_v1');
INSERT INTO photos VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
INSERT INTO selections (project_id,photo_id,is_selected) SELECT project_id,id,id='10000000-0000-0000-0000-000000000001'::uuid FROM photos;
INSERT INTO photo_versions (id,photo_id,version) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',1);
INSERT INTO version_review_drafts VALUES ('00000000-0000-0000-0000-000000000001','draft');
CREATE FUNCTION review_payload(s text) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('photo_version_id','20000000-0000-0000-0000-000000000001','photo_id','10000000-0000-0000-0000-000000000001','status',s)) $$;
CREATE FUNCTION fail_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive_failure'; END $$;
CREATE TRIGGER fail_archive BEFORE INSERT ON resolved FOR EACH ROW EXECUTE FUNCTION fail_archive();
DO $$ BEGIN
  BEGIN
    PERFORM submit_customer_version_reviews('00000000-0000-0000-0000-000000000001','reviewing_v1',review_payload('approved'));
    RAISE EXCEPTION 'expected failure';
  EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM = 'archive_failure'; END;
  ASSERT (SELECT status='reviewing_v1' FROM projects);
  ASSERT NOT EXISTS (SELECT FROM version_reviews);
  ASSERT EXISTS (SELECT FROM version_review_drafts);
END $$;
DROP TRIGGER fail_archive ON resolved;
DO $$ DECLARE bad jsonb; BEGIN
  FOREACH bad IN ARRAY ARRAY[review_payload('invalid'), review_payload('approved') || review_payload('approved'), jsonb_set(review_payload('approved'),'{0,photo_id}','"10000000-0000-0000-0000-000000000002"'), '[]'::jsonb] LOOP
    BEGIN
      PERFORM submit_customer_version_reviews('00000000-0000-0000-0000-000000000001','reviewing_v1',bad);
      RAISE EXCEPTION 'expected failure';
    EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='invalid_reviews'; END;
  END LOOP;
END $$;
-- 서로 다른 연결의 동시 제출: 후발 요청은 선발 commit을 기다린 후 아무것도 쓰지 못한다.
SELECT dblink_connect('winner','dbname=postgres user=postgres');
SELECT dblink_connect('loser','dbname=postgres user=postgres');
SELECT dblink_exec('winner','BEGIN');
SELECT * FROM dblink('winner',$q$SELECT submit_customer_version_reviews('00000000-0000-0000-0000-000000000001','reviewing_v1',review_payload('approved'))$q$) AS t(status text);
SELECT dblink_send_query('loser',$q$SELECT submit_customer_version_reviews('00000000-0000-0000-0000-000000000001','reviewing_v1',review_payload('revision_requested'))$q$);
SELECT dblink_exec('winner','COMMIT');
SELECT * FROM dblink_get_result('loser',false) AS t(status text);
DO $$ BEGIN
  ASSERT (SELECT status='delivered' AND delivered_at IS NOT NULL FROM projects);
  ASSERT (SELECT status='approved' FROM version_reviews);
  ASSERT NOT EXISTS (SELECT FROM version_review_drafts);
  ASSERT (SELECT count(*) FROM resolved)=1;
  ASSERT NOT has_function_privilege('anon','submit_customer_version_reviews(uuid,text,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','submit_customer_version_reviews(uuid,text,jsonb)','EXECUTE');
END $$;
UPDATE projects SET status='reviewing_v1';
SELECT submit_customer_version_reviews('00000000-0000-0000-0000-000000000001','reviewing_v1',review_payload('revision_requested'));
DO $$ BEGIN ASSERT (SELECT status='editing_v2' AND revision_round=1 FROM projects); END $$;
\echo 'PASS: concurrent submission, rollback, selected-only targets, validation, revision round and RPC permissions'
