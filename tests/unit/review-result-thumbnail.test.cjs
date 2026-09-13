const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

async function getReviewResult() {
  const rows = {
    selections: [{ photo_id: "photo-1" }],
    photos: [{ id: "photo-1", number: 1, r2_thumb_url: "original-thumb.jpg", original_filename: "ACUT_0001.jpg" }],
    photo_versions: [
      { id: "v2", photo_id: "photo-1", version: 2, r2_thumb_url: "retouched-v2.jpg", r2_url: "retouched-v2-full.jpg", created_at: "2026-09-13T02:00:00Z" },
      { id: "v1", photo_id: "photo-1", version: 1, r2_thumb_url: "retouched-v1.jpg", r2_url: "retouched-v1-full.jpg", created_at: "2026-09-13T01:00:00Z" },
    ],
    version_reviews: [{ photo_version_id: "v1", status: "approved", customer_comment: null }],
  };
  const admin = { from(table) {
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      order() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject); },
    };
    return query;
  } };

  const source = fs.readFileSync(path.join(__dirname, "../../src/app/api/c/review-result/route.ts"), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console,
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
      if (name.endsWith("supabase-admin")) return { getAdminClient: () => admin };
      if (name.endsWith("customer-api-server")) return { getProjectByToken: async () => ({ id: "project", status: "editing_v2" }) };
      if (name.endsWith("customer-auth-server")) return { checkPinAuth: async () => null };
      throw new Error(name);
    },
  });
  return exports.GET({ nextUrl: new URL("http://localhost/api/c/review-result?token=test") });
}

test("locked 검토 결과는 원본이 아니라 검토 상태와 같은 회차의 보정본을 반환한다", async () => {
  const response = await getReviewResult();
  assert.equal(response.status, 200);
  assert.equal(response.body.photos[0].thumbUrl, "retouched-v1.jpg");
  assert.equal(response.body.photos[0].reviewStatus, "approved");
});
