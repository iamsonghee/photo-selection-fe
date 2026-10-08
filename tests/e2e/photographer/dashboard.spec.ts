import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test.describe("작가 — 대시보드", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("D1: 대시보드 로드 → 요약 카드 또는 빈 상태", async ({ page }) => {
    // 프로젝트 있으면 요약 카드, 없으면 EmptyDashboard
    await expect(
      page.getByText("전체 프로젝트")
        .or(page.getByText("첫 프로젝트를"))
        .or(page.getByText("만들어보세요"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("D1-1: 로그인 복귀 쿠키가 남아 있어도 대시보드는 그대로 보임(복귀는 /auth/callback이 처리)", async ({ page }) => {
    // 2026-10-06부터 복귀 경로는 쿠키에 담겨 콜백이 소비한다. 대시보드는 더 이상 읽지도, 이동시키지도 않는다.
    await page.context().addCookies([
      { name: "acut_post_login_redirect", value: encodeURIComponent("/beta/apply"), url: new URL(page.url()).origin },
    ]);

    await page.goto("/photographer/dashboard");

    await expect(
      page.getByText("전체 프로젝트")
        .or(page.getByText("첫 프로젝트를"))
        .or(page.getByText("만들어보세요"))
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
    await expect(page.getByText("불러오는 중")).toHaveCount(0);
  });

  // 2026-09 개편으로 대시보드 안에서 목록을 거르던 요약 카드(진행중/완료/전체)는 없어졌다.
  // 지금 구성: 업무 현황 → 이어서 확인할 프로젝트·최근 변경 → 보조 정보(사용량·최근 활동).
  test("D2: 업무 현황과 이어서 확인할 프로젝트를 보여준다", async ({ page }) => {
    await expect(page.getByRole("region", { name: "업무 현황" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("complementary", { name: "대시보드 보조 정보" })).toBeVisible();
  });

  test("D3: '전체 프로젝트' 링크 → 프로젝트 목록", async ({ page }) => {
    const allProjects = page.getByRole("link", { name: "전체 프로젝트" }).first();
    await expect(allProjects).toBeVisible({ timeout: 10_000 });
    await allProjects.click();
    await expect(page).toHaveURL(/\/photographer\/projects$/);
  });

  test("D4: 프로젝트 사용량을 숫자와 함께 보여준다", async ({ page }) => {
    const usage = page.getByRole("region", { name: "프로젝트 사용량" }).or(page.getByLabel(/프로젝트 사용량, \d+개 사용/));
    await expect(usage.first()).toBeVisible({ timeout: 10_000 });
  });

  test("D5: 모바일에서는 대시보드 대신 프로젝트 목록으로 진입", async ({ page }) => {
    const welcomeButton = page.getByRole("button", { name: "시작하기" });
    if (await welcomeButton.isVisible().catch(() => false)) await welcomeButton.click();

    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/photographer/dashboard");
      await expect(page).toHaveURL(/\/photographer\/projects$/);

      const globalHeader = page.locator(".photographer-mobile-header");
      const pageHeader = page.locator("[data-photographer-mobile-page-header]");
      await expect(globalHeader).toBeVisible();
      await expect(pageHeader).toBeVisible();
      await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
      await expect(pageHeader.getByRole("heading", { name: "프로젝트" })).toBeVisible();

      const globalBox = await globalHeader.boundingBox();
      const pageBox = await pageHeader.boundingBox();
      expect(globalBox).not.toBeNull();
      expect(pageBox).not.toBeNull();
      expect(pageBox!.y).toBeGreaterThanOrEqual(globalBox!.height - 1);

      const pageHeaderPadding = await pageHeader.evaluate((element) => getComputedStyle(element).paddingLeft);
      expect(pageHeaderPadding).toBe("20px");
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(hasHorizontalOverflow).toBe(false);
    }
  });
});
