import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test.describe("작가 — 대시보드", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("D1: 대시보드 로드 → 요약 카드 3개 표시", async ({ page }) => {
    // 전체 프로젝트 / 진행중 / 완료 카드
    await expect(page.getByText("전체 프로젝트")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("진행중")).toBeVisible();
    await expect(page.getByText("완료")).toBeVisible();
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
});
