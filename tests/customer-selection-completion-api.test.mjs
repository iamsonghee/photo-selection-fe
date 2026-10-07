import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class NextResponse {
  static json(body, init = {}) { return Object.assign(new NextResponse(), { body, status: init.status ?? 200 }); }
}
let access, count, failRead, failWrite, writes;
const admin = { from(table) {
  const filters = [];
  let payload;
  const query = {
    select() { return query; },
    eq(key, value) { filters.push([key, value]); return query; },
    update(value) { payload = value; return query; },
    then(resolve) {
      if (table === "customer_selections") return Promise.resolve({ count, error: failRead }).then(resolve);
      writes.push({ payload, filters });
      return Promise.resolve({ error: failWrite }).then(resolve);
    },
  };
  return query;
} };
const module = { exports: {} };
const mocks = {
  "next/server": { NextResponse },
  "@/lib/supabase-admin": { getAdminClient: () => admin },
  "@/lib/customer-select-server": { resolveCustomerProjectAccess: async () => access, shareTokenFromRequest: () => null },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/customer-select/projects/[id]/complete-selection/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, require: name => { assert.ok(mocks[name], name); return mocks[name]; }, Date });
const run = () => module.exports.POST({}, { params: Promise.resolve({ id: "p1" }) });
const reset = () => { access = { isOwner: true, project: { owner_id: "owner", selection_completed_at: null } }; count = 2; failRead = null; failWrite = null; writes = []; };
reset(); access = NextResponse.json({}, { status: 401 }); assert.equal((await run()).status, 401); assert.equal(writes.length, 0);
reset(); access.isOwner = false; assert.equal((await run()).status, 403); assert.equal(writes.length, 0);
reset(); count = 0; assert.equal((await run()).status, 400); assert.equal(writes.length, 0);
reset(); failRead = {}; assert.equal((await run()).status, 500); assert.equal(writes.length, 0);
reset(); failWrite = {}; assert.equal((await run()).status, 500);
reset(); assert.equal((await run()).status, 200);
assert.deepEqual(Object.keys(writes[0].payload), ["selection_completed_at"]);
assert.deepEqual(writes[0].filters, [["id", "p1"], ["owner_id", "owner"]]);
reset(); access.project.selection_completed_at = "2026-10-01T00:00:00Z";
assert.equal((await run()).body.selectionCompletedAt, access.project.selection_completed_at);
console.log("selection completion API: owner, empty, failures, completion-only and repeat checks passed");
