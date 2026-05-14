import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../helpers/auth";

test.describe("인증 (Auth)", () => {
  test("L2: 이메일 로그인 → 대시보드 리디렉션", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/dashboard");

    // 로그인 성공 → 대시보드 URL 유지 (인증 안된 경우 "/" 또는 로그인 UI로 이동)
    await expect(page).toHaveURL(/\/photographer\/dashboard/, { timeout: 8000 });
    // 비인증 상태의 "로그인하면..." 메시지가 없어야 함
    await expect(page.getByText("로그인하면 프로젝트를 볼 수 있습니다")).not.toBeVisible();
  });

  test("L4: 비인증 상태에서 대시보드 → 로그인 안내 표시", async ({ page }) => {
    // 로그인 없이 보호 페이지 접근
    await page.goto("/photographer/dashboard");

    // 앱이 URL은 유지하되 로그인 안내 메시지 표시
    // (redirect 없이 "로그인하면 프로젝트를 볼 수 있습니다" 노출)
    await expect(page.getByRole("link", { name: "로그인" })).toBeVisible({ timeout: 8000 });
  });
});
