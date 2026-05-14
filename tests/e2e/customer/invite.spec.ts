import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { findActiveProjectToken } from "../../helpers/project";

test.describe("고객 — 초대 링크", () => {
  test("I1: 유효한 초대 링크 → 갤러리 또는 PIN 화면", async ({ page }) => {
    await loginAsPhotographer(page);
    const token = await findActiveProjectToken(page);
    if (!token) { test.skip(true, "고객 접근 가능 프로젝트 없음"); return; }

    // 고객 컨텍스트로 접근 (로그인 쿠키 초기화)
    await page.context().clearCookies();
    await page.goto(`/c/${token}`);
    await page.waitForLoadState("networkidle");

    // 갤러리 또는 PIN 화면 또는 리뷰 화면 중 하나
    await expect(
      page.locator("text=사진").or(page.locator("input[inputmode='numeric']")).or(page.locator("text=보정"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("I2: 잘못된 토큰 → 에러 화면", async ({ page }) => {
    await page.goto("/c/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator("text=존재하지 않는").or(page.locator("text=찾을 수 없")).or(page.locator("text=유효하지"))
    ).toBeVisible({ timeout: 8000 });
  });

  test("I3: 초대 링크 → 갤러리 직접 접근", async ({ page }) => {
    await loginAsPhotographer(page);
    const token = await findActiveProjectToken(page);
    if (!token) { test.skip(true, "고객 접근 가능 프로젝트 없음"); return; }

    await page.context().clearCookies();
    await page.goto(`/c/${token}/gallery`);
    await page.waitForLoadState("networkidle");

    // PIN 화면이거나 갤러리 화면
    const isPinScreen = await page.locator("input[inputmode='numeric']").isVisible({ timeout: 3000 }).catch(() => false);
    if (isPinScreen) {
      test.skip(true, "PIN 보호 프로젝트 — I3 건너뜀");
      return;
    }
    await expect(page).toHaveURL(/\/gallery/);
  });
});
