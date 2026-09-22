import assert from "node:assert/strict";
import { customerProjectDestination, customerProjectStatus } from "../src/app/customer-select/_lib/project-routing.ts";

const project = (overrides = {}) => ({
  id: "project-1",
  name: "test",
  shoot_type: null,
  shoot_date: null,
  selection_deadline: null,
  studio_name: null,
  photographer_name: null,
  shoot_region: null,
  shoot_location: null,
  target_count: 30,
  photo_count: 0,
  exported: false,
  retouch_done: false,
  created_at: "2026-09-19T00:00:00Z",
  ...overrides,
});

assert.equal(customerProjectDestination(project()), "/customer-select/project-1/upload");
assert.equal(customerProjectDestination(project({ photo_count: 10 })), "/customer-select/project-1/select");
assert.equal(customerProjectDestination(project({ exported: true })), "/customer-select/project-1/retouch/upload");
assert.equal(customerProjectDestination(project({ retouch_done: true })), "/customer-select/project-1/done");
assert.equal(customerProjectStatus(project({ retouch_done: true })), "완료");
