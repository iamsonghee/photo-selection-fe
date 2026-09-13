import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createFullProject, createEditingProject, deleteTestProject } from "../../helpers/setup";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(8000);
  await loginAsPhotographer(page);
  await page.route("**/api/photographer/quota", (route) => route.fulfill({ json: {
    tier: "beta", current: 1, max: 50, maxPhotosPerProject: 1000, maxRevisionCount: 2,
    betaStatus: "approved", betaEndDate: null, betaApplicationStatus: null,
  } }));
});

test("long press selects only the held photo after grid reflow; the next tap still works", async ({ page, context }) => {
  const project = await createFullProject(page, 20);
  try {
    // Present a preparing fixture without changing the server state or its photos.
    await page.route("**/rest/v1/projects?**", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const update = (row: { id: string; status: string }) => row.id === project.projectId ? { ...row, status: "preparing" } : row;
      await route.fulfill({ response, json: Array.isArray(body) ? body.map(update) : update(body) });
    });
    await page.goto(project.uploadUrl);
    const photos = page.locator("[data-original-photo-media] > button");
    await expect(photos.first()).toBeVisible();
    await expect(page.getByRole("button", { name: "사진 추가하기", exact: true })).toBeVisible();
    const box = (await photos.first().boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(560); // Exercise the actual 450ms touch recognizer.
    await expect(page.locator('[data-original-photo-media] > button[aria-pressed="true"]')).toHaveCount(1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator('[data-original-photo-media] > button[aria-pressed="true"]')).toHaveCount(1);
    await photos.first().tap();
    await expect(page.locator('[data-original-photo-media] > button[aria-pressed="true"]')).toHaveCount(0);
    await photos.first().tap();
    await photos.nth(1).tap();
    await expect(page.locator('[data-original-photo-media] > button[aria-pressed="true"]')).toHaveCount(2);
    await page.getByRole("button", { name: "취소", exact: true }).tap();
    await expect(page.locator('[data-original-photo-media] > button[aria-pressed="true"]')).toHaveCount(0);
  } finally { await deleteTestProject(page, project.projectId); }
});

test("small mobile upload dialog has a usable scroll area and can be reopened", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const project = await createEditingProject(page);
  try {
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    const dialog = page.getByRole("dialog", { name: "보정본 업로드", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("추가로 업로드할 파일을 선택해주세요.", { exact: true })).toBeHidden();
    const geometry = await dialog.evaluate((element) => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      footer: element.querySelector("footer")!.getBoundingClientRect().height,
      body: element.querySelector(".uvp-scroll")!.getBoundingClientRect().height,
      bottom: element.getBoundingClientRect().bottom,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
    expect(geometry.footer).toBeLessThan(100);
    expect(geometry.body).toBeGreaterThan(180);
    expect(geometry.bottom).toBeLessThanOrEqual(568);
    expect(await page.locator("main[data-app-theme]").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(true);
    await dialog.getByRole("button", { name: "취소", exact: true }).tap();
    await expect(dialog).toBeHidden();
    const toolbar = page.getByRole("region", { name: "보정본 작업 도구" });
    await expect(toolbar.locator("[data-mobile-asset-toolbar-actions]")).toHaveCSS("gap", "0px");
    const mobileToolbarIcons = toolbar.locator("[data-mobile-toolbar-icon]").filter({ visible: true });
    await expect(mobileToolbarIcons).toHaveCount(2);
    await expect(mobileToolbarIcons.nth(0)).toHaveCSS("width", "44px");
    await expect(mobileToolbarIcons.nth(1)).toHaveCSS("width", "44px");
    await expect(mobileToolbarIcons.nth(0)).toHaveCSS("border-radius", "8px");
    await expect(mobileToolbarIcons.nth(1)).toHaveCSS("border-radius", "8px");
    const mobileToolbarIconStyles = await mobileToolbarIcons.evaluateAll((buttons) => buttons.map((button) => ({
      color: getComputedStyle(button).color,
      iconWidth: getComputedStyle(button.querySelector("svg")!).width,
      iconHeight: getComputedStyle(button.querySelector("svg")!).height,
    })));
    expect(new Set(mobileToolbarIconStyles.map(({ color }) => color)).size).toBe(1);
    expect(new Set(mobileToolbarIconStyles.map(({ iconWidth, iconHeight }) => `${iconWidth}x${iconHeight}`)).size).toBe(1);
    const boxes = await toolbar.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()).filter((rect) => rect.width > 0).map((rect) => ({ left: rect.left, right: rect.right, width: rect.width, height: rect.height })));
    for (let index = 0; index < boxes.length; index++) {
      expect(boxes[index].width).toBeGreaterThanOrEqual(44);
      expect(boxes[index].right).toBeLessThanOrEqual(320);
      if (index) expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right);
    }
    await page.getByRole("button", { name: "보정본 필터 설정", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "보정본 필터", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    const header = page.locator(".photographer-mobile-header");
    await expect(header).toHaveCSS("height", "48px");
    const mobileActionBar = page.locator("[data-photographer-page-action-bar]");
    const mobileBulkUpload = mobileActionBar.getByRole("button", { name: "일괄 업로드", exact: true });
    await expect(mobileBulkUpload).toBeVisible();
    await expect(mobileActionBar.getByRole("button", { name: "보정본 검토 요청", exact: true })).toBeHidden();
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "보정본 업로드 파일 선택 후 즉시 업로드", exact: true }).first().tap();
    await picker; // Do not choose a file or start an actual upload.
    await expect(page.locator('[data-workflow-asset-card]').filter({ visible: true }).first()).toContainText("E2E_TEST_001.jpg");
    await mobileBulkUpload.tap();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await page.locator("main[data-app-theme]").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
  } finally { await deleteTestProject(page, project.projectId); }
});

test("failed project query offers retry instead of empty onboarding", async ({ page }) => {
  let fail = true;
  await page.route("**/rest/v1/projects?**", (route) => fail
    ? route.fulfill({ status: 500, json: { message: "test failure" } })
    : route.continue());
  await page.goto("/photographer/projects");
  await expect(page.getByRole("alert").filter({ hasText: "프로젝트를 불러오지 못했습니다" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "다시 시도" }).tap();
  await expect(page.getByRole("alert").filter({ hasText: "프로젝트를 불러오지 못했습니다" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible();
});

test("creation preserves original permission, pending width and visible failure; validation focuses input", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/photographer/projects/new");
  const submit = page.getByRole("button", { name: "원본 올리기", exact: true });
  await submit.tap();
  const name = page.getByLabel("프로젝트명", { exact: false });
  await expect(name).toBeFocused();
  await name.fill("모바일 생성 실패 검증");
  await page.getByLabel("고객 이름", { exact: false }).fill("테스트 고객");
  await page.getByLabel("촬영 일자", { exact: false }).fill("2026-09-09");
  await page.getByLabel("셀렉 갯수", { exact: false }).fill("3");
  const permission = page.getByRole("switch", { name: /원본/ });
  if (await permission.getAttribute("aria-checked") === "true") await permission.tap();
  let release!: () => void;
  let submitted: { include_original?: boolean } | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/photographer/projects", async (route) => {
    submitted = route.request().postDataJSON();
    await pending;
    await route.fulfill({ status: 500, json: { error: "생성 실패 테스트" } });
  });
  const width = (await submit.boundingBox())!.width;
  await submit.tap();
  try {
    const busy = page.getByRole("button", { name: "생성 중…" });
    await expect(busy).toBeDisabled();
    expect((await busy.boundingBox())!.width).toBeCloseTo(width, 0);
    expect(submitted?.include_original).toBe(false);
  } finally { release(); }
  const alert = page.getByRole("alert").filter({ hasText: "생성 실패 테스트" });
  await expect(alert).toBeVisible();
  expect((await alert.boundingBox())!.y).toBeLessThan(568);
  await expect(name).toHaveValue("모바일 생성 실패 검증");
});

test("mobile settings keeps destructive confirmation focus behavior", async ({ page }) => {
  await page.goto("/photographer/settings");
  const summary = page.locator("[data-settings-profile-summary]");
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link", { name: /사용 매뉴얼/ })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "계정 삭제", exact: true });
  await trigger.tap();
  const dialog = page.getByRole("dialog", { name: "계정을 삭제할까요?" });
  await expect(dialog).toHaveAttribute("data-modal-variant", "confirmation");
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "계정 삭제", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});


test("mobile asset sheet and photo viewer trap focus, restore background and survive viewport changes", async ({ page }) => {
  const project = await createFullProject(page);
  try {
    await page.goto(`/photographer/projects/${project.projectId}/assets/original`);
    await page.getByRole("button", { name: "검색 및 정렬 설정" }).filter({ visible: true }).tap();
    const sheet = page.locator("[data-mobile-asset-sheet]");
    await expect(sheet).toBeVisible();
    await expect(sheet).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(sheet).toBeHidden();
    expect(await page.locator("main[data-app-theme]").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    // An open tool state returns on mobile; dismiss it before opening a photo.
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    const photo = page.locator("[data-original-photo-media] > button").first();
    await photo.tap();
    const viewer = page.locator("[data-original-photo-viewer]");
    await expect(viewer).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(photo).toBeFocused();
    expect(await page.locator("main[data-app-theme]").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(false);
  } finally { await deleteTestProject(page, project.projectId); }
});
