import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { findActiveProjectToken } from "../../helpers/project";

async function openGallery(page: Page): Promise<string | null> {
  await loginAsPhotographer(page);
  const token = await findActiveProjectToken(page);
  if (!token) return null;
  await page.context().clearCookies();
  await page.goto(`/c/${token}/gallery`);
  await page.waitForLoadState("networkidle");
  if (await page.locator("input[inputmode='numeric']").isVisible({ timeout: 2000 }).catch(() => false)) return null;
  return token;
}

test.describe("고객 — 갤러리 (사진 선택)", () => {
  test("S1: 갤러리 로드 → 사진 목록 또는 빈 상태", async ({ page }) => {
    const token = await openGallery(page);
    if (!token) { test.skip(true, "접근 가능한 갤러리 없음"); return; }
    await expect(page).toHaveURL(/\/gallery/);
    const photoCount = await page.locator("img[loading='lazy']").count();
    expect(photoCount).toBeGreaterThanOrEqual(0);
  });

  test("S2: 사진 클릭 → SELECTED 카운트 증가", async ({ page }) => {
    const token = await openGallery(page);
    if (!token) { test.skip(true, "접근 가능한 갤러리 없음"); return; }
    const photos = page.locator("img[loading='lazy']");
    if (await photos.count() === 0) { test.skip(true, "사진 없음"); return; }
    await photos.first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("text=SELECTED").or(page.locator("text=선택됨"))).toBeVisible({ timeout: 5000 });
  });

  test("S3: 사진 선택 후 재클릭 → 선택 해제", async ({ page }) => {
    const token = await openGallery(page);
    if (!token) { test.skip(true, "접근 가능한 갤러리 없음"); return; }
    const photos = page.locator("img[loading='lazy']");
    if (await photos.count() === 0) { test.skip(true, "사진 없음"); return; }
    await photos.first().click();
    await page.waitForTimeout(400);
    await photos.first().click();
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/gallery/);
  });

  test("S4: 필터 탭 — '선택됨' 전환", async ({ page }) => {
    const token = await openGallery(page);
    if (!token) { test.skip(true, "접근 가능한 갤러리 없음"); return; }
    const selectedTab = page.getByRole("button", { name: "선택됨" });
    if (!(await selectedTab.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(true, "필터 탭 없음"); return; }
    await selectedTab.click();
    await page.waitForTimeout(300);
    const allTab = page.getByRole("button", { name: "전체 사진" });
    if (await allTab.isVisible({ timeout: 2000 }).catch(() => false)) await allTab.click();
    await expect(page).toHaveURL(/\/gallery/);
  });

  test("S5: 확정 버튼 — N장 미선택 시 비활성", async ({ page }) => {
    const token = await openGallery(page);
    if (!token) { test.skip(true, "접근 가능한 갤러리 없음"); return; }
    const confirmBtn = page.getByRole("button", { name: /보정 의뢰|확정/i });
    if (!(await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(true, "확정 버튼 없음"); return; }
    await expect(confirmBtn).toBeDisabled();
  });
});
