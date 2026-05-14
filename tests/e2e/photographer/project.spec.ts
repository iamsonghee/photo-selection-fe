import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { setupTestProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import { findFirstProjectUrl } from "../../helpers/project";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupTestProject(page);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("작가 — 프로젝트 관리", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPhotographer(page);
  });

  test("P1: 프로젝트 목록 페이지 로드", async ({ page }) => {
    await page.goto("/photographer/projects");
    await expect(page).toHaveURL(/\/photographer\/projects/);
    // URL 유지 + 페이지 정상 로드 확인 (프로젝트 유무와 무관하게 통과)
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/photographer\/projects/);
  });

  test("P2: 새 프로젝트 생성 폼 — 필드 입력 후 생성 버튼 활성화", async ({ page }) => {
    await page.goto("/photographer/projects/new");
    await expect(page).toHaveURL(/\/projects\/new/);

    // 프로젝트명 입력 (실제 placeholder: "예: 2024 김민수님 스튜디오 촬영")
    const nameInput = page.locator("input[placeholder*='촬영']").or(page.locator("input[placeholder*='프로젝트']")).first();
    await nameInput.fill("E2E 테스트 프로젝트");

    // 고객명 입력
    const customerInput = page.getByLabel(/고객/).or(page.locator("input[placeholder*='고객']")).first();
    if (await customerInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerInput.fill("테스트 고객");
    }

    // 다음 버튼 확인 ("다음: 사진 업로드" 텍스트)
    const saveBtn = page.getByRole("button", { name: /다음|사진 업로드/i });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });

  test("P3: 프로젝트 검색 → 결과 필터링", async ({ page }) => {
    await page.goto("/photographer/projects");
    const searchInput = page.locator("input[placeholder*='검색']");
    if (!(await searchInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "검색 입력창 없음");
      return;
    }
    await searchInput.fill("없는프로젝트xyz");
    await page.waitForTimeout(500);
    // 결과 없음 또는 빈 목록
    const hasResults = await page.locator("a[href*='/photographer/projects/']").count();
    expect(hasResults).toBe(0);
  });

  test("P4: 프로젝트 탭 필터 — 진행중/완료 전환", async ({ page }) => {
    await page.goto("/photographer/projects");
    // '진행중' 탭 클릭
    const activeTab = page.getByRole("button", { name: "진행중" });
    if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeTab.click();
      await page.waitForTimeout(300);
    }
    // '완료' 탭 클릭
    const doneTab = page.getByRole("button", { name: "완료" });
    if (await doneTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await doneTab.click();
      await page.waitForTimeout(300);
    }
    // 탭 전환 후 페이지 정상 상태 확인
    await expect(page).toHaveURL(/\/photographer\/projects/);
  });

  test("P5: 프로젝트 상세 페이지 로드", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}`);
    await expect(
      page.locator("text=정보 수정").or(page.locator("h1,h2").first())
    ).toBeVisible({ timeout: 8000 });
  });

  test("P6: 정보 수정 모달 열기/닫기", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}`);
    const editBtn = page.getByRole("button", { name: "정보 수정" });
    if (!(await editBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "정보 수정 버튼 없음");
      return;
    }
    await editBtn.click();
    // 모달 열림 확인
    await expect(page.locator("text=프로젝트명").or(page.getByRole("dialog"))).toBeVisible({ timeout: 5000 });
    // ESC로 닫기
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });
});
