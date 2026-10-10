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

test("partial upload keeps failed files linked, relinking is announced, wrong retouch can be removed", async ({ page }) => {
  await mockGet(page);
  await page.route("**/api/customer-upload/retouched", (route) =>
    route.fulfill({ json: { uploaded: 1, rejected: ["A001-final.jpg"], versions: [{ filename: "mystery.jpg" }] } }));

  await page.goto(`/customer-select/${projectId}/retouch/upload`);
  await page.locator('input[type="file"]').setInputFiles([
    { name: "A001-final.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
    { name: "mystery.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
  ]);
  // 자동 연결된 A001.jpg를 다른 파일로 옮기면 이전 연결이 풀린 걸 알려 준다.
  await page.getByRole("button", { name: "원본 고르기" }).click();
  await expect(page.getByRole("button", { name: "A001.jpg에 연결 (A001-final.jpg에 연결됨)" })).toBeVisible();
  await page.getByRole("button", { name: "A001.jpg에 연결" }).click();
  await expect(page.getByRole("status")).toContainText("A001-final.jpg 파일은 원본을 다시 골라 주세요");
  await expect(page.getByText("1장 연결 · 1장 확인 필요")).toBeVisible();
  await page.getByRole("button", { name: "원본 고르기" }).click();
  await page.getByRole("button", { name: "A003.jpg에 연결" }).click();
  await page.getByRole("button", { name: "확인한 2장 올리기" }).click();

  // 일부 실패: 화면에 남고, 실패한 파일만 연결을 유지한 채 남는다.
  await expect(page.getByRole("alert").filter({ hasText: "올렸어요" })).toContainText("올리지 못한 파일: A001-final.jpg");
  await expect(page).toHaveURL(/\/retouch\/upload$/);
  await expect(page.getByText("1장을 선택했어요")).toBeVisible();
  await expect(page.getByText("1장 연결 · 0장 확인 필요")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인한 1장 올리기" })).toBeEnabled();

  // BE 배포 전(삭제 API 없음)이면 FastAPI 기본 404 영어 문구 대신 안내를 보여 준다.
  await page.route("**/api/customer-upload/retouched/v2?*", (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }));
  await page.goto(`/customer-select/${projectId}/retouch/compare`);
  await page.getByRole("button", { name: "A002.jpg 보정본 지우기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "지우기" }).click();
  await expect(page.getByRole("dialog")).toContainText("지금은 보정본을 지울 수 없어요");
  await expect(page.getByRole("dialog")).not.toContainText("Not Found");

  let deleted = "";
  await page.route("**/api/customer-upload/retouched/v1?*", (route) => {
    deleted = route.request().method();
    return route.fulfill({ json: { deleted: true } });
  });
  await page.goto(`/customer-select/${projectId}/retouch/compare`);
  await page.getByRole("button", { name: "A001.jpg 보정본 지우기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "지우기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deleted).toBe("DELETE");
});
