import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
class NextResponse {
  static json(body, init = {}) {
    return Object.assign(new NextResponse(), { body, status: init.status ?? 200 });
  }
}

function load(filename, mocks) {
  const cjsModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: cjsModule,
    exports: cjsModule.exports,
    require: name => mocks[name] ?? nativeRequire(name),
    console,
    process,
    TextEncoder,
  });
  return cjsModule.exports;
}

const performanceModule = load("src/lib/upload-performance.ts", {});
let authenticated = true;
let inserts = [];
const admin = {
  from(table) {
    const query = {
      select() { return query; },
      eq() { return query; },
      maybeSingle() {
        return Promise.resolve({ data: { id: "photographer-1" }, error: null });
      },
      insert(payload) {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    };
    return query;
  },
};
const route = load("src/app/api/photographer/upload-performance/route.ts", {
  "next/server": { NextResponse },
  "@/lib/supabase/server": {
    createClient: async () => ({
      auth: { getUser: async () => authenticated
        ? { data: { user: { id: "auth-1" } }, error: null }
        : { data: { user: null }, error: null } },
    }),
  },
  "@/lib/supabase-admin": { getAdminClient: () => admin },
  "@/lib/upload-performance": performanceModule,
});

const validBody = {
  version: 3,
  previewBytes: 123,
  device: "pc",
  includesOriginal: true,
  fileCount: 1,
  sourceBytes: 1000,
  transferredBytes: 1000,
  savedCount: 1,
  failedCount: 0,
  retryCount: 0,
  outcome: "completed",
  elapsedMs: 500,
  firstOriginalMs: 100,
  firstSavedMs: 400,
  finalizeMs: 10,
  originalConcurrency: { initial: 2, current: 2, minimum: 1, maximum: 5, adjustments: 0, measuredWindows: 0, ignored: "drop" },
  fileStageMs: { queued: 1, preparing: 2, ready: 3, previewSending: 4, previewProcessing: 5, originalSending: 6, confirming: 7, retrying: 0, completed: 8, failed: 0, ignored: 99 },
  uploadStrategy: "preview_first",
  filename: "must-not-be-stored.jpg",
};
const request = body => ({ text: async () => JSON.stringify(body) });

authenticated = false;
assert.equal((await route.POST(request(validBody))).status, 401);
assert.equal(inserts.length, 0);

authenticated = true;
assert.equal((await route.POST(request({ ...validBody, elapsedMs: -1 }))).status, 400);
assert.equal(inserts.length, 0);
assert.equal((await route.POST({ text: async () => "x".repeat(16 * 1024 + 1) })).status, 400);
assert.equal(inserts.length, 0);

assert.equal((await route.POST(request(validBody))).status, 200);
assert.equal(inserts.length, 1);
assert.equal(inserts[0].table, "upload_performance_logs");
assert.equal(inserts[0].payload.photographer_id, "photographer-1");
assert.equal(inserts[0].payload.filename, undefined);
assert.equal(inserts[0].payload.previewBytes, undefined);
assert.equal(inserts[0].payload.original_concurrency.ignored, undefined);
assert.equal(inserts[0].payload.file_stage_ms.ignored, undefined);

console.log("upload performance API: auth, validation, sanitization and insert checks passed");
