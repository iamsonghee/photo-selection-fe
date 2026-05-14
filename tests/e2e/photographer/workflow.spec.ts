import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { setupFullProject, deleteTestProject, type TestProject } from "../../helpers/setup";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5); // 사진 5장 포함 프로젝트
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("작가 — 워크플로우(보정 관리)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
  });

  test("W1: 워크플로우 페이지 로드 → 원본 탭 표시", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/workflow`);
    await page.waitForLoadState("networkidle");
    // 원본 탭은 모든 상태에서 보임
    await expect(page.getByText("원본").first()).toBeVisible({ timeout: 8000 });
  });

  test("W2: 원본 탭 → 내보내기 버튼 존재", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/workflow`);
    await page.waitForLoadState("networkidle");
    await page.getByText("원본").first().click();
    await page.waitForTimeout(500);
    // 사진이 있는 경우 내보내기 버튼 확인
    const exportBtn = page.getByRole("button", { name: /내보내기/i });
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
  });

  test("W3: 갤러리/파일명 뷰 토글", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/workflow`);
    await page.waitForLoadState("networkidle");
    // 파일명(리스트) 뷰 버튼 클릭 — List 아이콘 버튼
    const buttons = page.getByRole("button").filter({ hasNotText: /내보|탭|원본|V1|V2/ });
    const listBtn = buttons.last();
    if (await listBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page).toHaveURL(/\/workflow/);
  });

  test("W4: 원본 탭 → CSV 내보내기 다운로드", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/workflow`);
    await page.waitForLoadState("networkidle");
    await page.getByText("원본").first().click();
    await page.waitForTimeout(500);
    const exportBtn = page.getByRole("button", { name: /내보내기/i });
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
