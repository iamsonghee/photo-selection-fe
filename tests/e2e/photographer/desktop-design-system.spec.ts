import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createTestProject, deleteTestProject } from "../../helpers/setup";

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await loginAsPhotographer(page);
  // Render the normal form even when the shared test account is at its quota.
  await page.route("**/api/photographer/quota", (route) => route.fulfill({ json: {
    tier: "beta", current: 1, max: 50, maxPhotosPerProject: 1000, maxRevisionCount: 2,
    betaStatus: "approved", betaEndDate: null, betaApplicationStatus: null,
  } }));
});

test("PC form controls retain label, group selection and error relationships", async ({ page }) => {
  await page.goto("/photographer/projects/new");
  const name = page.getByLabel("프로젝트명", { exact: false });
  await expect(name).toBeVisible();
  await page.locator("label").filter({ hasText: "프로젝트명" }).click();
  await expect(name).toBeFocused();
  await expect(page.getByLabel("연락처", { exact: true })).toHaveAttribute("id", /.+/);
  const revisions = page.getByRole("group", { name: "재보정 요청 횟수" });
  await revisions.getByRole("button", { name: "없음" }).click();
  await expect(revisions.getByRole("button", { name: "없음" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "원본 올리기", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/프로젝트명/);
  await name.fill("PC label validation");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  // This test never submits a valid project or mutates server data.
});

test("PC settings labels and feedback theme, pending lock, focus restoration", async ({ page }) => {
  await page.goto("/photographer/settings");
  for (const label of ["작가명 또는 스튜디오명", "소개글", "연락처", "인스타그램", "포트폴리오"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("소개글", { exact: true })).toHaveAccessibleDescription("고객 갤러리 페이지에 표시됩니다.");
  await page.locator("aside summary").click();
  const trigger = page.getByRole("menuitem", { name: "A-CUT에 의견 보내기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "A-CUT에 의견 보내기" });
  await expect(dialog).toHaveAttribute("data-modal-variant", "standard");
  await expect(dialog).toHaveAttribute("data-mobile-presentation", "card");
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "보내기", exact: true })).toBeFocused();

  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/feedback", async (route) => {
    await pending;
    await route.fulfill({ status: 500, json: { error: "test failure" } });
  });
  await dialog.getByLabel("문의 내용").fill("Intercepted locally; never sent.");
  await dialog.getByRole("button", { name: "보내기", exact: true }).click();
  try {
    await expect(dialog.getByRole("button", { name: "보내는 중…" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
  } finally { release(); }
  await expect(dialog.getByRole("alert")).toContainText("전송에 실패했습니다");
  await expect(dialog.getByLabel("문의 내용")).toHaveAccessibleDescription(/전송에 실패/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  // Pointer interaction with the portal closes the Sidebar disclosure.
  await expect(page.locator("[data-sidebar-profile-trigger]")).toBeFocused();
});

test("PC settings layout keeps readable columns across desktop widths", async ({ page }) => {
  await page.goto("/photographer/settings");
  const summary = page.locator("[data-settings-profile-summary]");
  const profilePanel = page.locator("[data-settings-panel]").first();

  const wideSummary = await summary.boundingBox();
  const widePanel = await profilePanel.boundingBox();
  expect(wideSummary).not.toBeNull();
  expect(widePanel).not.toBeNull();
  expect(wideSummary!.width).toBeCloseTo(280, 0);
  expect(Math.abs(wideSummary!.y - widePanel!.y)).toBeLessThan(2);

  await page.setViewportSize({ width: 1024, height: 1000 });
  const compactSummary = await summary.boundingBox();
  const compactPanel = await profilePanel.boundingBox();
  expect(compactSummary).not.toBeNull();
  expect(compactPanel).not.toBeNull();
  expect(compactPanel!.y).toBeGreaterThan(compactSummary!.y + compactSummary!.height);
  expect(compactPanel!.width).toBeCloseTo(compactSummary!.width, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("PC confirmation traps focus and cannot close during a pending operation", async ({ page }) => {
  const project = await createTestProject(page);
  try {
    await page.goto(`/photographer/projects/${project.projectId}`);
    await page.getByLabel("프로젝트 더보기").filter({ visible: true }).click();
    const trigger = page.getByRole("menuitem", { name: "삭제하기" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "프로젝트를 삭제할까요?" });
    const cancel = dialog.getByRole("button", { name: "취소", exact: true });
    await expect(cancel).toBeFocused();
    await expect(dialog).toHaveAccessibleDescription("삭제 후에는 복구할 수 없습니다.");
    // 공용 팝업 틀: 닫기(X) → 취소 → 확인 순서로 돌고, 창 밖으로 초점이 나가지 않는다.
    const close = dialog.getByRole("button", { name: "닫기", exact: true });
    const confirm = dialog.getByRole("button", { name: "프로젝트 삭제", exact: true });
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    const actionSizes = await dialog.locator("[data-button-size]").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(actionSizes).toEqual([56, 56]);

    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    // Intercept the destructive action. Only the test-setup cleanup deletes the fixture.
    await page.route(`**/api/photographer/projects/${project.projectId}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      await pending;
      await route.fulfill({ status: 500, json: { error: "삭제 실패 테스트" } });
    });
    await confirm.click();
    try {
      await expect(cancel).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
      await expect(dialog).toBeVisible();
    } finally { release(); }
    await expect(cancel).toBeEnabled();
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    // 메뉴는 닫혀 있으므로 초점은 메뉴를 연 ⋯ 버튼으로 돌아온다.
    const menuTrigger = page.getByLabel("프로젝트 더보기").filter({ visible: true });
    await expect(menuTrigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

    await menuTrigger.click();
    await page.getByRole("menuitem", { name: "수정하기" }).filter({ visible: true }).click();
    await expect(page.getByLabel("프로젝트명", { exact: false })).toHaveValue(/.+/);
    await expect(page.getByLabel("고객 이름", { exact: false })).toBeVisible();
    await expect(page.getByRole("group", { name: "촬영 유형" })).toBeVisible();
  } finally { await deleteTestProject(page, project.projectId); }
});

test("PC settings shares the Light shell, Sidebar and page heading", async ({ page }) => {
  // 사용 매뉴얼 화면은 bb8142fe에서 삭제됐다 — 같은 라이트 셸 규칙을 설정 화면으로 확인한다.
  await page.goto("/photographer/settings");
  await expect(page.getByRole("heading", { name: "설정", level: 1 })).toBeVisible();
  await expect(page.locator("[data-sidebar-theme]")).toHaveAttribute("data-sidebar-theme", "light");
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
});
