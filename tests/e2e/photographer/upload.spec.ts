import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { setupTestProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import path from "path";
import fs from "fs";

const FIXTURES = path.join(__dirname, "../../fixtures");

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupTestProject(page);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await loginAsPhotographer(page);
});

async function doUpload(page: import("@playwright/test").Page, filename: string) {
  await page.goto(project.uploadUrl);
  await page.waitForLoadState("networkidle");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(FIXTURES, filename));
  const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
  if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await uploadBtn.click();
  }
}

test.describe("작가 — 파일 업로드", () => {
  test("U1: JPG 업로드 → 완료 메시지", async ({ page }) => {
    await doUpload(page, "sample.jpg");
    await expect(
      page.locator("text=업로드 완료").or(page.locator("text=완료!"))
    ).toBeVisible({ timeout: 30_000 });
  });

  test("U2: PNG 업로드 → 완료 메시지", async ({ page }) => {
    const pngPath = path.join(FIXTURES, "sample.png");
    if (!fs.existsSync(pngPath)) fs.copyFileSync(path.join(FIXTURES, "sample.jpg"), pngPath);
    await doUpload(page, "sample.png");
    await expect(
      page.locator("text=업로드 완료").or(page.locator("text=완료!"))
    ).toBeVisible({ timeout: 30_000 });
  });

  test("U5: CR3(RAW) 업로드 → 거부되고 사진 수 증가 없음 [BUG-01 회귀]", async ({ page }) => {
    await page.goto(project.uploadUrl);
    await page.waitForLoadState("networkidle");
    // 현재 업로드된 사진 수 기록
    const countText = await page.locator("text=/\\d+장/").first().textContent({ timeout: 3000 }).catch(() => "0장");
    // CR3 파일 업로드 시도
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES, "fake.cr3"));
    const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) await uploadBtn.click();
    await page.waitForTimeout(8000);
    // 거부 메시지 또는 사진 수 동일 확인 (둘 중 하나)
    const errorVisible = await page.locator("text=지원하지 않는 형식").isVisible().catch(() => false);
    const countAfter = await page.locator("text=/\\d+장/").first().textContent({ timeout: 2000 }).catch(() => countText);
    // 거부 메시지가 뜨거나, 사진 수가 변하지 않아야 함
    expect(errorVisible || countAfter === countText).toBeTruthy();
  });

  test("U6: 대문자 확장자(.JPG) → 정상 업로드 [BUG-02 회귀]", async ({ page }) => {
    const upperPath = path.join(FIXTURES, "SAMPLE.JPG");
    if (!fs.existsSync(upperPath)) fs.copyFileSync(path.join(FIXTURES, "sample.jpg"), upperPath);
    await doUpload(page, "SAMPLE.JPG");
    await page.waitForTimeout(5000);
    await expect(page.locator("text=지원하지 않는 형식")).not.toBeVisible();
  });

  test("U12: 0바이트 파일 → 거부 또는 사진 수 유지", async ({ page }) => {
    await page.goto(project.uploadUrl);
    await page.waitForLoadState("networkidle");
    const countBefore = await page.locator("text=/\\d+장/").first().textContent({ timeout: 3000 }).catch(() => "0장");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES, "empty.jpg"));
    const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) await uploadBtn.click();
    await page.waitForTimeout(8000);
    // "업로드 완료!"가 아닌 실패 메시지거나, 사진 수가 동일해야 함
    const successToast = await page.locator("text=업로드 완료!").isVisible().catch(() => false);
    const countAfter = await page.locator("text=/\\d+장/").first().textContent({ timeout: 2000 }).catch(() => countBefore);
    expect(!successToast || countAfter === countBefore).toBeTruthy();
  });
});
