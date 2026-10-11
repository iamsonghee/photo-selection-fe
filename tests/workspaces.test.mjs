import assert from "node:assert/strict";
import { lastWorkspacePath, migrateWorkspacePath } from "../src/lib/workspaces.ts";

assert.equal(lastWorkspacePath("studio"), "/app/studio/dashboard");
assert.equal(lastWorkspacePath("select"), "/app/select");
for (const value of [null, undefined, "", "admin", "https://evil.example", {}, ["studio"]]) {
  assert.equal(lastWorkspacePath(value), null);
}
console.log("workspaces: ok");

for (const [oldPath, newPath] of [
  ["/photographer", "/app/studio"],
  ["/photographer/projects/id/assets/original", "/app/studio/projects/id/assets/original"],
  ["/customer-select", "/app/select"],
  ["/customer-select/id/select", "/app/select/id/select"],
  ["/customer-select/guest/id/download", "/app/select/guest/id/download"],
  ["/customer-select/result/id/access", "/customer-select/result/id/access"],
  ["/api/customer-select/projects", "/api/customer-select/projects"],
  ["/api/photographer/quota", "/api/photographer/quota"],
  ["/photographer-other", "/photographer-other"],
  ["/customer-select-other", "/customer-select-other"],
  ["/c/invitation", "/c/invitation"],
  ["/g/guest", "/g/guest"],
]) {
  assert.equal(migrateWorkspacePath(oldPath), newPath);
  assert.equal(migrateWorkspacePath(newPath), newPath);
}
