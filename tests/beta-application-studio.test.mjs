import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, console, require: name => {
    assert.ok(mocks[name], name);
    return mocks[name];
  } });
  return module.exports;
}

let loggedIn = true;
const writes = [];
const query = { select() { return query; }, eq() { return query; }, limit() { return query; },
  async single() { return { data: { id: "account", email: "test@example.com" } }; } };
const { POST } = load("src/app/api/beta/applications/route.ts", {
  "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
  "@/lib/supabase/server": { createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: loggedIn ? { user: { id: "auth" } } : null } }) },
    from: () => query,
  }) },
  "@/lib/supabase-admin": { getAdminClient: () => ({ from: () => ({
    select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; },
    async insert(value) { writes.push(value); return { error: null }; },
  }) }) },
  "@/lib/phone": load("src/lib/phone.ts"),
  "@/lib/beta-application": load("src/lib/beta-application.ts"),
});
const valid = {
  name: "담당자", phone: "010-1234-5678", genres: ["profile"],
  monthly_project_range: "1_3", avg_photos_range: "under_500",
  workflow_methods: ["email"], desired_features: ["customer_gallery"],
  privacy_consent: true, contact_consent: true,
};
const submit = studio_name => POST({ json: async () => ({ ...valid, studio_name }) });
for (const invalid of [undefined, null, 123, {}, "", "   "]) {
  const result = await submit(invalid);
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "스튜디오·업체명을 입력해 주세요.");
}
assert.equal((await submit("가".repeat(101))).status, 400);
assert.equal(writes.length, 0);
assert.equal((await submit("  봄 스튜디오  ")).status, 201);
assert.equal(writes[0].additional_answers.studio_name, "봄 스튜디오");
assert.equal((await submit("가".repeat(100))).status, 201);
loggedIn = false;
assert.equal((await submit("봄 스튜디오")).status, 401);
assert.equal(writes.length, 2);
console.log("PASS: required studio name, type/length validation, trimmed persistence and authentication.");
