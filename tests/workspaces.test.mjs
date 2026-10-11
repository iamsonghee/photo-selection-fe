import assert from "node:assert/strict";
import { lastWorkspacePath } from "../src/lib/workspaces.ts";

assert.equal(lastWorkspacePath("studio"), "/photographer/dashboard");
assert.equal(lastWorkspacePath("select"), "/customer-select");
for (const value of [null, undefined, "", "admin", "https://evil.example", {}, ["studio"]]) {
  assert.equal(lastWorkspacePath(value), null);
}
console.log("workspaces: ok");
