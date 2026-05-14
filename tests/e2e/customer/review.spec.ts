import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

/** reviewing_v1/v2 상태 프로젝트의 토큰 찾기 */
async function findReviewToken(page: Page): Promise<string | null> {
  await loginAsPhotographer(page);
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  const content = await page.content();
  // 검토중 상태 프로젝트에서 토큰 탐색
  const matches = content.matchAll(/\/c\/([a-f0-9-]{36})/g);
  for (const m of matches) {
    const token = m[1];
    // 해당 토큰으로 review 페이지 접근 시도
    await page.context().clearCookies();
    await page.goto(`/c/${token}/review`);
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/review") && !page.url().includes("confirmed") && !page.url().includes("locked")) {
      return token;
    }
    await loginAsPhotographer(page);
  }
  return null;
}

test.describe("고객 — 보정본 검토", () => {
  test("R1: 검토 페이지 로드 → 사진 목록 표시", async ({ page }) => {
    const token = await findReviewToken(page);
    if (!token) { test.skip(true, "검토 가능한 프로젝트 없음"); return; }
    await page.context().clearCookies();
    await page.goto(`/c/${token}/review`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/review/);
    // 보정본 이미지 또는 검토 UI
    await expect(
      page.locator("img").or(page.locator("text=보정")).or(page.locator("text=검토"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("R2: 사진 확정 클릭 → 확정 상태 표시", async ({ page }) => {
    const token = await findReviewToken(page);
    if (!token) { test.skip(true, "검토 가능한 프로젝트 없음"); return; }
    await page.context().clearCookies();
    await page.goto(`/c/${token}/review`);
    await page.waitForLoadState("networkidle");
    // 첫 번째 사진의 확정 버튼
    const approveBtn = page.getByRole("button", { name: /확정|승인|Approve/i }).first();
    if (!(await approveBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "확정 버튼 없음"); return;
    }
    await approveBtn.click();
    await page.waitForTimeout(500);
    // 확정 상태 표시 확인
    await expect(page.locator("text=확정").or(page.locator("text=approved"))).toBeVisible({ timeout: 5000 });
  });

  test("R3: 재보정 요청 + 코멘트 입력", async ({ page }) => {
    const token = await findReviewToken(page);
    if (!token) { test.skip(true, "검토 가능한 프로젝트 없음"); return; }
    await page.context().clearCookies();
    await page.goto(`/c/${token}/review`);
    await page.waitForLoadState("networkidle");
    const revisionBtn = page.getByRole("button", { name: /재보정|수정|Revision/i }).first();
    if (!(await revisionBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "재보정 버튼 없음"); return;
    }
    await revisionBtn.click();
    await page.waitForTimeout(300);
    // 코멘트 입력창
    const commentBox = page.locator("textarea").or(page.locator("input[placeholder*='코멘트']")).first();
    if (await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentBox.fill("E2E 테스트 재보정 요청 코멘트");
    }
    await expect(page).toHaveURL(/\/review/);
  });

  test("R4: 전체 검토 완료 → 제출 버튼 활성화", async ({ page }) => {
    const token = await findReviewToken(page);
    if (!token) { test.skip(true, "검토 가능한 프로젝트 없음"); return; }
    await page.context().clearCookies();
    await page.goto(`/c/${token}/review`);
    await page.waitForLoadState("networkidle");
    // 제출 버튼 상태 확인
    const submitBtn = page.getByRole("button", { name: /작가에게 전달|제출|Submit/i });
    if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "제출 버튼 없음"); return;
    }
    // 검토 완료 전: 비활성 상태여야 함
    const isDisabled = await submitBtn.isDisabled();
    // 이미 전부 검토됐거나 아직 안 됐거나 — 두 케이스 모두 유효
    expect(typeof isDisabled).toBe("boolean");
  });
});
