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
  project = await setupFullProject(page, 3);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 — 초대 링크", () => {
  test("I1: 유효한 초대 링크 → 안내 화면에서 갤러리 진입", async ({ page }) => {
    await mockCustomerThumbPresigning(page);
    await page.goto(`/c/${project.accessToken}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /사진 보러 가기/ })).toBeVisible();
    await page.getByRole("button", { name: /사진 보러 가기/ }).click();
    await expect(page).toHaveURL(/\/gallery/, { timeout: 20_000 });
  });

  test("I2: 잘못된 토큰 → 에러 화면", async ({ page }) => {
    await page.goto("/c/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator("text=존재하지 않는").or(page.locator("text=찾을 수 없")).or(page.locator("text=유효하지"))
    ).toBeVisible({ timeout: 8000 });
  });

  test("I3: 갤러리 직접 접근 → 사진 목록", async ({ page }) => {
    await mockCustomerThumbPresigning(page);
    await page.goto(`/c/${project.accessToken}/gallery`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/gallery/);
    const photos = page.locator("img[loading='lazy']");
    await expect(photos.first()).toBeVisible({ timeout: 10_000 });
  });
});
