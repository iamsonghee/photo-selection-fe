import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import path from "path";
import fs from "fs";

const FIXTURES = path.join(__dirname, "../../fixtures");

async function getUploadPageUrl(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  const uploadLink = page.locator("a[href*='/upload']").first();
  if (!(await uploadLink.isVisible({ timeout: 5000 }).catch(() => false))) return null;
  return uploadLink.getAttribute("href");
}

async function doUpload(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(FIXTURES, filename));
  const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
  if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await uploadBtn.click();
  }
}

test.describe("작가 — 파일 업로드", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
  });

  test("U1: JPG 업로드 → 완료 메시지", async ({ page }) => {
    const url = await getUploadPageUrl(page);
    if (!url) { test.skip(true, "preparing 프로젝트 없음"); return; }
    await page.goto(url);
    await doUpload(page, "sample.jpg");
    await expect(
      page.locator("text=업로드 완료").or(page.locator("text=완료!"))
    ).toBeVisible({ timeout: 30_000 });
  });

  test("U2: PNG 업로드 → 완료 메시지", async ({ page }) => {
    const pngPath = path.join(FIXTURES, "sample.png");
    if (!fs.existsSync(pngPath)) fs.copyFileSync(path.join(FIXTURES, "sample.jpg"), pngPath);
    const url = await getUploadPageUrl(page);
    if (!url) { test.skip(true, "preparing 프로젝트 없음"); return; }
    await page.goto(url);
    await doUpload(page, "sample.png");
    await expect(
      page.locator("text=업로드 완료").or(page.locator("text=완료!"))
    ).toBeVisible({ timeout: 30_000 });
  });

  test("U5: CR3(RAW) 업로드 → 거부 메시지 [BUG-01 회귀]", async ({ page }) => {
    const url = await getUploadPageUrl(page);
    if (!url) { test.skip(true, "preparing 프로젝트 없음"); return; }
    await page.goto(url);
    await doUpload(page, "fake.cr3");
    await expect(
      page.locator("text=지원하지 않는 형식").or(page.locator("text=JPEG/PNG/WebP/HEIC"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("U6: 대문자 확장자(.JPG) 정상 처리 [BUG-02 회귀]", async ({ page }) => {
    const upperPath = path.join(FIXTURES, "SAMPLE.JPG");
    if (!fs.existsSync(upperPath)) fs.copyFileSync(path.join(FIXTURES, "sample.jpg"), upperPath);
    const url = await getUploadPageUrl(page);
    if (!url) { test.skip(true, "preparing 프로젝트 없음"); return; }
    await page.goto(url);
    await doUpload(page, "SAMPLE.JPG");
    await page.waitForTimeout(5000);
    await expect(page.locator("text=지원하지 않는 형식")).not.toBeVisible();
  });

  test("U12: 0바이트 파일 → 완료 메시지 없음", async ({ page }) => {
    const url = await getUploadPageUrl(page);
    if (!url) { test.skip(true, "preparing 프로젝트 없음"); return; }
    await page.goto(url);
    await doUpload(page, "empty.jpg");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=업로드 완료")).not.toBeVisible();
  });
});
