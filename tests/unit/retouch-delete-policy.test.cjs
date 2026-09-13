const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// 실제 DELETE 핸들러를 실행하되 인증·DB·스토리지는 메모리 대역으로 격리한다.
async function deleteVersion({ version = 2, status = "editing_v2", review = null, history = [], historyError = null } = {}) {
  const effects = [];
  const admin = { from(table) {
    let deleting = false;
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; },
      limit() { return query; },
      delete() { deleting = true; effects.push(table); return query; },
      single() { return query; }, maybeSingle() { return query; },
      then(resolve, reject) {
        const data = {
          projects: { id: "project", photographer_id: "owner", status },
          photo_versions: { id: "version", photo_id: "photo", version, r2_url: "versions/sample.jpg" },
          photos: { project_id: "project" },
          version_reviews: review,
          photo_version_revisions: history,
        };
        return Promise.resolve({
          data: deleting ? null : data[table],
          error: table === "photo_version_revisions" ? historyError : null,
        }).then(resolve, reject);
      },
    };
    return query;
  }};
  const session = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "auth" } } } }) },
    from() { const q = { select: () => q, eq: () => q, limit: () => q, single: async () => ({ data: { id: "owner" } }) }; return q; },
  };
  const source = fs.readFileSync(path.join(__dirname, "../../src/app/api/photographer/projects/[id]/versions/[versionId]/route.ts"), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, URL, process: { env: {} },
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
      if (name.endsWith("supabase/server")) return { createClient: async () => session };
      if (name.endsWith("supabase-admin")) return { getAdminClient: () => admin };
      throw new Error(name);
    },
    fetch: async () => { effects.push("storage"); return { ok: true }; },
  });
  const response = await exports.DELETE({}, { params: Promise.resolve({ id: "project", versionId: "version" }) });
  return { response, effects };
}

test("검토 전 재보정본은 삭제 가능", async () => {
  const { response, effects } = await deleteVersion();
  assert.equal(response.status, 200);
  assert.deepEqual(effects, ["storage", "version_reviews", "photo_versions"]);
});
test("현재 고객 재보정 요청이 있으면 파일과 리뷰를 삭제하지 않음", async () => {
  const { response, effects } = await deleteVersion({ review: { status: "revision_requested" } });
  assert.equal(response.body.code, "reviewed_retouch_delete_locked");
  assert.deepEqual(effects, []);
});
test("교체로 현재 리뷰가 없어져도 이전 검토 이력이 삭제를 차단", async () => {
  const { response, effects } = await deleteVersion({ history: [{ id: "reviewed-snapshot" }] });
  assert.equal(response.status, 409);
  assert.deepEqual(effects, []);
});
test("검토 이력 조회 실패 시 삭제하지 않음", async () => {
  const { response, effects } = await deleteVersion({ historyError: { message: "unavailable" } });
  assert.equal(response.status, 500);
  assert.deepEqual(effects, []);
});
test("확정본 및 고객 검토 중에는 삭제하지 않음", async () => {
  for (const options of [{ review: { status: "approved" } }, { status: "reviewing_v2" }]) {
    const { response, effects } = await deleteVersion(options);
    assert.equal(response.status, 409);
    assert.deepEqual(effects, []);
  }
});
test("V1 작업 중 삭제 정책은 유지", async () => {
  const { response } = await deleteVersion({ version: 1, status: "editing" });
  assert.equal(response.status, 200);
});
