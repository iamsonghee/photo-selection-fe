import { test, expect } from "@playwright/test";
import {
  setupFullProject,
  deleteTestProject,
  mockCustomerThumbPresigning,
  type TestProject,
} from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5); // 사진 5장 + selecting 상태
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 — 갤러리 (사진 선택)", () => {
  async function openGallery(page: import("@playwright/test").Page) {
    await mockCustomerThumbPresigning(page);
    await page.goto(project.galleryUrl);
    await page.waitForLoadState("networkidle");
  }

  test("S1: 갤러리 로드 → 사진 목록 표시", async ({ page }) => {
    await openGallery(page);
    await expect(page).toHaveURL(/\/gallery/);
    // 더미 이미지 5장 렌더링 확인
    const photos = page.locator("img[loading='lazy']");
    await expect(photos.first()).toBeVisible({ timeout: 10_000 });
    expect(await photos.count()).toBeGreaterThan(0);
  });

  test("S2: 사진 클릭 → 선택 카운트 증가", async ({ page }) => {
    await openGallery(page);
    // SELECTED 카운트 초기값 읽기
    const counterBefore = await page.locator(".gl-header-selected-count").textContent({ timeout: 3000 }).catch(() => "0");
    const selectionButtons = page.getByRole("button", { name: "선택", exact: true });
    await expect(selectionButtons).not.toHaveCount(0);
    await selectionButtons.first().click();
    await page.waitForTimeout(800);
    // 카운트 변경 또는 선택 표시 확인
    const counterAfter = await page.locator(".gl-header-selected-count").textContent({ timeout: 2000 }).catch(() => "");
    const hasSelection = counterAfter !== counterBefore && counterAfter !== "" && counterAfter !== "0";
    const confirmBtnEnabled = await page.getByRole("button", { name: /보정 의뢰하기/i }).isEnabled({ timeout: 2000 }).catch(() => false);
    expect(hasSelection || confirmBtnEnabled).toBeTruthy();
  });

  test("S3: 사진 선택 후 재클릭 → 선택 해제", async ({ page }) => {
    await openGallery(page);
    const selectButton = page.getByRole("button", { name: "선택", exact: true }).first();
    await selectButton.click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "선택 해제", exact: true }).first().click();
    await page.waitForTimeout(400);
    // 선택 수가 0으로 돌아가야 함 → 확정 버튼 비활성
    const confirmBtn = page.getByRole("button", { name: /보정 의뢰|확정/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(confirmBtn).toBeDisabled();
    }
  });

  test("S4: 필터 탭 — '선택됨' 전환", async ({ page }) => {
    await openGallery(page);
    const selectedTab = page.getByRole("button", { name: "선택됨" });
    await expect(selectedTab).toBeVisible({ timeout: 5000 });
    await selectedTab.click();
    await page.waitForTimeout(300);
    const allTab = page.getByRole("button", { name: "전체 사진" });
    await allTab.click();
    await expect(page).toHaveURL(/\/gallery/);
  });

  test("S5: N장 선택 완료 → 확정 버튼 활성화", async ({ page }) => {
    await openGallery(page);
    const selectionButtons = page.getByRole("button", { name: "선택", exact: true });
    const N = project.requiredCount ?? 3;
    const total = await selectionButtons.count();
    // N장 선택
    for (let i = 0; i < Math.min(N, total); i++) {
      // 선택한 버튼은 즉시 "선택 해제"로 이름이 바뀌므로, 매번 남은 첫 선택 버튼을 누른다.
      await selectionButtons.first().click();
      await page.waitForTimeout(500);
    }
    // 확정 버튼 활성화 확인 (SelectionConfirmFooter 고정 하단)
    const confirmBtn = page.getByRole("button", { name: /보정 의뢰하기/i });
    await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
  });
});
