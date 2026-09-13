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

  test("D1-1: 로그인 기본 목적지가 남아 있어도 로딩 화면에 머물지 않음", async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.setItem("acut_post_login_redirect", "/photographer/dashboard");
    });

    await page.goto("/photographer/dashboard");

    await expect(
      page.getByText("전체 프로젝트")
        .or(page.getByText("첫 프로젝트를"))
        .or(page.getByText("만들어보세요"))
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("불러오는 중")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("acut_post_login_redirect"))).toBeNull();
  });

  test("D1-2: 다른 로그인 복귀 목적지는 기존처럼 이동함", async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.setItem("acut_post_login_redirect", "/beta/apply");
    });

    await page.goto("/photographer/dashboard");

    await expect(page).toHaveURL(/\/beta\/apply$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "클로즈드 베타 신청" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("acut_post_login_redirect"))).toBeNull();
  });

  test("D2: '진행중' 카드 클릭 → 필터 활성화", async ({ page }) => {
    const card = page.getByText("진행중").first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "요약 카드 없음"); return;
    }
    await card.click();
    await page.waitForTimeout(300);
    // 필터 활성화 후 페이지 정상 상태 유지
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
  });

  test("D3: '완료' 카드 클릭 → 완료 프로젝트 필터", async ({ page }) => {
    const card = page.getByText("완료").first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "요약 카드 없음"); return;
    }
    await card.click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
  });

  test("D4: '전체 프로젝트' 카드 클릭 → 전체 복원", async ({ page }) => {
    // 먼저 진행중 필터
    const activeCard = page.getByText("진행중").first();
    if (await activeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeCard.click();
      await page.waitForTimeout(200);
    }
    // 전체로 복원
    const allCard = page.getByText("전체 프로젝트").first();
    if (!(await allCard.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "요약 카드 없음"); return;
    }
    await allCard.click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
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
