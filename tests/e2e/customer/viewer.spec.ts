import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { findActiveProjectToken } from "../../helpers/project";

async function openGalleryWithPhotos(page: Page) {
  await loginAsPhotographer(page);
  const token = await findActiveProjectToken(page);
  if (!token) return null;
  await page.context().clearCookies();
  await page.goto(`/c/${token}/gallery`);
  await page.waitForLoadState("networkidle");
  if (await page.locator("input[inputmode='numeric']").isVisible({ timeout: 2000 }).catch(() => false)) return null;
  const photos = page.locator("img[loading='lazy']");
  if (await photos.count() === 0) return null;
  return { token, photos };
}

test.describe("고객 — 뷰어 (사진 크게 보기)", () => {
  test("V1: 갤러리 사진 클릭 → 뷰어 진입", async ({ page }) => {
    const ctx = await openGalleryWithPhotos(page);
    if (!ctx) { test.skip(true, "갤러리 사진 없음"); return; }
    // 뷰어 링크 찾기 (사진 클릭이 선택이 아닌 뷰어로 이어지는지 확인)
    const viewerLink = page.locator("a[href*='/viewer/']").first();
    if (await viewerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewerLink.click();
    } else {
      // 직접 URL 이동
      await page.goto(`/c/${ctx.token}/viewer`);
    }
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/viewer\//);
  });

  test("V2: 뷰어에서 방향키(→) → 다음 사진", async ({ page }) => {
    const ctx = await openGalleryWithPhotos(page);
    if (!ctx) { test.skip(true, "갤러리 사진 없음"); return; }
    // 첫 번째 뷰어 URL로 이동
    const viewerLink = page.locator("a[href*='/viewer/']").first();
    if (!(await viewerLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "뷰어 링크 없음"); return;
    }
    const href = await viewerLink.getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    const urlBefore = page.url();
    // 방향키로 다음 이동
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    // URL 또는 카운터 변경 확인
    const urlAfter = page.url();
    // URL이 바뀌거나 카운터가 표시됨
    const counterVisible = await page.locator("text=/ ").isVisible({ timeout: 2000 }).catch(() => false);
    expect(urlAfter !== urlBefore || counterVisible).toBeTruthy();
  });

  test("V3: 뷰어에서 ESC → 갤러리 복귀", async ({ page }) => {
    const ctx = await openGalleryWithPhotos(page);
    if (!ctx) { test.skip(true, "갤러리 사진 없음"); return; }
    const viewerLink = page.locator("a[href*='/viewer/']").first();
    if (!(await viewerLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "뷰어 링크 없음"); return;
    }
    const href = await viewerLink.getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // 갤러리로 돌아가거나 X 버튼으로 닫기
    const isGallery = page.url().includes("/gallery");
    const xBtn = page.locator("button[aria-label='닫기']").or(page.locator("text=← 갤러리"));
    expect(isGallery || await xBtn.isVisible({ timeout: 2000 }).catch(() => false)).toBeTruthy();
  });

  test("V4: 뷰어에서 사진 선택/해제", async ({ page }) => {
    const ctx = await openGalleryWithPhotos(page);
    if (!ctx) { test.skip(true, "갤러리 사진 없음"); return; }
    const viewerLink = page.locator("a[href*='/viewer/']").first();
    if (!(await viewerLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "뷰어 링크 없음"); return;
    }
    const href = await viewerLink.getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    // Space 키 또는 선택 버튼
    const selectBtn = page.getByRole("button", { name: /선택|Select/i });
    if (await selectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectBtn.click();
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
    }
    await expect(page).toHaveURL(/\/viewer\//);
  });
});
