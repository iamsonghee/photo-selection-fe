import assert from "node:assert/strict";
import { customerProjectAction, customerProjectDestination, customerProjectSent, customerProjectStatus, filterCustomerProjects, selectionDeadlineBadge } from "../src/app/customer-select/_lib/project-routing.ts";

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

// 목록 카드는 이 판단으로 sent를 넘긴다 — 보낸 프로젝트가 '고르는 중'으로 보이지 않게.
assert.equal(customerProjectSent(project()), false);
assert.equal(customerProjectSent(project({ exported: true })), true);
assert.equal(customerProjectSent(project({ delivery_count: 1 })), true);
assert.equal(customerProjectDestination(project({ exported: true, photo_count: 10 }), customerProjectSent(project({ exported: true }))), "/customer-select/project-1/review");
assert.equal(customerProjectDestination(project()), "/customer-select/project-1/upload");
assert.equal(customerProjectDestination(project({ photo_count: 10 })), "/customer-select/project-1/select");
assert.equal(customerProjectDestination(project({ exported: true, photo_count: 10 })), "/customer-select/project-1/select");
assert.equal(customerProjectDestination(project({ photo_count: 10 }), true), "/customer-select/project-1/review");
assert.equal(customerProjectDestination(project({ retouch_done: true })), "/customer-select/project-1/done");
assert.equal(customerProjectStatus(project({ retouch_done: true })), "완료");
assert.equal(customerProjectStatus(project({ exported: true, photo_count: 10 })), "고르는 중");
assert.equal(customerProjectStatus(project({ photo_count: 10, delivery_count: 1 })), "고르는 중");
assert.equal(customerProjectStatus(project({ photo_count: 10 }), 1, true), "작가에게 전달함");
assert.equal(customerProjectStatus(project({ photo_count: 10 })), "고르는 중");
assert.equal(customerProjectStatus(project({ photo_count: 10 }), 0), "고르기 전");
assert.equal(customerProjectStatus(project()), "사진 올리기 전");
assert.equal(customerProjectAction(project()), "사진 올리기");
assert.equal(customerProjectAction(project({ photo_count: 10 }), 0), "사진 고르기");
assert.equal(customerProjectAction(project({ photo_count: 10 }), 1), "이어서 고르기");
assert.equal(customerProjectAction(project({ exported: true, photo_count: 10 }), 1), "이어서 고르기");
assert.equal(customerProjectAction(project({ photo_count: 10 }), 1, true), "선택 결과 보기");

const projects = [
  project({ id: "active", name: "우리 웨딩", studio_name: "ACUT" }),
  project({ id: "delivered", name: "가족", exported: true }),
  project({ id: "done", name: "프로필", retouch_done: true }),
];
assert.deepEqual(filterCustomerProjects(projects, "acut", "all").map(({ id }) => id), ["active"]);
assert.deepEqual(filterCustomerProjects(projects, "", "active").map(({ id }) => id), ["active", "delivered"]);

assert.equal(selectionDeadlineBadge(null, "2026-10-02"), null);
assert.equal(selectionDeadlineBadge("2026-10-09", "2026-10-02", true), null);
assert.deepEqual(selectionDeadlineBadge("2026-10-09", "2026-10-02"), { label: "마감 D-7", urgent: false });
assert.deepEqual(selectionDeadlineBadge("2026-10-05", "2026-10-02"), { label: "마감 D-3", urgent: true });
assert.deepEqual(selectionDeadlineBadge("2026-10-02", "2026-10-02"), { label: "오늘 마감", urgent: true });
assert.deepEqual(selectionDeadlineBadge("2026-09-27", "2026-10-02"), { label: "마감 지남", urgent: true });
