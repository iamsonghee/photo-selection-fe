import assert from "node:assert/strict";
import { register } from "node:module";
register("./helpers/auth-callback-loader.mjs", import.meta.url);
register("./helpers/workspace-migration-loader.mjs", import.meta.url);
const { middleware } = await import("../src/middleware.ts");
const { NextRequest } = await import("next/server");
const origin = "https://acut.test";
const run = (path, method = "GET") => middleware(new NextRequest(origin + path, { method }));

for (const method of ["GET", "POST"]) {
  for (const [oldPath, newPath] of [
    ["/photographer/projects/id/upload?resume=1", "/app/studio/projects/id/upload?resume=1"],
    ["/customer-select/id/select?share_token=legacy&photo=2", "/app/select/id/select?share_token=legacy&photo=2"],
    ["/customer-select/guest/id/download", "/app/select/guest/id/download"],
    ["/customer-select/login?next=%2Fcustomer-select%2Fnew", "/app/select/login?next=%2Fcustomer-select%2Fnew"],
  ]) {
    const response = await run(oldPath, method);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), origin + newPath);
  }
}
for (const path of ["/app/studio/projects?status=active", "/app/select", "/app/select/new/photos", "/app/select/guest/id/download", "/app/select/id/settings"]) {
  const response = await run(path);
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("next"), path);
  assert.equal(response.cookies.get("migration_refresh")?.value, "ok");
}
globalThis.__migrationUser = { id: "owner" };
assert.equal((await run("/app/studio/projects")).headers.get("location"), null);
assert.equal((await run("/app/select")).cookies.get("migration_refresh")?.value, "ok");
globalThis.__migrationUser = null;
for (const path of ["/app/select/id/select", "/customer-select/result/id", "/customer-select/result/id/access", "/g/token", "/api/customer-select/projects", "/api/photographer/quota"]) {
  assert.equal((await run(path)).headers.get("location"), null);
}
// Legacy share links redirect first, then exchange their token on the new address.
const id = "11111111-1111-4111-8111-111111111111";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify([{ id }]));
  const response = await run(`/app/select/${id}/select?share_token=legacy&photo=2`);
  assert.equal(response.headers.get("location"), `${origin}/app/select/${id}/select?photo=2&invite=1`);
  assert.equal(response.cookies.get(`customer_share_${id}`)?.value, "legacy");
  assert.equal(response.cookies.get(`customer_share_${id}`)?.path, "/");
  globalThis.fetch = async () => new Response("[]");
  const invalid = await run(`/app/select/${id}/select?share_token=invalid`);
  assert.equal(invalid.cookies.get(`customer_share_${id}`), undefined);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("workspace migration: ok");

// Result links and cookie paths issued before migration remain usable.
process.env.PIN_COOKIE_SECRET = "workspace-migration-test-secret";
const { signCustomerResultToken } = await import("../src/lib/customer-select-result-auth.ts");
const { GET: resultAccess } = await import("../src/app/customer-select/result/[projectId]/access/route.ts");
const token = signCustomerResultToken(id);
const result = await resultAccess(new NextRequest(`${origin}/customer-select/result/${id}/access?result_token=${token}`), { params: Promise.resolve({ projectId: id }) });
assert.equal(result.headers.get("location"), `${origin}/customer-select/result/${id}`);
assert.equal(result.cookies.get(`customer_result_${id}`)?.path, `/customer-select/result/${id}`);
assert.equal(result.cookies.get(`customer_result_${id}`)?.value, token);
