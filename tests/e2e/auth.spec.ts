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

  test("L4: 비인증 상태에서 보호 페이지 접근 → 리디렉션", async ({ page }) => {
    // 로그인 없이 보호 페이지 접근
    await page.goto("/photographer/dashboard");

    // 인증이 없으므로 루트 또는 로그인 페이지로 리디렉션
    await expect(page).not.toHaveURL(/\/photographer\/dashboard/);
  });
});
