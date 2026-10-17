import assert from "node:assert/strict";
import {
  customerProjectIdFromPath,
  customerShareCookieName,
} from "../src/lib/customer-select-share-auth.ts";

assert.equal(customerProjectIdFromPath("/select/project-1/select"), "project-1");
assert.equal(customerProjectIdFromPath("/select/project-1"), "project-1");
assert.equal(customerProjectIdFromPath("/select/projects"), null);
assert.equal(customerShareCookieName("project-1"), "customer_share_project-1");

for (const path of ["/select", "/select/new/photos", "/select/guest/id", "/select/login"]) assert.equal(customerProjectIdFromPath(path), null);
