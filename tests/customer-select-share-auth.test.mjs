import assert from "node:assert/strict";
import {
  customerProjectIdFromPath,
  customerShareCookieName,
} from "../src/lib/customer-select-share-auth.ts";

assert.equal(customerProjectIdFromPath("/app/select/project-1/select"), "project-1");
assert.equal(customerProjectIdFromPath("/app/select/project-1"), "project-1");
assert.equal(customerProjectIdFromPath("/app/select"), null);
assert.equal(customerShareCookieName("project-1"), "customer_share_project-1");
