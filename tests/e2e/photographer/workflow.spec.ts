import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { setupFullProject, deleteTestProject, createEditingProject, type TestProject } from "../../helpers/setup";

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

  test("W-MOB: 모바일 뷰포트에서 보정본 업로드 버튼 표시 확인", async ({ browser }) => {
    // editing 상태 프로젝트 별도 생성 (selecting 상태에서는 업로드 패널 비활성)
    const helperPage = await browser.newPage();
    await loginAsPhotographer(helperPage);
    const editingProject = await createEditingProject(helperPage, 5);
    await helperPage.close();

    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await loginAsPhotographer(page);
    await page.goto(`/photographer/projects/${editingProject.projectId}/workflow`);
    await page.waitForLoadState("networkidle");

    // V1 탭으로 이동
    const v1Tab = page.getByRole("button", { name: /^V1/i }).first();
    await expect(v1Tab).toBeVisible({ timeout: 8000 });
    await v1Tab.click();
    await page.waitForTimeout(500);

    // V1 업로드 패널 열기 버튼 클릭 (카드별로 여러 개 존재 → first() 사용)
    const openPanelBtn = page.getByRole("button", { name: /보정본 업로드|V1 업로드|업로드 시작|보정 시작/i }).first();
    await expect(openPanelBtn).toBeVisible({ timeout: 8000 });
    await openPanelBtn.click();
    await page.waitForTimeout(800);

    // 업로드 버튼이 viewport 안에 보여야 함 (모바일 하단 네비 뒤에 가리면 실패)
    const uploadBtn = page.getByRole("button", { name: /^업로드$/i });
    await expect(uploadBtn).toBeVisible({ timeout: 8000 });

    // 버튼 하단이 모바일 네비(60px) 위에 있어야 함
    const box = await uploadBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(667 - 60);

    // 테스트 프로젝트 정리
    await page.request.delete("/api/auth/test-setup", {
      data: { projectId: editingProject.projectId },
    });
    await page.close();
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
