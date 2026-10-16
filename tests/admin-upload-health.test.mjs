import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function load(filename, mocks) {
  const cjsModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, { module: cjsModule, exports: cjsModule.exports, require: name => mocks[name] ?? nativeRequire(name), console, process, Date });
  return cjsModule.exports;
}

// 체이닝 쿼리 흉내: 어떤 필터를 불러도 자기 자신을 돌려주고, await하면 표별로 준비한 결과를 준다.
const results = {
  photos: { data: [
    { project_id: "p1", uploaded_at: "2026-10-16T01:00:00Z", projects: { name: "실고객 본식", photographers: { name: "김작가", email: "real@example.com" } } },
    { project_id: "p1", uploaded_at: "2026-10-15T23:00:00Z", projects: { name: "실고객 본식", photographers: { name: "김작가", email: "real@example.com" } } },
    { project_id: "p2", uploaded_at: "2026-10-16T00:00:00Z", projects: { name: "운영자 테스트", photographers: { name: null, email: "REALSONG88@gmail.com" } } },
  ], error: null },
  upload_performance_logs: { data: [
    { created_at: "2026-10-16T02:00:00Z", device: "mobile", includes_original: true, file_count: 30, saved_count: 28, failed_count: 2, retry_count: 4, outcome: "incomplete", photographers: { name: "김작가", email: "real@example.com" } },
    { created_at: "2026-10-16T03:00:00Z", device: "pc", includes_original: false, file_count: 1, saved_count: 0, failed_count: 1, retry_count: 0, outcome: "incomplete", photographers: { name: null, email: "cand0701@naver.com" } },
  ], error: null },
};
const query = table => {
  const builder = new Proxy({}, { get: (_, key) => key === "then" ? (resolve => resolve(results[table])) : () => builder });
  return builder;
};
const adminDb = load("src/lib/admin-db.ts", {
  "@/lib/supabase-admin": { getAdminClient: () => ({ from: query }) },
  "@/lib/admin-emails": { ADMIN_EMAILS: ["realsong88@gmail.com"] },
  "@/lib/db": { mapProjectRow: x => x },
  "@/lib/beta-policy": { getEffectiveTier: () => "general" },
});

const health = await adminDb.getUploadHealthForAdmin();
assert.equal(health.stuckOriginals.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(health.stuckOriginals[0])), { projectId: "p1", projectName: "실고객 본식", photographerName: "김작가", count: 2, oldestUploadedAt: "2026-10-15T23:00:00Z" });
assert.equal(health.failedSessions.length, 1);
assert.equal(health.failedSessions[0].failedCount, 2);
assert.equal(health.excludedInternal, 2); // 관리자(대소문자 무시) 사진 1 + e2e 계정 세션 1
console.log("admin upload health: grouping and internal-account exclusion checks passed");
