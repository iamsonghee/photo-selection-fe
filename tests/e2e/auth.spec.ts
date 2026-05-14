import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../helpers/auth";

test.describe("인증 (Auth)", () => {
  test("L2: 이메일 로그인 → 대시보드 리디렉션", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/dashboard");

    // 로그인 페이지로 튕기지 않고 대시보드 유지
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
  });

  test("L4: 비인증 상태에서 대시보드 → 로그인 안내 표시", async ({ page }) => {
    // 로그인 없이 보호 페이지 접근
    await page.goto("/photographer/dashboard");

    // 앱이 URL은 유지하되 로그인 안내 메시지 표시
    // (redirect 없이 "로그인하면 프로젝트를 볼 수 있습니다" 노출)
    await expect(page.getByRole("link", { name: "로그인" })).toBeVisible({ timeout: 8000 });
  });
});
