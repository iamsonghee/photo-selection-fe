import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Use a temporary test installation; production dependencies do not need a database engine.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ?? "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE photographers (id uuid PRIMARY KEY, auth_id uuid NOT NULL);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), photographer_id uuid REFERENCES photographers(id) ON DELETE CASCADE,
      customer_name text, customer_phone text, name text DEFAULT '촬영', shoot_date date DEFAULT '2026-10-01', status text DEFAULT 'preparing');
    GRANT SELECT ON photographers TO authenticated;
    INSERT INTO photographers VALUES ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011'),
      ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000022');
    INSERT INTO projects(photographer_id,customer_name,customer_phone) VALUES
      ('10000000-0000-4000-8000-000000000001','김지민','010-1111-2222'),
      ('10000000-0000-4000-8000-000000000001',' 김지민 ','01011112222'),
      ('10000000-0000-4000-8000-000000000001','이름만',''),
      ('10000000-0000-4000-8000-000000000001','이름만',NULL),
      ('10000000-0000-4000-8000-000000000002','김지민','01011112222');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261003150000_add_photographer_customers.sql", import.meta.url), "utf8"));
  const owner = "10000000-0000-4000-8000-000000000001";
  const other = "10000000-0000-4000-8000-000000000002";
  const rows = (await db.query("SELECT * FROM projects ORDER BY customer_name")).rows;
  const jimin = rows.find(row => row.customer_name === "김지민" && row.photographer_id === owner);
  const spaceName = rows.find(row => row.customer_name === " 김지민 ");
  assert.equal(jimin.customer_id, spaceName.customer_id, "backfill normalizes name edges and phone formatting");
  assert.notEqual(jimin.customer_id, rows.find(row => row.photographer_id === other).customer_id, "different owners never share customers");
  assert.equal(new Set(rows.filter(row => row.customer_name === "이름만").map(row => row.customer_id)).size, 2, "missing numbers stay separate");

  const inserted = (await db.query("INSERT INTO projects(photographer_id,customer_name,customer_phone) VALUES ($1,'김지민','01011112222') RETURNING *", [owner])).rows[0];
  assert.equal(inserted.customer_id, jimin.customer_id, "new project reuses matching customer");
  await db.query("UPDATE photographer_customers SET name='새 이름',phone='01033334444',note='고객 메모' WHERE id=$1", [jimin.customer_id]);
  let project = (await db.query("SELECT * FROM projects WHERE id=$1", [jimin.id])).rows[0];
  assert.equal(project.customer_name, "김지민", "master edit preserves old snapshot");
  await db.query("UPDATE projects SET customer_name='김지민',customer_phone='01011112222',name='프로젝트 이름 수정' WHERE id=$1", [jimin.id]);
  project = (await db.query("SELECT * FROM projects WHERE id=$1", [jimin.id])).rows[0];
  assert.equal(project.customer_id, jimin.customer_id, "unchanged snapshot does not relink after master edit");
  await db.query("UPDATE projects SET customer_name='다른 고객' WHERE id=$1", [jimin.id]);
  const moved = (await db.query("SELECT * FROM projects WHERE id=$1", [jimin.id])).rows[0];
  assert.notEqual(moved.customer_id, jimin.customer_id, "editing project identity relinks only that project");
  assert.equal((await db.query("SELECT customer_id FROM projects WHERE id=$1", [spaceName.id])).rows[0].customer_id, jimin.customer_id);
  assert.equal((await db.query("SELECT note FROM photographer_customers WHERE id=$1", [jimin.customer_id])).rows[0].note, "고객 메모");

  const explicit = (await db.query("INSERT INTO projects(photographer_id,customer_name,customer_phone,customer_id) VALUES ($1,'새 이름','01033334444',$2) RETURNING customer_id", [owner,jimin.customer_id])).rows[0];
  assert.equal(explicit.customer_id,jimin.customer_id);
  await assert.rejects(db.query("INSERT INTO projects(photographer_id,customer_name,customer_phone,customer_id) VALUES ($1,'새 이름','01033334444',$2)", [other,jimin.customer_id]), /does not belong/);
  await assert.rejects(db.query("INSERT INTO projects(photographer_id,customer_name,customer_phone,customer_id) VALUES ($1,'낡은 이름','01033334444',$2)", [owner,jimin.customer_id]), /information changed/);
  const noPhone = rows.find(row => row.customer_name === "이름만");
  const explicitNoPhone = (await db.query("INSERT INTO projects(photographer_id,customer_name,customer_id) VALUES ($1,'이름만',$2) RETURNING customer_id", [owner,noPhone.customer_id])).rows[0];
  assert.equal(explicitNoPhone.customer_id, noPhone.customer_id, "explicit customer selection works without phone");

  await db.query("DELETE FROM projects WHERE customer_id=$1", [jimin.customer_id]);
  const retained = (await db.query("SELECT * FROM photographer_customer_summaries WHERE id=$1", [jimin.customer_id])).rows[0];
  assert.equal(retained.project_count,0);
  assert.equal((await db.query("SELECT note FROM photographer_customers WHERE id=$1", [jimin.customer_id])).rows[0].note,"고객 메모");
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',false);`);
  const ownCustomers = (await db.query("SELECT photographer_id FROM photographer_customers")).rows;
  assert(ownCustomers.length > 0 && ownCustomers.every(row => row.photographer_id === owner), "RLS limits reads to owner");
  await assert.rejects(db.query("UPDATE photographer_customers SET note='not allowed'"), /permission denied/);
  await db.exec("RESET ROLE; SET ROLE anon;");
  await assert.rejects(db.query("SELECT * FROM photographer_customers"), /permission denied/);
  await db.exec("RESET ROLE;");
  await db.query("DELETE FROM photographers WHERE id=$1", [owner]);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM photographer_customers WHERE photographer_id=$1", [owner])).rows[0].count,0,"account deletion removes customers");
  console.log("Customer migration: backfill, normalized matching, absent phones, snapshots, relinking, ownership, deletion, RLS and account cascade passed.");
} finally { await db.close(); }
