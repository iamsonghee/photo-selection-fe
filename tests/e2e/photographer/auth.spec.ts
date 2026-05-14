import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test.describe("작가 — 인증", () => {
  test("L2: 이메일 로그인 → 대시보드 유지", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/dashboard");
    await expect(page).toHaveURL(/\/photographer\/dashboard/, { timeout: 8000 });
    await expect(page.getByText("로그인하면 프로젝트를 볼 수 있습니다")).not.toBeVisible();
  });

  test("L4: 비인증 상태 → 로그인 안내 표시", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await expect(page.getByRole("link", { name: "로그인" })).toBeVisible({ timeout: 8000 });
  });

  test("L5: 로그인 후 프로젝트 목록 접근 가능", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/projects");
    await expect(page).toHaveURL(/\/photographer\/projects/);
    // 헤더 또는 프로젝트 페이지 고유 요소 확인
    await expect(page.getByRole("link", { name: "새 프로젝트" }).or(
      page.locator("text=프로젝트")
    ).first()).toBeVisible({ timeout: 8000 });
  });
});
