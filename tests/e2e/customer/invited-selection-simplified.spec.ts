import { test, expect, type Page } from "@playwright/test";
import { setupFullProject, deleteTestProject, mockCustomerThumbPresigning, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

type Member = { color: string; nickname: string; done: boolean; online: boolean };
async function setup(page: Page, { legacy = false, members = [] as Member[], identity = null as null | { color: string; initial: string } } = {}) {
  await mockCustomerThumbPresigning(page);
  if (identity) await page.addInitScript(({ token, identity }) => localStorage.setItem(`ps:c-participant:v1:${token}`, JSON.stringify(identity)), { token: project.accessToken, identity });
  const states: Record<string, { rating?: number; color?: string[]; comment?: string }> = legacy ? { [project.photoIds![0]]: { rating: 4 } } : {};
  const selected = new Set<string>();
  const writes: Record<string, unknown>[] = [];
  let fail = false;
  await page.route("**/api/c/participants**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { participants: members } });
    const body = route.request().postDataJSON();
    if (fail) { fail = false; return route.fulfill({ status: 500, json: { error: "테스트 저장 실패" } }); }
    if (body.action === "join") {
      const color = ["red", "yellow", "green", "blue", "purple"].find(color => !members.some(member => member.color === color));
      if (!color) return route.fulfill({ status: 409, json: { error: "다섯 명이 이미 참여 중이에요." } });
      members.push({ color, nickname: body.nickname, done: false, online: true });
      return route.fulfill({ json: { color, nickname: body.nickname } });
    }
    let member = members.find(member => member.color === body.color);
    if (!member) { member = { color: body.color, nickname: "", done: false, online: true }; members.push(member); }
    if (typeof body.nickname === "string") member.nickname = body.nickname;
    if (typeof body.done === "boolean") member.done = body.done;
    member.online = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/c/photos?**", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.project.selectionUsesRatings = legacy;
    body.project.accessPin = "1234";
    body.photoStates = states;
    body.selectedIds = [...selected];
    return route.fulfill({ json: body });
  });
  await page.route("**/api/c/selections**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { selectedIds: [...selected], photoStates: states } });
    const body = route.request().postDataJSON(); writes.push(body);
    const state = states[body.photo_id] ??= {};
    if (body.is_selected !== undefined) { if (body.is_selected) selected.add(body.photo_id); else selected.delete(body.photo_id); }
    if (body.color_op) {
      const colors = new Set(state.color ?? []);
      if (body.color_op.add) colors.add(body.color_op.color); else colors.delete(body.color_op.color);
      state.color = [...colors];
    }
    if ("rating" in body) state.rating = body.rating ?? undefined;
    if ("comment" in body) state.comment = body.comment;
    return route.fulfill({ json: { ok: true, colorTags: state.color ?? [] } });
  });
  return { members, states, selected, writes, failNext: () => { fail = true; } };
}

test("new customer: name, auto color, likes, people filter, presence, completion and invite", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mock = await setup(page, { members: [{ color: "blue", nickname: "가족", done: false, online: true }] });
  await page.goto(`${project.galleryUrl}?rating=5`);
  await expect(page.locator(".gl-photo-card")).toHaveCount(5);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = page.locator(".gl-photo-card").first();
  await first.hover();
  await first.getByRole("button", { name: "찜하기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  expect(mock.writes).toHaveLength(0);
  await first.getByRole("button", { name: "찜하기", exact: true }).click();
  const join = page.getByRole("dialog", { name: "어떤 이름으로 함께할까요?" });
  await join.getByRole("textbox", { name: "이름", exact: true }).fill("신랑입니다");
  mock.failNext();
  await join.getByRole("button", { name: "함께 고르기 시작" }).click();
  await expect(join.getByRole("alert")).toContainText("저장 실패");
  await expect(join.getByRole("textbox")).toHaveValue("신랑입니다");
  await join.getByRole("button", { name: "함께 고르기 시작" }).click();
  await expect(join).toHaveCount(0);
  await expect(page.getByRole("button", { name: "함께 고르는 사람 2명", exact: true }).filter({ visible: true })).toHaveText("함께 2");
  await expect(page.locator(".gl-photo-card")).toHaveCount(5);
  await expect(page).not.toHaveURL(/rating=/);
  await expect(page.getByRole("button", { name: /^별점/ })).toHaveCount(0);
  await expect(first.getByRole("button", { name: /찜 해제/ })).toHaveAttribute("aria-pressed", "true");
  await first.getByRole("button", { name: "선택", exact: true }).click();
  await expect.poll(() => mock.selected.size).toBe(1);
  await page.getByRole("button", { name: /^필터/ }).click();
  await page.getByRole("button", { name: "신랑입니다 (나) 찜만 보기" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".gl-photo-card")).toHaveCount(1);
  await page.getByRole("button", { name: "함께 고르기 초대" }).filter({ visible: true }).click();
  const people = page.getByRole("dialog", { name: "함께 고르기", exact: true });
  await expect(people).toContainText("가족");
  await expect(people).toContainText("온라인");
  await expect(people.getByRole("textbox", { name: "비밀번호" })).toHaveValue("1234");
  mock.failNext();
  await people.getByRole("button", { name: "다 골랐어요", exact: true }).click();
  await expect(people.getByRole("alert")).toContainText("저장 실패");
  await people.getByRole("button", { name: "다 골랐어요", exact: true }).click();
  await expect(people.getByRole("button", { name: "다시 고르기" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("desktop-people.png") });
  await people.getByRole("button", { name: "닫기", exact: true }).click();
  await first.getByRole("button", { name: "선택 해제", exact: true }).click();
  await expect.poll(() => mock.selected.size).toBe(0);
  await page.screenshot({ path: info.outputPath("desktop-gallery.png") });
});

test("mobile: existing identity resumes, detail has no ratings, name modal does not trigger selection shortcuts", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setup(page, { members: [{ color: "blue", nickname: "신부", done: true, online: false }] });
  mock.states[project.photoIds![0]] = { color: ["blue"], comment: "남겨 둔 메모" };
  await page.goto(project.galleryUrl);
  await expect(page.locator(".gl-photo-card")).toHaveCount(5);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".gl-photo-card").first().getByRole("button", { name: /^찜하기/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "신부", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".gl-photo-card").first().getByRole("button", { name: /찜 해제/ })).toBeVisible();
  expect(mock.writes).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("mobile-gallery.png") });
  await expect(page.getByRole("button", { name: "신부, 내 참여 정보", exact: true }).filter({ visible: true })).toHaveText("신부");
  await page.locator(".gl-photo-card").first().click({ position: { x: 70, y: 35 } });
  await expect(page).toHaveURL(/\/viewer\//);
  await expect(page.locator(".fv-star")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "신부, 내 참여 정보", exact: true }).filter({ visible: true })).toHaveText("신부");
  await page.keyboard.press("5");
  expect(mock.writes.filter(body => "rating" in body)).toHaveLength(0);
  await page.getByRole("button", { name: "함께 고르기 초대" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "이름 수정" }).click();
  await page.keyboard.press("Space");
  expect(mock.selected.size).toBe(0);
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("신부 새 이름");
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => mock.members[0].nickname).toBe("신부 새 이름");
  expect(mock.states[project.photoIds![0]].color).toEqual(["blue"]);
  await page.screenshot({ path: info.outputPath("mobile-detail.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("legacy: last rating can be cleared without losing the rating UI after reload", async ({ page }, info) => {
  const mock = await setup(page, { legacy: true, members: [{ color: "red", nickname: "기존 고객", done: false, online: true }], identity: { color: "red", initial: "기존" } });
  await page.goto(project.galleryUrl);
  const first = page.locator(".gl-photo-card").first();
  await first.hover();
  const star = first.getByRole("button", { name: "별점 4점", exact: true });
  await expect(page.getByRole("button", { name: "기존 고객, 내 참여 정보", exact: true }).filter({ visible: true })).toHaveText("기존 고객");
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await star.click();
  await expect.poll(() => mock.states[project.photoIds![0]].rating).toBeUndefined();
  await page.reload();
  await first.hover();
  await expect(first.getByRole("button", { name: /^별점 \d점$/ })).toHaveCount(5);
  await first.click({ position: { x: 70, y: 45 } });
  await expect(page.locator(".fs-star")).toHaveCount(5);
  await page.locator(".fs-star").first().focus();
  await page.keyboard.press("3");
  await expect.poll(() => mock.states[project.photoIds![0]].rating).toBe(3);
  await page.screenshot({ path: info.outputPath("legacy-detail.png") });
});
