import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const cid = "20000000-0000-4000-8000-000000000001";
const foreignId = "20000000-0000-4000-8000-000000000002";
const now = "2026-10-03T10:00:00.000Z";
let sessionOwner = owner;
let fail = false;
let tables;
let updates;
const calls = [];
function reset() {
  sessionOwner = owner; fail = false; updates = [];
  tables = {
    photographer_customers: [
      { id: cid, photographer_id: owner, name: "김지민", phone: "01011112222", note: "원래 메모", updated_at: now },
      { id: foreignId, photographer_id: other, name: "다른 작가 고객", phone: "01033334444", note: "비공개", updated_at: now },
    ],
    photographer_customer_summaries: [{ id: cid, photographer_id: owner, name: "김지민", phone: "01011112222", project_count: 2, active_project_count: 1, first_shoot_date: "2025-01-01", latest_shoot_date: "2026-10-01" }],
    projects: [{ id: "p1", photographer_id: owner, customer_id: cid, customer_name: "과거 이름", name: "기존 촬영", shoot_date: "2026-10-01", status: "delivered", photo_count: 2, cover_photo_id: "photo2" }],
    photos: [{ id: "photo1", project_id: "p1", number: 1, r2_thumb_url: "first.jpg" }, { id: "photo2", project_id: "p1", number: 2, r2_thumb_url: "cover.jpg" }],
    photographers: [{ id: owner, auth_id: "auth1", email: "fixture@example.com", beta_status: "active", total_projects_created: 1 }],
    admin_audit_logs: [], project_logs: [],
  };
}
const admin = { from(table) {
  let filters = [], operation = "select", payload, range, options = {}, one = false;
  const query = {
    select(_columns, opts = {}) { options = opts; return query; },
    eq(key, value) { filters.push(row => row[key] === value); calls.push({ table, key, value }); return query; },
    in(key, values) { filters.push(row => values.includes(row[key])); return query; },
    gt(key, value) { filters.push(row => row[key] > value); return query; },
    lte(key, value) { filters.push(row => row[key] <= value); return query; },
    ilike(key, pattern) { const term = pattern.slice(1,-1).replace(/\\([%_\\])/g,'$1'); filters.push(row => String(row[key] ?? '').includes(term)); return query; },
    order() { return query; }, limit() { return query; },
    range(start, end) { range = [start,end]; return query; },
    update(value) { operation = "update"; payload = value; return query; },
    insert(value) { operation = "insert"; payload = value; return query; },
    maybeSingle() { one = true; return query; }, single() { one = true; return query; },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (fail) return { data: null, error: { message: "fixture DB failure" }, count: null };
        let rows = (tables[table] ?? []).filter(row => filters.every(fn => fn(row)));
        const count = rows.length;
        if (operation === "update") {
          if (table === "photographer_customers" && payload.name && payload.phone && tables[table].some(row => !rows.includes(row) && row.photographer_id === owner && row.name === payload.name && row.phone === payload.phone)) return { data:null,error:{code:"23505"} };
          rows.forEach(row => Object.assign(row, payload)); updates.push({ table, payload, matched: rows.length });
        }
        if (operation === "insert") { rows = [{ id: "new-project", ...payload }]; tables[table].push(...rows); }
        if (range) rows = rows.slice(range[0],range[1]+1);
        return { data: options.head ? null : one ? rows[0] ?? null : rows, count, error: null };
      }).then(resolve, reject);
    },
  }; return query;
} };
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file,"utf8"), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ status:init.status ?? 200, body }) } },
    "@/lib/photographer-session-auth": { getPhotographerIdFromSession: async () => sessionOwner },
    "@/lib/supabase-admin": { getAdminClient: () => admin },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getSession: async () => ({ data:{ session:sessionOwner ? { user:{id:"auth1"} } : null } }) } }) },
    "@/lib/app-settings": { getAppSettings: async () => ({}) },
    "@/lib/beta-policy": { getPolicyForPhotographer: () => ({tier:"beta",maxProjects:10}) },
  };
  vm.runInNewContext(code,{ module, exports:module.exports, require: name => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    throw new Error(`Unexpected dependency: ${name}`);
  },console:{error(){}},Date,Number,Map,Set,URL,crypto:globalThis.crypto });
  cache.set(file,module.exports); return module.exports;
}
const list = load("src/app/api/photographer/customers/route.ts");
const detail = load("src/app/api/photographer/customers/[id]/route.ts");
const create = load("src/app/api/photographer/projects/route.ts");
const req = (body = {}, query = "") => ({json:async()=>body,nextUrl:new URL(`http://localhost/api?${query}`)});
const ctx = id => ({params:Promise.resolve({id})});
reset();
assert.equal((await list.GET(req())).body.customers.length,1);
assert.equal((await list.GET(req({},"q=010-1111"))).body.customers.length,1);
assert.equal((await list.GET(req({},"page=0"))).status,400);
assert.equal((await list.GET(req({},"filter=invalid"))).status,400);
assert.equal((await detail.GET(req(),ctx(cid))).body.customer.projects[0].thumbnailUrl,"cover.jpg");
assert.equal((await detail.GET(req(),ctx(foreignId))).status,404);
assert.equal((await detail.PATCH(req({note:"no",updatedAt:now}),ctx(foreignId))).status,404);
assert.equal((await detail.PATCH(req({note:"a".repeat(2001),updatedAt:now}),ctx(cid))).status,400);
assert.equal((await detail.PATCH(req({name:" ",phone:null,updatedAt:now}),ctx(cid))).status,400);
assert.equal((await detail.PATCH(req({name:"名前",phone:"wrong",updatedAt:now}),ctx(cid))).status,400);
assert.equal((await detail.PATCH(req({note:"no"}),ctx(cid))).status,400);
const saved = await detail.PATCH(req({name:"新 이름",phone:"010-5555-6666",updatedAt:now}),ctx(cid));
assert.equal(saved.status,200);
assert.equal(saved.body.customer.phone,"01055556666");
assert.equal(tables.projects[0].customer_name,"과거 이름", "master edit never writes project snapshots");
assert(updates.every(row => row.table === "photographer_customers"));
assert.equal((await detail.PATCH(req({note:"stale edit",updatedAt:now}),ctx(cid))).status,409);
const currentTime=saved.body.customer.updatedAt;
assert.equal((await detail.PATCH(req({note:"새 메모",updatedAt:currentTime}),ctx(cid))).status,200);
assert.equal((await detail.GET(req(),ctx(cid))).body.customer.note,"새 메모");
tables.photographer_customers.push({ id:"duplicate",photographer_id:owner,name:"중복",phone:"01099998888",updated_at:now });
assert.equal((await detail.PATCH(req({name:"중복",phone:"01099998888",updatedAt:tables.photographer_customers[0].updated_at}),ctx(cid))).status,409);
sessionOwner=null;
assert.equal((await list.GET(req())).status,401);
assert.equal((await detail.GET(req(),ctx(cid))).status,401);
assert.equal((await detail.PATCH(req({note:"no",updatedAt:now}),ctx(cid))).status,401);
reset(); fail=true;
assert.equal((await list.GET(req())).status,500);
assert.equal((await detail.PATCH(req({note:"no",updatedAt:now}),ctx(cid))).status,500);
reset();
const projectBody={name:"새 촬영",customer_name:"김지민",customer_phone:"01011112222",customer_id:cid,shoot_date:"2026-10-01",deadline:"2026-10-10",required_count:1};
assert.equal((await create.POST(req({...projectBody,customer_id:foreignId}))).status,404);
assert.equal((await create.POST(req({...projectBody,customer_name:"stale name"}))).status,409);
assert.equal((await create.POST(req({...projectBody,customer_id:"bad"}))).status,400);
assert.equal((await create.POST(req(projectBody))).status,201);
assert.equal(tables.projects.at(-1).customer_id,cid);
assert(calls.filter(call => call.table === "photographer_customers" && call.key === "photographer_id").every(call => call.value === owner));
console.log("Customer APIs: ownership, validation, persistent edits, conflict detection, DB failures and linked project creation passed.");
