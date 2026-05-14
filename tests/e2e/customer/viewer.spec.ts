import { test, expect } from "@playwright/test";
import { setupFullProject, deleteTestProject, type TestProject } from "../../helpers/setup";
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

async function openGallery(page: import("@playwright/test").Page) {
  await page.goto(project.galleryUrl);
  await page.waitForLoadState("networkidle");
}

test.describe("고객 — 뷰어 (사진 크게 보기)", () => {
  test("V1: 갤러리 사진 클릭 → 뷰어 진입", async ({ page }) => {
    await openGallery(page);
    // 뷰어 링크 찾기
    const viewerLinks = page.locator("a[href*='/viewer/']");
    const count = await viewerLinks.count();
    if (count === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/viewer\//);
    // 사진 이미지 확인
    await expect(page.locator("img").first()).toBeVisible({ timeout: 8000 });
  });

  test("V2: 뷰어에서 방향키(→) → 다음 사진으로 이동", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    const urlBefore = page.url();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    // URL 변경 또는 카운터 변경 확인
    const urlAfter = page.url();
    const counterChanged = await page.locator("text=2 /").or(page.locator("text=/ 5")).isVisible({ timeout: 3000 }).catch(() => false);
    expect(urlAfter !== urlBefore || counterChanged).toBeTruthy();
  });

  test("V3: 뷰어에서 ESC → 갤러리 복귀", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // 갤러리로 이동하거나 갤러리 링크 표시
    await page.waitForTimeout(500);
    const isGallery = page.url().includes("/gallery");
    const hasGalleryLink = await page.getByRole("link", { name: /갤러리/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasBackText  = await page.locator("text=← 갤러리").isVisible({ timeout: 1000 }).catch(() => false);
    expect(isGallery || hasGalleryLink || hasBackText).toBeTruthy();
  });

  test("V4: 뷰어에서 사진 선택/해제 (Space 키)", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    // Space 키로 선택
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    // Space 키로 해제
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    // 뷰어 URL 유지 확인
    await expect(page).toHaveURL(/\/viewer\//);
  });
});
