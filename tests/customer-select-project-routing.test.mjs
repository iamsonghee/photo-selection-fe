import assert from "node:assert/strict";
import { customerProjectAction, customerProjectDestination, customerProjectStatus, filterCustomerProjects } from "../src/app/customer-select/_lib/project-routing.ts";

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
  delivery_count: 0,
  last_delivered_at: null,
  retouch_done: false,
  created_at: "2026-09-19T00:00:00Z",
  ...overrides,
});

assert.equal(customerProjectDestination(project()), "/customer-select/project-1/upload");
assert.equal(customerProjectDestination(project({ photo_count: 10 })), "/customer-select/project-1/select");
assert.equal(customerProjectDestination(project({ exported: true })), "/customer-select/project-1/export");
assert.equal(customerProjectDestination(project({ retouch_done: true })), "/customer-select/project-1/done");
assert.equal(customerProjectStatus(project({ retouch_done: true })), "보정 완료");
assert.equal(customerProjectStatus(project({ exported: true })), "전달 완료");
assert.equal(customerProjectStatus(project({ photo_count: 10, delivery_count: 1 })), "재선택 중");
assert.equal(customerProjectStatus(project({ photo_count: 10 })), "선택 중");
assert.equal(customerProjectStatus(project({ photo_count: 10 }), 0), "선택 시작 전");
assert.equal(customerProjectStatus(project()), "사진 준비");
assert.equal(customerProjectAction(project()), "사진 올리기");
assert.equal(customerProjectAction(project({ photo_count: 10 }), 0), "사진 고르기");
assert.equal(customerProjectAction(project({ photo_count: 10 }), 1), "이어서 고르기");
assert.equal(customerProjectAction(project({ exported: true }), 1), "전달 내용 보기");

const projects = [
  project({ id: "active", name: "우리 웨딩", studio_name: "ACUT" }),
  project({ id: "delivered", name: "가족", exported: true }),
  project({ id: "done", name: "프로필", retouch_done: true }),
];
assert.deepEqual(filterCustomerProjects(projects, "acut", "all").map(({ id }) => id), ["active"]);
assert.deepEqual(filterCustomerProjects(projects, "", "delivered").map(({ id }) => id), ["delivered"]);
