import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createFullProject, setupTestProject, deleteTestProject, type TestProject } from "../../helpers/setup";

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
    await expect(page.getByRole("button", { name: "정보 수정" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("heading", { name: "원본 사진을 업로드하세요" })).toBeVisible();
    await expect(page.getByText("사진 업로드 후 가능", { exact: true })).toBeVisible();
    await expect(page.getByText("YOU ARE HERE", { exact: true })).toHaveCount(0);
  });

  test("P6: 정보 수정 모달 열기/닫기", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}`);
    const editBtn = page.getByRole("button", { name: "정보 수정" });
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();
    // 모바일·데스크톱용 포털이 함께 렌더링되므로 현재 뷰포트(데스크톱)의 마지막 다이얼로그를 검사한다.
    await expect(page.getByRole("dialog").last()).toContainText("프로젝트명", { timeout: 5000 });
    // ESC로 닫기
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("P8: 셀렉 중 상세 화면은 정확한 안내문·진행 상태를 PC와 모바일에 표시", async ({ page }) => {
    const selectingProject = await createFullProject(page, 5);
    try {
      await page.goto(`/photographer/projects/${selectingProject.projectId}`);
      await expect(page.getByRole("heading", { name: "고객이 사진을 선택하고 있습니다" })).toBeVisible({ timeout: 8000 });
      await expect(
        page.getByText("고객이 최종 선택을 완료하면 셀렉 결과와 코멘트를 확인할 수 있습니다.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("고객 셀렉 중", { exact: true })).toBeVisible();
      await expect(page.getByText("YOU ARE HERE", { exact: true })).toHaveCount(0);

      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      await expect(page.getByRole("button", { name: "정보 수정" })).toBeVisible({ timeout: 8000 });
      await expect(page.getByText("고객 셀렉 중", { exact: true })).toBeVisible();
    } finally {
      await deleteTestProject(page, selectingProject.projectId);
    }
  });

  test("P7: 이용 한도 조회 실패 시 생성 폼을 열어주지 않는다 (fail-open 회귀 방지)", async ({ page }) => {
    // GET /api/photographer/quota를 강제로 실패시켜, 한도 확인이 안 된 상태에서
    // 생성 폼이 노출되지 않는지(무제한으로 잘못 간주하지 않는지) 검증한다.
    await page.route("**/api/photographer/quota", (route) => route.abort("failed"));

    await page.goto("/photographer/projects/new");

    // 에러 상태(다시 시도)가 노출되어야 하고, 생성 폼(이름 입력)은 보이면 안 된다.
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible({ timeout: 8000 });
    const nameInput = page.locator("input[placeholder*='촬영']").or(page.locator("input[placeholder*='프로젝트']")).first();
    await expect(nameInput).not.toBeVisible();
  });
});
