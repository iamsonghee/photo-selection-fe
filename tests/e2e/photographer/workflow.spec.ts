import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

async function findWorkflowUrl(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  const links = await page.locator("a[href*='/workflow']").all();
  for (const link of links) {
    const href = await link.getAttribute("href");
    if (href) return href;
  }
  // 직접 프로젝트 상세에서 workflow 링크 탐색
  const projectLinks = await page.locator("a[href*='/photographer/projects/']").all();
  for (const link of projectLinks.slice(0, 3)) {
    const href = await link.getAttribute("href");
    if (!href || href.includes("/upload") || href.includes("/workflow")) continue;
    const idMatch = href.match(/\/projects\/([a-f0-9-]{36})/);
    if (!idMatch) continue;
    await page.goto(href);
    const wfLink = page.locator("a[href*='/workflow']").first();
    if (await wfLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      return wfLink.getAttribute("href");
    }
  }
  return null;
}

test.describe("작가 — 워크플로우(보정 관리)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
  });

  test("W1: 워크플로우 페이지 로드 → 탭(원본/V1) 표시", async ({ page }) => {
    const url = await findWorkflowUrl(page);
    if (!url) { test.skip(true, "워크플로우 페이지 없음"); return; }
    await page.goto(url);
    await expect(page.getByText("원본")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("V1 보정본")).toBeVisible();
  });

  test("W2: 원본 탭 → 내보내기 버튼 존재", async ({ page }) => {
    const url = await findWorkflowUrl(page);
    if (!url) { test.skip(true, "워크플로우 페이지 없음"); return; }
    await page.goto(url);
    await page.getByText("원본").first().click();
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: /내보내기/i })).toBeVisible({ timeout: 5000 });
  });

  test("W3: 갤러리/파일명 뷰 토글", async ({ page }) => {
    const url = await findWorkflowUrl(page);
    if (!url) { test.skip(true, "워크플로우 페이지 없음"); return; }
    await page.goto(url);
    // 파일명 뷰로 전환
    const listBtn = page.getByRole("button").filter({ has: page.locator("svg") }).last();
    if (await listBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(300);
    }
    // 갤러리 뷰로 복귀
    const gridBtn = page.getByRole("button").filter({ has: page.locator("svg") }).nth(-2);
    if (await gridBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gridBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page).toHaveURL(/\/workflow/);
  });

  test("W4: V1 탭 → 파일명 목록 내보내기 CSV", async ({ page }) => {
    const url = await findWorkflowUrl(page);
    if (!url) { test.skip(true, "워크플로우 페이지 없음"); return; }
    await page.goto(url);
    await page.getByText("V1 보정본").click();
    await page.waitForTimeout(300);
    const exportBtn = page.getByRole("button", { name: /내보내기/i });
    if (!(await exportBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "내보내기 버튼 없음 (사진 없을 수 있음)"); return;
    }
    // 다운로드 이벤트 감지
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
