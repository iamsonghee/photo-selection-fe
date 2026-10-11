import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Date, URLSearchParams, console });
  return module.exports;
}
const filters = load("src/lib/gallery-filter.ts", { react: {} });
const state = filters.parseFilterFromSearchParams(new URLSearchParams("selected=liked&color_tag=red,blue&color_mode=all"));
const photos = ["a", "b", "c"].map((id, orderIndex) => ({ id, orderIndex, url: "", originalFilename: `${id}.jpg` }));
const states = { a: { color: ["red"] }, b: { color: ["red", "blue"] }, c: {} };
assert.equal(filters.getFilteredPhotos(photos, new Set(), states, state).map(p => p.id).join(), "b");
assert.equal(filters.getFilteredPhotos(photos, new Set(), states, { ...state, colorFilter: "all" }).map(p => p.id).join(), "b,a");
assert.equal(filters.parseFilterFromSearchParams(new URLSearchParams(filters.buildFilterQueryString(state))).selectedFilter, "liked");

class NextResponse { static json(body, init = {}) { return Object.assign(new NextResponse(), { body, status: init.status ?? 200 }); } }
let auth, rows, databaseFailure, rpcResult, rpcFailure, calls;
const admin = {
  rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: rpcResult, error: rpcFailure }; },
  from(table) {
    let operation = "read", payload; const conditions = [];
    const q = {
      select() { return q; }, eq(key, value) { conditions.push([key, value]); return q; }, in(key, value) { conditions.push([key, value]); return q; },
      insert(value) { operation = "insert"; payload = value; return q; },
      update(value) { operation = "update"; payload = value; return q; },
      upsert(value) { operation = "upsert"; payload = value[0]; return q; },
      then(resolve) {
        calls.push({ table, operation, payload, conditions });
        if (databaseFailure) return Promise.resolve({ error: { message: "failed" } }).then(resolve);
        if (table === "photos") return Promise.resolve({ data: [{ id: "photo-1" }, { id: "photo-2" }] }).then(resolve);
        if (operation === "insert") {
          if (rows.some(row => row.color === payload.color)) return Promise.resolve({ error: { code: "23505" } }).then(resolve);
          rows.push({ ...payload, done: false });
        } else if (operation === "upsert") {
          const row = rows.find(row => row.color === payload.color);
          if (row) Object.assign(row, payload); else rows.push({ ...payload });
        } else if (operation === "update") {
          rows.filter(row => conditions.every(([key, value]) => row[key] === value)).forEach(row => Object.assign(row, payload));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return q;
  },
};
const mocks = {
  "next/server": { NextResponse },
  "@/lib/supabase-admin": { getAdminClient: () => admin },
  "@/lib/customer-auth-server": { getPinAuthorizedProject: async () => auth },
  "@/lib/gallery-filter": filters,
};
const participants = load("src/app/api/c/participants/route.ts", mocks);
const confirm = load("src/app/api/c/confirm/route.ts", mocks);
const request = body => ({ json: async () => ({ token: "t", project_id: "p", ...body }) });
const reset = () => { auth = { project: { id: "p", status: "selecting", requiredCount: 2 }, error: null }; rows = []; databaseFailure = false; rpcResult = "saved"; rpcFailure = null; calls = []; };
reset(); auth.error = NextResponse.json({}, { status: 401 });
assert.equal((await participants.POST(request({ action: "join", nickname: "나" }))).status, 401); assert.equal(calls.length, 0);
reset(); assert.equal((await participants.POST(request({ action: "join", nickname: " " }))).status, 400);
assert.equal((await participants.POST(request({ color: "red", done: "yes" }))).status, 400);
assert.equal((await participants.POST(request({ color: "red", nickname: "a".repeat(21) }))).status, 400);
reset(); rows = [{ project_id: "p", color: "red", nickname: "기존", done: true }];
const joined = await Promise.all([participants.POST(request({ action: "join", nickname: "신랑" })), participants.POST(request({ action: "join", nickname: "신부" }))]);
assert.equal(new Set(joined.map(result => result.body.color)).size, 2);
assert.ok(joined.every(result => result.status === 200 && result.body.color !== "red"));
assert.equal(rows[0].nickname, "기존");
for (const color of ["green", "blue", "purple"]) if (!rows.some(row => row.color === color)) rows.push({ color, nickname: color });
assert.equal((await participants.POST(request({ action: "join", nickname: "여섯번째" }))).status, 409);
await participants.POST(request({ color: "red", nickname: "이름 수정" })); assert.equal(rows[0].done, true);
await participants.POST(request({ color: "red", done: false })); assert.equal(rows[0].nickname, "이름 수정");
rows[0].last_seen_at = new Date(Date.now() - 60_000).toISOString();
const get = () => participants.GET({ nextUrl: new URL("http://localhost/api?token=t&project_id=p") });
assert.equal((await get()).body.participants.find(row => row.color === "red").online, false);
await participants.POST(request({ action: "heartbeat", color: "red" }));
assert.equal((await get()).body.participants.find(row => row.color === "red").online, true);
reset(); databaseFailure = true; assert.equal((await participants.POST(request({ action: "join", nickname: "나" }))).status, 500);
reset(); assert.equal((await confirm.POST(request({ selected_photo_ids: ["photo-1", "photo-2"] }))).status, 200);
assert.equal(calls.filter(call => call.rpc).length, 1);
assert.equal(calls.at(-1).rpc, "confirm_customer_selection");
assert.ok(calls.every(call => call.operation === undefined || call.operation === "read"));
reset(); assert.equal((await confirm.POST(request({ selected_photo_ids: ["photo-1", "photo-1"] }))).status, 400); assert.equal(calls.length, 0);
reset(); rpcResult = "invalid_project_state"; assert.equal((await confirm.POST(request({ selected_photo_ids: ["photo-1", "photo-2"] }))).status, 409);
reset(); auth.error = NextResponse.json({}, { status: 401 }); assert.equal((await confirm.POST(request({ selected_photo_ids: ["photo-1", "photo-2"] }))).status, 401); assert.equal(calls.length, 0);
console.log("Invited selection: liked filters, PIN auth, auto-allocation race, capacity, partial updates, online timeout, atomic confirmation API passed.");
