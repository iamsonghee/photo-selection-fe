import assert from "node:assert/strict";
import { lastWorkspacePath, migrateWorkspacePath } from "../src/lib/workspaces.ts";

assert.equal(lastWorkspacePath("studio"), "/studio/dashboard");
assert.equal(lastWorkspacePath("select"), "/select/projects");
for (const value of [null, undefined, "", "admin", "https://evil.example", {}, ["studio"]]) {
  assert.equal(lastWorkspacePath(value), null);
}
console.log("workspaces: ok");

for (const [oldPath, newPath] of [
  ["/photographer", "/studio/dashboard"],
  ["/photographer/projects/id/assets/original", "/studio/projects/id/assets/original"],
  ["/customer-select", "/select/projects"],
  ["/customer-select/id/select", "/select/id/select"],
  ["/customer-select/guest/id/download", "/select/guest/id/download"],
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

for (const [oldPath, expected] of [
  ["/app/studio", "/studio/dashboard"],
  ["/app/studio/projects/id?ignored", "/studio/projects/id?ignored"],
  ["/app/select", "/select/projects"],
  ["/app/select/", "/select/projects"],
  ["/app/select/id/select", "/select/id/select"],
  ["/studio", "/studio"],
  ["/select", "/select"],
]) assert.equal(migrateWorkspacePath(oldPath), expected);
