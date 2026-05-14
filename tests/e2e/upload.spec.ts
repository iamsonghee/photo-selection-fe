import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../helpers/auth";
import path from "path";

const FIXTURES = path.join(__dirname, "../fixtures");

/** 업로드 페이지 URL을 가져오기 위한 헬퍼 — 첫 번째 preparing 프로젝트 사용 */
async function getUploadPageUrl(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  // preparing 상태 프로젝트의 업로드 링크 찾기
  const uploadLink = page.locator("a[href*='/upload']").first();
  if (!(await uploadLink.isVisible({ timeout: 5000 }).catch(() => false))) {
    return null;
  }
  const href = await uploadLink.getAttribute("href");
  return href;
}

test.describe("파일 업로드 (Upload)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
  });

  test("U1: 유효한 JPG 파일 업로드 성공", async ({ page }) => {
    const uploadUrl = await getUploadPageUrl(page);
    if (!uploadUrl) {
      test.skip(true, "preparing 상태 프로젝트 없음 — 테스트 건너뜀");
      return;
    }
    await page.goto(uploadUrl);

    // 파일 선택
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES, "sample.jpg"));

    // 확인 모달 → 업로드 버튼
    const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadBtn.click();
    }

    // 업로드 완료 표시 확인 (토스트 or 카운트 증가)
    await expect(
      page.locator("text=업로드 완료").or(page.locator("text=완료!"))
    ).toBeVisible({ timeout: 30_000 });
  });

  test("U5: CR3 파일 → 거부 메시지 표시 (BUG-01 회귀 방지)", async ({ page }) => {
    const uploadUrl = await getUploadPageUrl(page);
    if (!uploadUrl) {
      test.skip(true, "preparing 상태 프로젝트 없음 — 테스트 건너뜀");
      return;
    }
    await page.goto(uploadUrl);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES, "fake.cr3"));

    // 확인 모달이 뜨면 업로드 진행
    const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadBtn.click();
    }

    // 거부 메시지 확인 — 조용한 실패가 아닌 명시적 안내
    await expect(
      page.locator("text=지원하지 않는 형식").or(page.locator("text=JPEG/PNG/WebP/HEIC"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("U12: 0바이트 파일 → 업로드 카운트 변동 없음", async ({ page }) => {
    const uploadUrl = await getUploadPageUrl(page);
    if (!uploadUrl) {
      test.skip(true, "preparing 상태 프로젝트 없음 — 테스트 건너뜀");
      return;
    }
    await page.goto(uploadUrl);

    // 현재 업로드 수 기록 (없으면 0)
    const countBefore = await page.locator("[data-testid='upload-count']")
      .textContent({ timeout: 3000 })
      .catch(() => "0");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES, "empty.jpg"));

    const uploadBtn = page.getByRole("button", { name: /업로드/i }).last();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadBtn.click();
    }

    // 3초 대기 후 카운트 변동 없어야 함
    await page.waitForTimeout(3000);
    const countAfter = await page.locator("[data-testid='upload-count']")
      .textContent({ timeout: 3000 })
      .catch(() => "0");

    expect(countAfter).toBe(countBefore);
  });
});
