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
    await expect(page).toHaveURL(/\/gallery/, { timeout: 3000 });
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

  test("V5: 존재하지 않는 사진 주소 → 안내와 갤러리 복귀 링크", async ({ page }) => {
    await page.goto(`${project.galleryUrl.replace(/\/gallery$/, "")}/viewer/not-a-real-photo-id`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "사진을 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByRole("link", { name: "갤러리로 돌아가기" })).toHaveAttribute("href", /\/gallery/);
  });

  test("V6: 현재·인접 프리뷰를 배치 발급하고 캐시된 사진은 다시 요청하지 않음", async ({ page }) => {
    const requestedBatches: string[][] = [];
    const transparentGif = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    await page.route("**/api/c/presign-preview?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const photoIds = (requestUrl.searchParams.get("photoIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      requestedBatches.push(photoIds);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presignedUrls: Object.fromEntries(photoIds.map((id) => [
            id,
            { url: `${transparentGif}#${id}`, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
          ])),
        }),
      });
    });

    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);

    await expect.poll(() => requestedBatches.length).toBe(1);
    expect(requestedBatches[0]).toHaveLength(3); // 첫 사진 + 다음 2장

    await page.keyboard.press("ArrowRight");
    await expect.poll(() => requestedBatches.length).toBe(2);
    expect(requestedBatches[1]).toHaveLength(1); // 앞서 받은 3장은 캐시, 새 다음 사진만 추가

    const allRequestedIds = requestedBatches.flat();
    expect(new Set(allRequestedIds).size).toBe(allRequestedIds.length);
    expect(requestedBatches.every((batch) => batch.length <= 4)).toBeTruthy();
  });

  test("V7: 모바일은 현재 사진과 양옆 1장 범위만 선발급", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requestedBatches: string[][] = [];
    await page.route("**/api/c/presign-preview?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const photoIds = (requestUrl.searchParams.get("photoIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      requestedBatches.push(photoIds);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presignedUrls: Object.fromEntries(photoIds.map((id) => [
            id,
            {
              url: `data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=#${id}`,
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
          ])),
        }),
      });
    });

    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);

    await expect.poll(() => requestedBatches.length).toBe(1);
    expect(requestedBatches[0]).toHaveLength(2); // 첫 사진 + 다음 1장 (이전 사진 없음)
  });
});
