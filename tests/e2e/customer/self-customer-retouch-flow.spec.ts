import { expect, test, type Page } from "@playwright/test";

const projectId = "retouch-qa";
const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23ddd'/%3E%3C/svg%3E";
const photos = ["A001.jpg", "A002.jpg", "A003.jpg"].map((filename, index) => ({
  id: `p${index + 1}`, filename, url: pixel, previewUrl: pixel,
  versions: index < 2 ? [{ id: `v${index + 1}`, round: 1, filename: `A00${index + 1}-final.jpg`, thumbUrl: pixel, previewUrl: pixel, decision: "pending", redoReason: null, createdAt: "2026-09-26" }] : [],
}));

async function mockGet(page: Page) {
  await page.route(`**/api/customer-select/projects/${projectId}/retouch`, (route) =>
    route.fulfill({ json: { photos, retouchDone: false, isOwner: true } }));
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name}: batch matching, photo choice and compare viewer`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockGet(page);
    let uploaded = 0;
    await page.route("**/api/customer-upload/retouched", (route) => {
      uploaded++;
      return route.fulfill({ json: { uploaded: 2, rejected: [] } });
    });

    await page.goto(`/customer-select/${projectId}/retouch/upload`);
    await expect(page.getByRole("button", { name: "받은 사진 선택하기" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles([
      { name: "A001-final.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
      { name: "mystery.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
    ]);
    await expect(page.getByText("1장 연결 · 1장 확인 필요")).toBeVisible();
    await page.getByRole("button", { name: "원본 고르기" }).click();
    await page.getByRole("button", { name: "A003.jpg에 연결" }).click();
    await expect(page.getByText("2장 연결 · 0장 확인 필요")).toBeVisible();
    await page.getByRole("button", { name: "확인한 2장 올리기" }).click();
    await expect(page).toHaveURL(new RegExp("/retouch/compare$"));
    expect(uploaded).toBe(1);
    await expect(page.getByRole("button", { name: "A001.jpg 보정본 비교하기" })).toBeVisible();
    await page.getByRole("button", { name: "A001.jpg 보정본 비교하기" }).click();
    await expect(page.getByRole("dialog", { name: "A001.jpg 크게 보기" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "A002.jpg 크게 보기" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "재보정 요청" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${viewport.name}: retouch pages require project owner`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route(`**/api/customer-select/projects/${projectId}/retouch`, (route) =>
      route.fulfill({ status: 403, json: { error: "프로젝트 소유자만 이용할 수 있습니다." } }));
    await page.goto(`/customer-select/${projectId}/retouch/compare`);
    await expect(page.getByText("프로젝트 소유자만 이용할 수 있습니다.")).toBeVisible();
  });
}
