import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createFullProject, setupTestProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import { formatPhotoDisplayFilename } from "../../../src/lib/photo-display-filename";

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

  test("P0: 원본 갤러리 표시 파일명은 원본 stem을 보존하고 확장자만 소문자로 통일", () => {
    expect(formatPhotoDisplayFilename("R0007727.JPG")).toBe("R0007727.jpg");
    expect(formatPhotoDisplayFilename("웨딩.최종.JPEG")).toBe("웨딩.최종.jpeg");
    expect(formatPhotoDisplayFilename("확장자없음")).toBe("확장자없음");
  });

  test("P1: 프로젝트 목록 페이지 로드", async ({ page }) => {
    await page.goto("/photographer/projects");
    await expect(page).toHaveURL(/\/photographer\/projects/);
    // URL 유지 + 페이지 정상 로드 확인 (프로젝트 유무와 무관하게 통과)
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/photographer\/projects/);
    const sidebar = page.locator("[data-photographer-sidebar]");
    await expect(sidebar).toHaveCSS("width", "266px");
    await expect(sidebar.getByRole("button", { name: "새 프로젝트" })).toHaveCount(0);
    const projectNav = sidebar.locator("a[href='/photographer/projects']");
    await expect(projectNav).toHaveCSS("min-height", "50px");
    await expect(projectNav).toHaveCSS("font-size", "15px");
    await expect(projectNav).toHaveCSS("line-height", "22px");
    await expect(projectNav).toHaveCSS("font-weight", "600");
    await expect(projectNav).toHaveCSS("letter-spacing", "-0.35px");
    await expect(projectNav.locator("svg")).toHaveCSS("width", "20px");
    const toggleButton = sidebar.getByRole("button", { name: "사이드바 접기" });
    await expect(toggleButton).toHaveCSS("width", "40px");
    await expect(toggleButton).toHaveCSS("height", "40px");
    const toggleVisualWidth = await toggleButton.locator("[data-sidebar-toggle-visual]").evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).width),
    );
    expect(toggleVisualWidth).toBeCloseTo(25.92, 1);
    const comingSoon = sidebar.getByText("준비중").first();
    await expect(comingSoon).toHaveCSS("font-size", "10.5px");
    await expect(comingSoon).toHaveCSS("border-top-width", "0px");
    await expect(comingSoon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("main[data-app-theme='light']")).toHaveCSS("margin-left", "266px");
    await expect(sidebar.locator("[data-sidebar-footer]")).toHaveCSS("border-top-width", "0px");
    const profileTrigger = sidebar.locator("[data-sidebar-profile-trigger]");
    await expect(profileTrigger).toHaveCSS("border-top-width", "0px");
    await profileTrigger.click();
    const profileMenu = sidebar.getByRole("menu");
    await expect(profileMenu).toBeVisible();
    await expect(profileMenu).toHaveCSS("width", "218px");
    await expect(profileMenu).toHaveCSS("border-radius", "12px");
    await expect(profileMenu).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const feedbackItem = profileMenu.getByRole("menuitem", { name: "문의하기" });
    await expect(feedbackItem).toBeVisible();
    await expect(feedbackItem).toHaveCSS("height", "40px");
    await expect(profileMenu.getByRole("menuitem", { name: "로그아웃" })).toHaveCSS("color", "rgb(220, 46, 47)");
    const profileMenuBox = await profileMenu.boundingBox();
    const profileTriggerBox = await profileTrigger.boundingBox();
    expect(profileMenuBox).not.toBeNull();
    expect(profileTriggerBox).not.toBeNull();
    expect(profileMenuBox!.height).toBeLessThan(260);
    expect(Math.abs(profileMenuBox!.x - profileTriggerBox!.x)).toBeLessThan(1);
    expect(Math.abs(profileTriggerBox!.y - profileMenuBox!.y - profileMenuBox!.height - 8)).toBeLessThan(1);
    if (process.env.SIDEBAR_CAPTURE === "1") {
      await page.screenshot({ path: "test-results/sidebar-light/compact-profile-menu.png" });
    }
    await profileTrigger.click();
    await expect(profileMenu).toBeHidden();
    if (process.env.SIDEBAR_CAPTURE === "1") {
      await page.screenshot({ path: "test-results/sidebar-light/expanded-project-list.png", fullPage: true });
    }
  });

  test("P1-M: 프로젝트 목록 모바일은 공통 page header와 원형 usage ring을 사용", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/photographer/projects");

    const pageHeader = page.locator("[data-photographer-mobile-page-header]");
    await expect(pageHeader.getByRole("heading", { name: "프로젝트" })).toBeVisible();
    await expect(pageHeader).toHaveCSS("padding-left", "20px");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
    const usageRing = pageHeader.getByRole("img", { name: /프로젝트 (사용량|한도)/ });
    await expect(usageRing).toBeVisible();
    await expect(usageRing).toHaveCSS("width", "73px");
    expect(await usageRing.locator("circle").count()).toBeGreaterThanOrEqual(1);
    const mobileProjectThumbnail = page.locator("[data-mobile-project-thumbnail]").first();
    await expect(mobileProjectThumbnail).toBeVisible();
    await expect(mobileProjectThumbnail).toHaveCSS("width", "80px");
    await expect(mobileProjectThumbnail).toHaveCSS("height", "80px");
    const firstThumbnailImage = page.locator("[data-mobile-project-thumbnail] img").first();
    if (await firstThumbnailImage.count()) {
      await expect(firstThumbnailImage).toHaveCSS("object-fit", "cover");
    }
    await expect(page.getByPlaceholder("프로젝트명, 고객명 검색")).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);

    const globalHeader = page.locator(".photographer-mobile-header");
    await expect(globalHeader).toHaveAttribute("data-compact", "false");
    await expect(globalHeader).toHaveCSS("height", "56px");
    await expect(globalHeader).toHaveCSS("border-bottom-width", "0px");
    // 짧은 테스트 fixture에서도 실제 document scroll을 만들 수 있는 작은 모바일 높이로 전환한다.
    await page.setViewportSize({ width: 390, height: 360 });
    const availableScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(availableScroll).toBeGreaterThan(48);
    await page.evaluate(() => window.scrollTo({ top: 160 }));
    await expect(globalHeader).toHaveAttribute("data-compact", "true");
    await expect(globalHeader).toHaveCSS("height", "44px");
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect(globalHeader).toHaveAttribute("data-compact", "false");

    // 프로젝트 목록뿐 아니라 공통 모바일 작가 헤더가 표시되는 하위 화면에도 같은 규칙을 적용한다.
    await page.goto("/photographer/projects/new");
    await expect(globalHeader).toHaveAttribute("data-compact", "false");
    const createPageAvailableScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(createPageAvailableScroll).toBeGreaterThan(48);
    await page.evaluate(() => window.scrollTo({ top: 160 }));
    await expect(globalHeader).toHaveAttribute("data-compact", "true");
    await expect(globalHeader).toHaveCSS("height", "44px");
  });

  test("P1-0: 접힌 사이드바 상태를 메뉴 이동 후에도 유지", async ({ page }) => {
    await page.goto("/photographer/projects");
    await page.getByRole("button", { name: "사이드바 접기" }).click();

    const sidebar = page.locator("[data-photographer-sidebar]");
    await expect(sidebar).toHaveCSS("width", "102.5px");
    const collapsedBrand = sidebar.getByTitle("A-CUT.");
    const collapsedBrandMark = collapsedBrand.locator("div").first();
    const expandButton = sidebar.getByRole("button", { name: "사이드바 펼치기" });
    await expect(collapsedBrand).toBeVisible();
    await expect(expandButton).toBeVisible();
    const collapsedBrandBox = await collapsedBrandMark.boundingBox();
    const expandButtonBox = await expandButton.boundingBox();
    expect(collapsedBrandBox).not.toBeNull();
    expect(expandButtonBox).not.toBeNull();
    expect(Math.abs(
      collapsedBrandBox!.y + collapsedBrandBox!.height / 2 - (expandButtonBox!.y + expandButtonBox!.height / 2),
    )).toBeLessThanOrEqual(2);
    expect(collapsedBrandBox!.x + collapsedBrandBox!.width).toBeLessThan(expandButtonBox!.x);
    await sidebar.getByRole("link", { name: "대시보드" }).click();
    await expect(page).toHaveURL(/\/photographer\/dashboard/);
    await page.waitForLoadState("networkidle");
    await expect(sidebar).toHaveCSS("width", "102.5px");
    await expect(page.locator("main[data-app-theme='light']")).toHaveCSS("margin-left", "102.5px");
    await expect(sidebar.locator("[data-sidebar-footer]")).toHaveCSS("border-top-width", "0px");
    await expect(sidebar.locator("[data-sidebar-profile-trigger]")).toHaveCSS("border-top-width", "0px");
    if (process.env.SIDEBAR_CAPTURE === "1") {
      await page.screenshot({ path: "test-results/sidebar-light/collapsed-after-navigation.png" });
    }
  });

  test("P1-1: 프로젝트 목록은 관리 메뉴 없이 상세 진입과 다음 작업만 제공", async ({ page }) => {
    await page.goto("/photographer/projects");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button[aria-label$='프로젝트 더보기']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "프로젝트 삭제", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/photographer\/projects/);
  });

  test("P1-2: 지정한 고객 진입 대표 사진을 프로젝트 목록 썸네일로 사용한다", async ({ page }) => {
    const coveredProject = await createFullProject(page, 2);
    try {
      const response = await page.request.patch(`/api/photographer/projects/${coveredProject.projectId}`, {
        data: { cover_photo_id: coveredProject.photoIds?.[1] },
      });
      expect(response.ok()).toBe(true);

      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/photographer/projects");
      const projectName = page.getByText(coveredProject.projectName!, { exact: true }).filter({ visible: true });
      await expect(projectName).toBeVisible({ timeout: 8000 });
      const projectRow = projectName.locator("xpath=ancestor::*[@role='button'][1]");
      await expect(projectRow.locator("img")).toHaveAttribute("src", /\?n=1$/);
    } finally {
      await deleteTestProject(page, coveredProject.projectId);
    }
  });

  test("P2: 새 프로젝트 생성 폼 — 필드 입력 후 생성 버튼 활성화", async ({ page }) => {
    // 공유 계정의 실제 quota 상태와 무관하게 생성 폼 자체를 검증한다. 서버 생성 제한은 별도 API/E2E에서 검증.
    await page.route("**/api/photographer/quota", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tier: "admin",
        current: 0,
        max: null,
        maxPhotosPerProject: null,
        betaStatus: "active",
        betaApplicationStatus: null,
      }),
    }));
    await page.goto("/photographer/projects/new");
    await expect(page).toHaveURL(/\/projects\/new/);
    const nameInput = page.locator("input[placeholder*='촬영']").or(page.locator("input[placeholder*='프로젝트']")).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // 프로젝트명 입력 (실제 placeholder: "예: 2024 김민수님 스튜디오 촬영")
    await nameInput.fill("E2E 테스트 프로젝트");

    // 고객명 입력
    const customerInput = page.getByLabel(/고객/).or(page.locator("input[placeholder*='고객']")).first();
    if (await customerInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerInput.fill("테스트 고객");
    }

    await expect(page.getByRole("button", { name: "나중에 올리기" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "원본 올리기" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "새 프로젝트 만들기" })).toBeVisible();
    await expect(page.getByText("프로젝트 기본 정보와 고객 갤러리 이용 조건을 설정해 주세요.")).toBeHidden();
    await expect(page.getByText("프로젝트를 구분하고 고객에게 안내할 정보를 입력해 주세요.")).toBeHidden();
    await expect(page.getByText("고객이 사진을 선택하고 요청을 남길 수 있는 범위와 접속 방식을 설정해 주세요.")).toBeHidden();
    await expect(page.getByText("필수", { exact: true }).first()).toBeVisible();
    const originalDownloadInfo = page.getByRole("button", { name: "원본 다운로드 허용 안내" });
    await expect(originalDownloadInfo).toBeVisible();
    await originalDownloadInfo.click();
    await expect(page.getByRole("tooltip")).toHaveText("고객이 셀렉 갤러리에서 원본 사진을 내려받을 수 있도록 허용해요");
    await page.setViewportSize({ width: 375, height: 812 });
    const pinLabel = page.locator("[data-project-pin-label]");
    await expect(pinLabel).toBeVisible();
    await expect(pinLabel).toHaveCSS("white-space", "nowrap");
    const pinLabelBox = await pinLabel.boundingBox();
    expect(pinLabelBox).not.toBeNull();
    expect(pinLabelBox!.height).toBeLessThanOrEqual(20);
    const pinInput = page.getByLabel("고객 비밀번호", { exact: true });
    await expect(pinInput).toHaveCSS("width", "64px");
    await expect(pinInput).toHaveCSS("letter-spacing", "4px");
    await expect(page.getByRole("button", { name: "나중에 올리기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "원본 올리기" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
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

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileStatusFilter = page.getByRole("combobox", { name: "프로젝트 상태" });
    await expect(mobileStatusFilter).toBeVisible();
    await expect(mobileStatusFilter.locator("option").allTextContents()).resolves.toEqual(["전체", "진행중", "완료"]);
    await mobileStatusFilter.selectOption("active");
    await expect(mobileStatusFilter).toHaveValue("active");
    await page.getByRole("button", { name: "촬영일 필터", exact: true }).click();
    const mobileDateFilter = page.getByRole("dialog", { name: "촬영일 필터" });
    await expect(mobileDateFilter).toBeVisible();
    await expect(mobileDateFilter.getByLabel("촬영일 시작일")).toBeVisible();
    await expect(mobileDateFilter.getByLabel("촬영일 종료일")).toBeVisible();
    await expect(mobileDateFilter.locator("[data-mobile-project-date-filter]")).toBeVisible();
    await mobileDateFilter.getByRole("button", { name: "완료" }).click();
    await expect(mobileDateFilter).toBeHidden();
  });

  test("P5: 프로젝트 상세 페이지 로드", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}`);
    await expect(page.locator("main[data-app-theme='light']")).toBeVisible();
    const sidebar = page.locator("[data-photographer-sidebar]");
    await expect(sidebar).toHaveAttribute("data-sidebar-theme", "light");
    await expect(sidebar).toHaveCSS("width", "102.5px");
    await expect(page.locator("main[data-app-theme='light']")).toHaveCSS("margin-left", "102.5px");
    if (process.env.SIDEBAR_CAPTURE === "1") {
      await page.screenshot({ path: "test-results/sidebar-light/collapsed-project-detail.png", fullPage: true });
    }
    await expect(sidebar).toHaveCSS("background-color", "rgb(245, 248, 248)");
    const sidebarFontFamily = await sidebar.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(sidebarFontFamily).toContain("Pretendard");
    expect(sidebarFontFamily).not.toContain("Inter");
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toContainText("프로젝트");
    const breadcrumbProjectId = (await breadcrumb.locator("[aria-current='page']").textContent())?.replace(/^#/, "") ?? "";
    expect(breadcrumbProjectId).not.toBe("");
    await expect(page.getByText(breadcrumbProjectId, { exact: true })).toHaveCount(0);
    await expect(page.locator("summary[aria-label='프로젝트 더보기']:visible")).toBeVisible();
    await page.locator("summary[aria-label='프로젝트 더보기']:visible").click();
    const overflowMenu = page.getByRole("menu");
    await expect(overflowMenu).toBeVisible();
    await expect(overflowMenu).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.getByRole("menuitem", { name: "수정하기" })).toBeVisible();
    await page.getByRole("menuitem", { name: "삭제하기" }).click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog).toHaveAttribute("data-modal-variant", "confirmation");
    await expect(deleteDialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(deleteDialog).toHaveCSS("border-radius", "24px");
    await expect(deleteDialog).toHaveCSS("padding", "36px");
    await expect(deleteDialog).not.toHaveCSS("border-top-color", "rgb(220, 46, 47)");
    const deleteDialogBox = await deleteDialog.boundingBox();
    expect(deleteDialogBox).not.toBeNull();
    expect(deleteDialogBox!.width).toBe(412);
    const deleteTitle = deleteDialog.getByRole("heading", { name: "프로젝트를 삭제할까요?" });
    await expect(deleteTitle).toHaveCSS("font-size", "24px");
    await expect(deleteTitle).toHaveCSS("line-height", "48px");
    await expect(deleteDialog.locator("[data-confirm-detail]")).toHaveCSS("border-radius", "12px");
    const destructiveButton = deleteDialog.getByRole("button", { name: "프로젝트 삭제" });
    await expect(destructiveButton).toHaveCSS("background-color", "rgb(220, 46, 47)");
    await expect(destructiveButton).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(destructiveButton).toHaveCSS("height", "56px");
    await expect(deleteDialog.getByRole("button", { name: "취소" })).toHaveCSS(
      "background-color",
      "rgb(238, 243, 244)",
    );
    await expect(deleteDialog.getByRole("button", { name: "닫기" })).toHaveCount(0);
    if (process.env.PROJECT_DETAIL_CAPTURE === "1") {
      await page.waitForTimeout(150);
      await page.screenshot({
        path: "test-results/project-detail-light/delete-confirmation.png",
      });
    }
    await deleteDialog.getByRole("button", { name: "취소" }).click();
    await expect(page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible")).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "알림톡 보내기" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /PIN (변경|설정)/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "원본 사진을 업로드하세요" })).toBeVisible();
    const progressCardBox = await page.locator("[data-project-progress-card]").boundingBox();
    expect(progressCardBox).not.toBeNull();
    expect(progressCardBox!.height).toBeLessThanOrEqual(105);
    const currentStep = page.locator("[data-step-state='current']");
    await expect(currentStep).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(currentStep).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    const workPanelBorder = await page.locator("[data-project-work-panel]").evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    );
    expect(workPanelBorder).not.toBe("rgb(255, 87, 18)");
    const workPanelBox = await page.locator("[data-project-work-panel]").boundingBox();
    expect(workPanelBox).not.toBeNull();
    expect(workPanelBox!.height).toBeLessThanOrEqual(430);
    const workPanelTitle = page.locator("[data-project-work-panel] h2");
    await expect(workPanelTitle).toHaveCSS("font-size", "24px");
    await expect(workPanelTitle).toHaveCSS("line-height", "32px");
    const informationCard = page.locator("[data-project-information-card]");
    await expect(informationCard).toBeVisible();
    await expect(informationCard.getByRole("heading", { name: "프로젝트 설정" })).toHaveCSS("font-size", "18px");
    const gallerySummary = page.locator("[data-project-gallery-summary]");
    await expect(gallerySummary).toHaveCSS("background-color", "rgb(238, 243, 244)");
    await expect(gallerySummary.locator("dt")).toHaveCount(4);
    await expect(gallerySummary.locator("dd")).toHaveCount(4);
    const customerLinkSection = page.locator("[data-project-customer-link]");
    await expect(customerLinkSection).toBeVisible();
    const customerLinkControls = customerLinkSection.locator("[data-customer-link-control]");
    await expect(customerLinkControls).toHaveCount(2);
    await expect(customerLinkControls.first()).toHaveCSS("height", "44px");
    const kakaoButton = customerLinkSection.getByRole("button", { name: "알림톡 보내기" });
    await expect(kakaoButton).toBeDisabled();
    await expect(kakaoButton).toHaveCSS("background-color", "rgb(238, 243, 244)");
    const primaryColumnBox = await page.locator("[data-project-detail-primary-column]").boundingBox();
    const secondaryColumnBox = await page.locator("[data-project-detail-secondary-column]").boundingBox();
    expect(primaryColumnBox).not.toBeNull();
    expect(secondaryColumnBox).not.toBeNull();
    expect(secondaryColumnBox!.width).toBeGreaterThanOrEqual(379);
    expect(secondaryColumnBox!.width).toBeLessThanOrEqual(441);
    expect(primaryColumnBox!.width).toBeGreaterThan(secondaryColumnBox!.width);
    expect(Math.abs(primaryColumnBox!.y - secondaryColumnBox!.y)).toBeLessThanOrEqual(1);
    for (const selector of [
      "[data-project-shoot-date]",
      "[data-project-customer-phone]",
      "[data-project-review-deadline]",
    ]) {
      const fontFamily = await page.locator(selector).evaluate(
        (element) => getComputedStyle(element).fontFamily,
      );
      expect(fontFamily).toContain("Pretendard");
      expect(fontFamily).not.toContain("Inter");
      expect(fontFamily).not.toContain("JetBrains Mono");
    }
    await expect(page.locator("[data-project-shoot-date]")).toHaveCSS("line-height", "32px");
    await expect(page.locator("[data-project-customer-phone]")).toHaveCSS("line-height", "22px");
    await expect(page.locator("[data-project-review-deadline]")).toHaveCSS("line-height", "24px");
    await expect(page.getByText("사진 업로드 후 가능", { exact: true })).toBeVisible();
    await expect(page.getByText("YOU ARE HERE", { exact: true })).toHaveCount(0);
  });

  test("P6: 정보 수정 전체 화면 열기/닫기/저장", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}`);
    const openEditView = async () => {
      await page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible").click();
      await page.getByRole("menuitem", { name: "수정하기" }).click();
    };
    await expect(page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible")).toBeVisible({ timeout: 5000 });
    await openEditView();
    await expect(page.getByRole("heading", { name: "프로젝트 정보 수정" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "고객 갤러리 설정" })).toBeVisible();
    await expect(page.getByLabel("촬영장소")).toBeVisible();
    await expect(page.getByRole("button", { name: "변경사항 저장" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "프로젝트 상세로 돌아가기" }).click();
    await expect(page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible")).toBeVisible();

    await openEditView();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-project-form-page-heading]")).toBeHidden();
    await expect(page.getByRole("heading", { name: "프로젝트 정보 수정" })).toHaveClass(/sr-only/);
    await expect(page.getByRole("button", { name: "프로젝트 상세로 돌아가기" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "기본 정보" })).toHaveCSS("font-size", "16px");
    const mobileEditNameInput = page.getByPlaceholder("예: 2024 김민수님 스튜디오 촬영");
    await expect(mobileEditNameInput).toHaveCSS("min-height", "48px");
    await expect(mobileEditNameInput).toHaveCSS("font-size", "16px");
    await expect(mobileEditNameInput).toHaveCSS("padding-left", "16px");
    await expect(mobileEditNameInput).toHaveCSS("border-radius", "8px");
    await expect(page.locator("[data-project-form-section]").first()).toHaveCSS("padding-left", "16px");
    const mobileBasicSection = page.locator("[data-project-form-section]").first();
    const mobileShootDateInput = page.locator("#edit-field-shootDate input[type='date']");
    await expect(mobileShootDateInput).toBeVisible();
    await expect(mobileShootDateInput).toHaveCSS("min-width", "0px");
    const mobileShootDateDisplay = page.locator("#edit-field-shootDate [data-project-form-date-display]");
    await expect(mobileShootDateDisplay).toBeVisible();
    await expect(mobileShootDateDisplay).toHaveText(/\d{4}\.\d{2}\.\d{2}/);
    expect(await mobileShootDateDisplay.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const [mobileSectionBox, mobileShootDateBox] = await Promise.all([
      mobileBasicSection.boundingBox(),
      mobileShootDateInput.boundingBox(),
    ]);
    expect(mobileSectionBox).not.toBeNull();
    expect(mobileShootDateBox).not.toBeNull();
    expect(mobileShootDateBox!.x).toBeGreaterThanOrEqual(mobileSectionBox!.x);
    expect(mobileShootDateBox!.x + mobileShootDateBox!.width).toBeLessThanOrEqual(mobileSectionBox!.x + mobileSectionBox!.width);
    expect(await mobileBasicSection.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await openEditView();
    await expect(page.getByPlaceholder("예: 2024 김민수님 스튜디오 촬영")).toHaveCSS("padding-left", "20px");
    await expect(page.getByPlaceholder("예: 2024 김민수님 스튜디오 촬영")).toHaveCSS("border-radius", "12px");
    await page.getByLabel("촬영장소").fill("E2E 촬영장소");
    await page.getByLabel("고객 비밀번호", { exact: true }).fill("2468");
    await page.getByRole("button", { name: "변경사항 저장" }).click();
    await expect(page.locator("[data-project-location]:visible")).toHaveText("E2E 촬영장소", { timeout: 5000 });
    await expect(page.locator("input[type='password']")).toHaveValue("2468");
  });

  test("P7: 고객 요청 활성화 후에도 잠긴 납품 설정을 유지하며 PIN 변경 가능", async ({ page }) => {
    const activeProject = await createFullProject(page, 3);
    try {
      const response = await page.request.patch(`/api/photographer/projects/${activeProject.projectId}`, {
        data: {
          access_pin: "1357",
          include_original: false,
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();

      await page.goto(`/photographer/projects/${activeProject.projectId}`);
      await page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible").click();
      await page.getByRole("menuitem", { name: "수정하기" }).click();
      await expect(page.getByLabel("고객 비밀번호", { exact: true })).toBeEnabled();
      await expect(page.getByLabel("고객 비밀번호", { exact: true })).toHaveValue("1357");
    } finally {
      await deleteTestProject(page, activeProject.projectId);
    }
  });

  test("P9: 프로젝트 상세 Light 반응형 — Desktop/Narrow/Mobile", async ({ page }) => {
    const projectUrl = `/photographer/projects/${project.projectId}`;

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(projectUrl);
    await expect(page.locator("[data-project-information-card]")).toBeVisible({ timeout: 8000 });

    const contentGrid = page.locator("[data-project-detail-content-grid]");
    const desktopColumnCount = await contentGrid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(desktopColumnCount).toBe(2);
    const desktopProgressColumnCount = await page.locator("[data-project-progress-grid]").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(desktopProgressColumnCount).toBe(6);

    if (process.env.PROJECT_DETAIL_CAPTURE === "1") {
      await page.screenshot({
        path: "test-results/project-detail-light/desktop-full.png",
        fullPage: true,
      });
      await page.locator("[data-project-progress-card]").screenshot({
        path: "test-results/project-detail-light/desktop-stepper.png",
      });
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    const narrowColumnCount = await contentGrid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(narrowColumnCount).toBe(1);
    const narrowPrimaryBox = await page.locator("[data-project-detail-primary-column]").boundingBox();
    const narrowSecondaryBox = await page.locator("[data-project-detail-secondary-column]").boundingBox();
    expect(narrowPrimaryBox).not.toBeNull();
    expect(narrowSecondaryBox).not.toBeNull();
    expect(narrowSecondaryBox!.y).toBeGreaterThan(narrowPrimaryBox!.y + narrowPrimaryBox!.height);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHeader = page.locator(".photographer-mobile-header");
    await expect(mobileHeader).toHaveAttribute("data-mobile-theme", "light");
    await expect(mobileHeader).toHaveCSS("color-scheme", "light");
    await expect(mobileHeader).toHaveCSS("border-bottom-width", "0px");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
    const mobilePageHeader = page.locator("[data-photographer-mobile-page-header]");
    await expect(mobilePageHeader).toBeVisible();
    await expect(mobilePageHeader.locator("h1")).not.toHaveText("");
    await expect(mobilePageHeader.getByRole("link", { name: "뒤로가기" })).toHaveCount(0);
    await expect(mobilePageHeader.locator("h1")).toHaveCSS("font-size", "26px");
    await expect(mobilePageHeader).toContainText(/\d{4}\.\d{2}\.\d{2} 촬영/);
    await expect(page.locator("main.photographer-mobile-shell-main")).toHaveCSS("padding-top", "56px");
    const mobilePageHeaderBox = await mobilePageHeader.boundingBox();
    const mobileChromeBox = await mobileHeader.boundingBox();
    expect(mobilePageHeaderBox).not.toBeNull();
    expect(mobileChromeBox).not.toBeNull();
    expect(mobilePageHeaderBox!.y).toBeGreaterThanOrEqual(mobileChromeBox!.height - 1);
    const mobileProgressColumnCount = await page.locator("[data-project-progress-grid]").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(mobileProgressColumnCount).toBe(6);
    const mobileProgressCardBox = await page.locator("[data-project-progress-card]").boundingBox();
    expect(mobileProgressCardBox).not.toBeNull();
    expect(mobileProgressCardBox!.height).toBeLessThanOrEqual(80);
    await expect(page.getByRole("button", { name: /프로젝트 정보 (접기|펼치기)/ })).toHaveCount(0);
    await expect(page.locator("[data-project-mobile-information-summary]")).toBeVisible();
    await expect(page.locator("[data-project-mobile-information-summary]")).toHaveCSS("border-top-width", "0px");
    await expect(page.locator("[data-project-gallery-summary]")).toBeHidden();
    await expect(page.locator("[data-project-customer-link]").locator("..")).toHaveCSS("border-top-width", "0px");
    await expect(page.locator("[data-project-work-panel]")).toContainText("업로드 0장 · 목표 5장");

    const mobileWorkPanelBox = await page.locator("[data-project-work-panel]").boundingBox();
    const mobileInformationCardBox = await page.locator("[data-project-information-card]").boundingBox();
    expect(mobileWorkPanelBox).not.toBeNull();
    expect(mobileInformationCardBox).not.toBeNull();
    expect(mobileWorkPanelBox!.y + mobileWorkPanelBox!.height).toBeLessThanOrEqual(mobileInformationCardBox!.y);

    await expect(page.getByText("사진 업로드 후 고객 링크가 생성돼요.")).toBeVisible();
    await expect(page.getByText("촬영 장소 미설정")).toBeHidden();
    await expect(page.getByText("연락처 미설정")).toBeHidden();

    const mobileInformationMenu = page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible");
    await expect(mobileInformationMenu).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await mobileInformationMenu.click();
    await expect(page.getByRole("menuitem", { name: "수정하기" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "삭제하기" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.evaluate(() => window.scrollTo({ top: 180 }));
    await expect(mobileHeader).toHaveAttribute("data-compact", "true");
    await expect(mobileHeader).toHaveAttribute("data-project-context-visible", "true");
    await expect(mobileHeader.locator("[data-mobile-project-header-context]")).toContainText("[E2E] 테스트 프로젝트");
    await expect(mobileHeader.locator("[data-mobile-project-header-context]")).toContainText("E2E 테스트 고객 고객");
    await expect(mobileHeader.locator("[data-mobile-project-header-context]")).not.toContainText(/#[A-Z0-9-]+/);
    await expect(mobileHeader.locator("[data-mobile-project-header-context] span").first()).toHaveCSS("font-size", "15px");
    await expect(mobileHeader.locator("[data-mobile-project-header-context] span").last()).toHaveCSS("font-size", "13px");
    await expect(mobileHeader.getByText("A-CUT.", { exact: true })).toBeHidden();
    await expect(mobileHeader.getByRole("link", { name: "설정" })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect(mobileHeader).toHaveAttribute("data-project-context-visible", "false");
    await expect(mobileHeader.getByText("A-CUT.", { exact: true })).toBeVisible();
    await expect(mobileHeader.getByRole("link", { name: "설정" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const customerLinkButtons = page.locator("[data-project-customer-link] button:visible");
    for (let index = 0; index < await customerLinkButtons.count(); index += 1) {
      const buttonBox = await customerLinkButtons.nth(index).boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox!.x).toBeGreaterThanOrEqual(0);
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(391);
    }

    if (process.env.PROJECT_DETAIL_CAPTURE === "1") {
      await page.screenshot({
        path: "test-results/project-detail-light/mobile-viewport.png",
      });
      await page.locator(".photographer-mobile-header").evaluateAll((elements) => {
        elements.forEach((element) => {
          (element as HTMLElement).style.visibility = "hidden";
        });
      });
      await page.screenshot({
        path: "test-results/project-detail-light/mobile-full.png",
        fullPage: true,
      });
    }
  });

  test("P8: 셀렉 중 상세 화면은 정확한 안내문·진행 상태를 PC와 모바일에 표시", async ({ page }) => {
    const selectingProject = await createFullProject(page, 5);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/photographer/projects/${selectingProject.projectId}`);
      await expect(page.getByRole("heading", { name: "고객이 사진을 선택하고 있습니다" })).toBeVisible({ timeout: 8000 });
      await expect(
        page.getByText("고객이 최종 선택을 완료하면 셀렉 결과와 코멘트를 확인할 수 있습니다.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("고객 셀렉 중", { exact: true })).toBeHidden();
      await expect(page.getByText("YOU ARE HERE", { exact: true })).toHaveCount(0);

      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      await expect(page.locator("[data-project-information-card] summary[aria-label='프로젝트 더보기']:visible")).toBeVisible({ timeout: 8000 });
      await expect(page.getByText("고객 셀렉 중", { exact: true })).toBeHidden();

      await expect(page.getByRole("tab", { name: /셀렉/ })).toHaveCount(0);
      await page.getByRole("button", { name: "원본 사진 보기" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/photographer/projects/${selectingProject.projectId}/assets/original`),
      );
      await page.goto(`/photographer/projects/${selectingProject.projectId}/assets/selected`);
      await expect(page).toHaveURL(
        new RegExp(`/photographer/projects/${selectingProject.projectId}/assets/original`),
      );
    } finally {
      await deleteTestProject(page, selectingProject.projectId);
    }
  });

  test("P9: 고객이 셀렉 확정을 취소한 뒤 보정 시작 시 필요한 조치를 안내", async ({ page }) => {
    const selectingProject = await createFullProject(page, 5);
    try {
      const response = await page.request.patch(`/api/photographer/projects/${selectingProject.projectId}`, {
        data: { status: "editing" },
      });
      expect(response.status()).toBe(400);
      const body = await response.json() as { error?: string; code?: string; currentStatus?: string };
      expect(body).toEqual(expect.objectContaining({
        error: "고객이 사진 셀렉 확정을 취소해 보정을 시작할 수 없어요. 고객이 다시 확정한 뒤 시작해 주세요.",
        code: "INVALID_STATUS_TRANSITION",
        currentStatus: "selecting",
      }));
      expect(body.error).not.toMatch(/현재: selecting|상태를 'editing'/);
    } finally {
      await deleteTestProject(page, selectingProject.projectId);
    }
  });

  test("P10-G: 원본 묶음은 선택과 분리하고 멤버에서도 접을 수 있다", async ({ page }) => {
    const selectingProject = await createFullProject(page, 8);
    try {
      expect(selectingProject.photoIds).toHaveLength(8);
      const seedGroupResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_photo_group",
          projectId: selectingProject.projectId,
          photoIds: selectingProject.photoIds!.slice(0, 3),
        },
      });
      expect(seedGroupResponse.ok()).toBe(true);
      const seedSelectionsResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_selections",
          projectId: selectingProject.projectId,
          photoIds: selectingProject.photoIds!.slice(0, 3),
        },
      });
      expect(seedSelectionsResponse.ok()).toBe(true);
      const seedRecommendationResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_recommendations",
          projectId: selectingProject.projectId,
          photoIds: [selectingProject.photoIds![1]],
        },
      });
      expect(seedRecommendationResponse.ok()).toBe(true);
      const sortedComment = "정렬 후에도 카드 간격 유지";
      const commentedPhotoId = selectingProject.photoIds![2];
      await page.route("**/rest/v1/selections?**", async (route) => {
        if (new URL(route.request().url()).searchParams.get("project_id") !== `eq.${selectingProject.projectId}`) {
          return route.continue();
        }
        const response = await route.fetch();
        const selections = await response.json() as Array<{ photo_id: string }>;
        await route.fulfill({
          response,
          json: selections.map((selection) => selection.photo_id === commentedPhotoId
            ? { ...selection, comment: sortedComment }
            : selection),
        });
      });
      await page.setViewportSize({ width: 1792, height: 1000 });
      await page.goto(`/photographer/projects/${selectingProject.projectId}/upload`);
      await expect(page).toHaveURL(
        new RegExp(`/photographer/projects/${selectingProject.projectId}/assets/original`),
        { timeout: 8000 },
      );
      await expect(page.getByRole("tab", { name: /원본/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("전체 원본", { exact: true })).toHaveCount(0);
      await expect(page.getByText("고객 공유 완료 · 읽기 전용", { exact: true })).toHaveCount(0);
      const similarityResultButton = page.locator("span:visible").filter({ hasText: /^유사컷 묶어보기$/ });
      await expect(similarityResultButton).toBeVisible();
      await similarityResultButton.click();
      const similarityGroupBadge = page.getByRole("button", { name: /유사컷 3장 펼치기/ });
      await expect(similarityGroupBadge).toBeVisible();
      await expect(page.getByLabel("작가 추천 1장")).toBeVisible();
      await similarityGroupBadge.click();
      await expect(page.getByRole("button", { name: /유사컷 3장 접기/ })).toHaveCount(3);
      await expect(page.locator("[data-original-photo-card] [data-photo-thumbnail-selection-ring]")).toHaveCount(0);
      await expect(page.getByRole("group", { name: "사진 맞춤 방식" })).toHaveCount(0);
      await page.getByRole("button", { name: /유사컷 3장 접기/ }).last().click();
      await expect(page.getByRole("button", { name: /유사컷 3장 펼치기/ })).toHaveCount(1);
      await page.setViewportSize({ width: 390, height: 844 });
      const expand = page.getByRole("button", { name: /유사컷 3장 펼치기/ });
      await expect(expand).toBeVisible();
      expect((await expand.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expand.click();
      await expect(page.getByRole("button", { name: /유사컷 3장 접기/ })).toHaveCount(3);
    } finally {
      await deleteTestProject(page, selectingProject.projectId);
    }
  });

  test("P10: 초대 활성화 후 업로드 URL은 읽기 전용 원본 탭으로 연결된다", async ({ page }) => {
    const selectingProject = await createFullProject(page, 8);
    try {
      expect(selectingProject.photoIds).toHaveLength(8);
      const seedGroupResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_photo_group",
          projectId: selectingProject.projectId,
          photoIds: selectingProject.photoIds!.slice(0, 3),
        },
      });
      expect(seedGroupResponse.ok()).toBe(true);
      const seedSelectionsResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_selections",
          projectId: selectingProject.projectId,
          photoIds: selectingProject.photoIds!.slice(0, 3),
        },
      });
      expect(seedSelectionsResponse.ok()).toBe(true);
      const sortedComment = "정렬 후에도 카드 간격 유지";
      const commentedPhotoId = selectingProject.photoIds![2];
      await page.route("**/rest/v1/selections?**", async (route) => {
        if (new URL(route.request().url()).searchParams.get("project_id") !== `eq.${selectingProject.projectId}`) {
          return route.continue();
        }
        const response = await route.fetch();
        const selections = await response.json() as Array<{ photo_id: string }>;
        await route.fulfill({
          response,
          json: selections.map((selection) => selection.photo_id === commentedPhotoId
            ? { ...selection, comment: sortedComment }
            : selection),
        });
      });
      await page.setViewportSize({ width: 1792, height: 1000 });
      await page.goto(`/photographer/projects/${selectingProject.projectId}/upload`);
      await expect(page).toHaveURL(
        new RegExp(`/photographer/projects/${selectingProject.projectId}/assets/original`),
        { timeout: 8000 },
      );
      await expect(page.getByRole("tab", { name: /원본/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("전체 원본", { exact: true })).toHaveCount(0);
      await expect(page.getByText("고객 공유 완료 · 읽기 전용", { exact: true })).toHaveCount(0);
      const similarityResultButton = page.getByRole("button", { name: /유사컷 1개 그룹 묶어보기/ });
      await expect(similarityResultButton).toBeVisible();
      await similarityResultButton.click();
      const similarityGroupBadge = page.getByRole("button", { name: /유사컷 3장 펼치기/ });
      await expect(similarityGroupBadge).toBeVisible();
      await similarityGroupBadge.click();
      await expect(page.getByRole("button", { name: /유사컷 3장 접기/ })).toHaveCount(3);
      await expect(page.locator("[data-original-photo-card] [data-photo-thumbnail-selection-ring]")).toHaveCount(0);
      await expect(page.getByRole("group", { name: "사진 맞춤 방식" })).toHaveCount(0);
      const desktopAssetIdentity = page.locator("[data-project-asset-identity]");
      await expect(desktopAssetIdentity).toBeVisible();
      expect((await desktopAssetIdentity.boundingBox())?.height).toBeLessThanOrEqual(40);
      await expect(desktopAssetIdentity.locator("[data-project-asset-context-name]")).not.toHaveText("");
      await expect(desktopAssetIdentity.locator("[data-project-asset-meta]")).toContainText("고객");
      await expect(desktopAssetIdentity.locator("[data-project-asset-meta]")).toContainText("#");
      await expect(page.locator("h1", { hasText: "원본 갤러리" })).toHaveClass(/sr-only/);
      await expect(page.locator("main[data-app-theme='light']")).toBeVisible();
      await expect(page.locator("[data-photographer-sidebar]")).toHaveAttribute("data-sidebar-theme", "light");
      const originalMedia = page.locator("[data-original-photo-media]").first();
      await expect(originalMedia).toBeVisible();
      const originalMediaBox = await originalMedia.boundingBox();
      expect(originalMediaBox).not.toBeNull();
      expect(originalMediaBox!.width / originalMediaBox!.height).toBeCloseTo(218.32 / 150.7, 1);
      const firstOriginalCardBox = await page.locator("[data-original-photo-card]").first().boundingBox();
      const firstOriginalRowBox = await page.locator("[data-original-photo-row]").first().boundingBox();
      expect(firstOriginalCardBox).not.toBeNull();
      expect(firstOriginalRowBox).not.toBeNull();
      expect(firstOriginalCardBox!.y + firstOriginalCardBox!.height).toBeLessThanOrEqual(
        firstOriginalRowBox!.y + firstOriginalRowBox!.height + 1,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator("[data-project-asset-identity]")).toBeHidden();
      const mobileAssetContext = page.locator("[data-project-asset-mobile-context]");
      await expect(mobileAssetContext).toHaveCount(0);
      await expect(page.locator("[data-project-asset-meta]")).toBeHidden();
      await expect(page.getByRole("navigation", { name: "현재 위치" })).toBeHidden();
      const mobileAssetTabs = page.locator("[data-project-asset-tabs]");
      const mobileAssetTabsBox = await mobileAssetTabs.boundingBox();
      expect(mobileAssetTabsBox).not.toBeNull();
      expect(mobileAssetTabsBox!.height).toBeLessThanOrEqual(45);
      const mobileActiveAssetTab = page.getByRole("tab", { name: /원본/ });
      await expect(mobileActiveAssetTab).toHaveCSS("border-top-width", "0px");
      await expect(mobileActiveAssetTab).toHaveCSS("border-top-left-radius", "6px");
      await expect(mobileActiveAssetTab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const mobileActiveAssetTabFace = mobileActiveAssetTab.locator("[data-project-asset-tab-face]");
      await expect(mobileActiveAssetTabFace).toHaveCSS("height", "36px");
      await expect(mobileActiveAssetTabFace).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(mobileActiveAssetTab).not.toHaveCSS("border-bottom-color", "rgb(255, 87, 18)");
      const activeTabMarker = await mobileActiveAssetTab.evaluate((element) =>
        getComputedStyle(element, "::after").content,
      );
      expect(activeTabMarker).toBe("none");
      await expect(mobileActiveAssetTab.locator("[data-project-asset-tab-count]")).toBeHidden();
      const mobileAssetActionBar = page.locator("[data-photographer-page-action-bar]");
      await expect(mobileAssetActionBar).toHaveCSS("position", "fixed");
      await expect(mobileAssetActionBar).toHaveCSS("bottom", "0px");
      await expect(mobileAssetActionBar.getByRole("button", { name: "알림톡 보내기" })).toBeHidden();
      const mobileInviteButton = mobileAssetActionBar.getByRole("button", { name: "초대 링크 복사" });
      const mobileInviteButtonBox = await mobileInviteButton.boundingBox();
      const mobileAssetActionBarBox = await mobileAssetActionBar.boundingBox();
      expect(mobileInviteButtonBox).not.toBeNull();
      expect(mobileAssetActionBarBox).not.toBeNull();
      expect(mobileInviteButtonBox!.width).toBeGreaterThan(mobileAssetActionBarBox!.width - 40);
      await expect(page.getByRole("note")).toHaveCount(0);
      const mobileOriginalToolbar = page.getByLabel("원본 갤러리 도구");
      await expect(mobileOriginalToolbar).toHaveCSS("height", "44px");
      const mobileOriginalToolbarBox = await mobileOriginalToolbar.boundingBox();
      expect(mobileOriginalToolbarBox).not.toBeNull();
      expect(mobileOriginalToolbarBox!.height).toBeCloseTo(44, 0);
      await expect(mobileOriginalToolbar).toHaveCSS("border-left-width", "0px");
      await expect(mobileOriginalToolbar).toHaveCSS("border-top-width", "0px");
      await expect(mobileOriginalToolbar).toHaveCSS("border-bottom-width", "1px");
      await expect(mobileAssetTabs).toHaveCSS("background-color", "rgb(245, 248, 248)");
      await expect(mobileOriginalToolbar).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(mobileOriginalToolbar).toHaveCSS("padding-left", "12px");
      const mobilePageFrameBox = await page.locator("[data-photographer-viewport-page]").boundingBox();
      expect(mobilePageFrameBox).not.toBeNull();
      expect(mobileOriginalToolbarBox!.x).toBeCloseTo(mobilePageFrameBox!.x, 0);
      expect(mobileOriginalToolbarBox!.width).toBeCloseTo(mobilePageFrameBox!.width, 0);
      await expect(page.getByLabel("파일명 검색")).toBeHidden();
      const mobileSimilarityControl = mobileOriginalToolbar.locator("[data-similarity-control]");
      await expect(mobileOriginalToolbar.locator("[data-desktop-similarity-control]")).toBeHidden();
      await expect(mobileOriginalToolbar.locator("[data-similarity-control]:visible, [data-desktop-similarity-control]:visible")).toHaveCount(1);
      await expect(mobileSimilarityControl).toHaveText("유사컷1");
      await expect(mobileSimilarityControl).toHaveAttribute("aria-label", "유사컷 1개 그룹 묶기 해제");
      await expect(mobileSimilarityControl).toHaveAttribute("aria-pressed", "true");
      await expect(mobileSimilarityControl).toHaveCSS("height", "30px");
      await expect(mobileSimilarityControl).toHaveCSS("border-top-width", "1px");
      await expect(mobileSimilarityControl).toHaveCSS("border-top-color", "rgb(255, 87, 18)");
      await expect(mobileSimilarityControl).not.toContainText("ON");
      await expect(mobileSimilarityControl).not.toContainText("OFF");
      await mobileSimilarityControl.click();
      await expect(mobileSimilarityControl).toHaveAttribute("aria-label", "유사컷 1개 그룹 묶어보기");
      await expect(mobileSimilarityControl).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByRole("status")).toContainText("모든 사진을 표시합니다");
      await mobileSimilarityControl.click();
      await expect(mobileSimilarityControl).toHaveAttribute("aria-label", "유사컷 1개 그룹 묶기 해제");
      const mobileToolsTrigger = mobileOriginalToolbar.getByRole("button", { name: "검색 및 정렬 설정" });
      const mobileViewTrigger = mobileOriginalToolbar.getByRole("button", { name: "목록으로 보기" });
      const mobileToolsTriggerBox = await mobileToolsTrigger.boundingBox();
      const mobileSimilarityControlBox = await mobileSimilarityControl.boundingBox();
      expect(mobileToolsTriggerBox).not.toBeNull();
      expect(mobileToolsTriggerBox!.width).toBeCloseTo(44, 0);
      expect(mobileToolsTriggerBox!.height).toBeCloseTo(44, 0);
      expect(mobileSimilarityControlBox).not.toBeNull();
      expect(mobileSimilarityControlBox!.x).toBeLessThan(mobileToolsTriggerBox!.x);
      await mobileViewTrigger.click();
      await mobileOriginalToolbar.getByRole("button", { name: "갤러리로 보기" }).click();
      await mobileToolsTrigger.click();
      const mobileToolsSheet = page.getByRole("dialog", { name: "사진 찾기" });
      await expect(mobileToolsSheet).toBeVisible();
      await expect(mobileToolsSheet.getByRole("searchbox", { name: "파일명 검색" })).toBeVisible();
      await mobileToolsSheet.getByRole("button", { name: "파일명 역순" }).click();
      await expect(mobileToolsSheet.getByRole("button", { name: "파일명 역순" })).toHaveAttribute("aria-pressed", "true");
      await expect(mobileToolsSheet.getByRole("group", { name: "사진 보기 방식" })).toHaveCount(0);
      await expect(page.locator("[data-mobile-tool-count]")).toHaveText("1");
      await mobileToolsSheet.getByRole("button", { name: "초기화" }).click();
      await expect(page.locator("[data-mobile-tool-count]")).toHaveCount(0);
      await mobileToolsSheet.getByRole("button", { name: "완료", exact: true }).click();
      await expect(mobileToolsSheet).toHaveCount(0);
      const mobileAssetScroll = page.locator("[data-project-asset-scroll]");
      await mobileAssetScroll.evaluate((element) => {
        element.style.paddingBottom = "1000px";
        element.scrollTop = 180;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      const mobileHeader = page.locator(".photographer-mobile-header");
      await expect(mobileHeader).toHaveCSS("border-bottom-width", "0px");
      await expect(mobileHeader).toHaveAttribute("data-asset-immersive", "true");
      await expect(mobileHeader).toHaveAttribute("data-project-context-visible", "true");
      await expect(mobileHeader).toHaveCSS("height", "48px");
      await expect(mobileHeader.locator("[data-mobile-project-header-context]")).toContainText(
        "[E2E] 테스트 프로젝트",
      );
      await expect(mobileHeader.locator("[data-mobile-project-header-context]")).not.toContainText(
        "E2E 테스트 고객 고객",
      );
      await expect(mobileHeader.locator("[data-mobile-project-header-context]")).not.toContainText(/#[A-Z0-9-]+/);
      await expect(mobileHeader.locator("[data-mobile-project-header-context] span")).toHaveCount(1);
      await expect(mobileHeader.locator("[data-mobile-project-header-context] span").first()).toHaveCSS("font-size", "15px");
      await expect(mobileHeader.getByText("A-CUT.", { exact: true })).toBeHidden();
      await expect(mobileHeader.getByRole("link", { name: "설정" })).toHaveCount(0);
      await expect(page.locator("[data-project-asset-identity]")).toHaveCSS("max-height", "0px");
      await expect(mobileOriginalToolbar).toHaveAttribute("data-mobile-hidden", "true");
      await expect(mobileOriginalToolbar).toHaveCSS("height", "0px");
      await expect(mobileAssetTabs).toBeVisible();
      await page.waitForTimeout(250);
      const immersiveTabsBox = await mobileAssetTabs.boundingBox();
      const immersiveScrollBox = await mobileAssetScroll.boundingBox();
      expect(immersiveTabsBox).not.toBeNull();
      expect(immersiveScrollBox).not.toBeNull();
      expect(immersiveTabsBox!.y).toBeGreaterThanOrEqual(8);
      expect(immersiveScrollBox!.y - (immersiveTabsBox!.y + immersiveTabsBox!.height)).toBeGreaterThanOrEqual(11);
      await mobileAssetScroll.evaluate((element) => {
        element.scrollTop = 140;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(mobileHeader).toHaveAttribute("data-asset-immersive", "false");
      await expect(mobileOriginalToolbar).toHaveAttribute("data-mobile-hidden", "false");
      await mobileAssetScroll.evaluate((element) => {
        element.scrollTop = 0;
        element.style.paddingBottom = "";
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      const firstMobileOriginalRow = page.locator("[data-original-photo-row]").first();
      await expect(firstMobileOriginalRow.locator(":scope > [data-original-photo-card]")).toHaveCount(3);
      await expect(firstMobileOriginalRow).toHaveCSS("column-gap", "6px");
      const firstMobileFilenameRow = firstMobileOriginalRow.locator("[data-original-photo-filename-row]").first();
      const firstMobileMedia = firstMobileOriginalRow.locator("[data-original-photo-media]").first();
      await expect(firstMobileFilenameRow).toBeVisible();
      await expect(firstMobileFilenameRow).not.toHaveText("");
      await expect(firstMobileFilenameRow).toHaveCSS("height", "18px");
      await expect(firstMobileOriginalRow.locator("[data-original-photo-card]").first()).toHaveCSS("padding-left", "2px");
      const firstMobileFilenameBox = await firstMobileFilenameRow.boundingBox();
      const firstMobileMediaBox = await firstMobileMedia.boundingBox();
      expect(firstMobileFilenameBox).not.toBeNull();
      expect(firstMobileMediaBox).not.toBeNull();
      expect(firstMobileMediaBox!.width / firstMobileMediaBox!.height).toBeCloseTo(1, 1);
      expect(firstMobileFilenameBox!.y + firstMobileFilenameBox!.height).toBeLessThanOrEqual(firstMobileMediaBox!.y);
      await page.setViewportSize({ width: 1792, height: 1000 });
      await expect(originalMedia).toBeVisible();
      await expect(page.getByRole("tab", { name: /원본/ }).locator("[data-project-asset-tab-count]")).toBeVisible();
      await expect(mobileAssetActionBar).toHaveCSS("position", "sticky");
      await originalMedia.getByRole("button", { name: /상세 보기/ }).click();
      const originalViewer = page.locator("[data-original-photo-viewer]");
      await expect(originalViewer).toBeVisible();
      await expect(originalViewer).toHaveCSS("position", "fixed");
      await expect(originalViewer).toHaveCSS("z-index", "100000");
      const representativeAction = originalViewer.locator("[data-representative-action]");
      const viewerShortcutButton = originalViewer.getByRole("button", { name: "사진 뷰어 단축키" });
      await expect(viewerShortcutButton).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(viewerShortcutButton).toBeHidden();
      await expect(representativeAction).toBeVisible();
      await expect(representativeAction).toHaveCSS("height", "32px");
      await page.setViewportSize({ width: 1792, height: 1000 });
      await expect(viewerShortcutButton).toBeVisible();
      await expect(originalViewer.locator("[data-original-photo-filmstrip]")).toBeVisible();
      await expect(originalViewer.getByRole("button", { name: "전체 사진" })).toBeVisible();
      await expect(originalViewer.getByText("유사컷 3장", { exact: true })).toBeVisible();
      await expect(representativeAction).toBeDisabled();
      await expect(representativeAction).toContainText("대표컷");
      await originalViewer.locator("[data-original-photo-filmstrip] > button").nth(1).click();
      await expect(representativeAction).toBeEnabled();
      await expect(representativeAction).toContainText("대표컷 지정");
      await representativeAction.click();
      await expect(representativeAction).toBeDisabled();
      await expect(representativeAction).toContainText("대표컷");
      await expect(page.getByRole("status")).toContainText("대표컷을 변경했습니다.");
      await page.keyboard.press("g");
      await expect(originalViewer.getByRole("button", { name: "전체 사진" })).toHaveCount(0);
      await page.keyboard.press("g");
      await expect(originalViewer.getByRole("button", { name: "전체 사진" })).toBeVisible();
      const viewerBox = await originalViewer.boundingBox();
      expect(viewerBox).not.toBeNull();
      expect(viewerBox!.x).toBeCloseTo(0, 0);
      expect(viewerBox!.y).toBeCloseTo(0, 0);
      expect(viewerBox!.width).toBeCloseTo(1792, 0);
      expect(viewerBox!.height).toBeCloseTo(1000, 0);
      await page.getByRole("button", { name: "사진 상세 보기 닫기" }).click();
      await expect(originalViewer).toHaveCount(0);
      await page.getByRole("button", { name: "사이드바 접기" }).click();
      await expect(page.locator("[data-original-photo-row]").first().locator(":scope > [data-original-photo-card]")).toHaveCount(7);
      await page.getByRole("button", { name: "목록 보기" }).click();
      const originalList = page.locator("[data-original-photo-list]");
      await expect(originalList).toBeVisible();
      await expect(originalList.getByRole("columnheader")).toHaveCount(3);
      const firstListRow = originalList.locator("[data-original-photo-list-row]").first();
      await expect(firstListRow).toBeVisible();
      const listHeaders = originalList.getByRole("columnheader");
      const listCells = firstListRow.getByRole("cell");
      const capacityHeaderBox = await listHeaders.nth(1).boundingBox();
      const resolutionHeaderBox = await listHeaders.nth(2).boundingBox();
      const capacityCellBox = await listCells.nth(1).boundingBox();
      const resolutionCellBox = await listCells.nth(2).boundingBox();
      expect(capacityHeaderBox).not.toBeNull();
      expect(resolutionHeaderBox).not.toBeNull();
      expect(capacityCellBox).not.toBeNull();
      expect(resolutionCellBox).not.toBeNull();
      expect(capacityHeaderBox!.x + capacityHeaderBox!.width).toBeCloseTo(capacityCellBox!.x + capacityCellBox!.width, 0);
      expect(resolutionHeaderBox!.x + resolutionHeaderBox!.width).toBeCloseTo(resolutionCellBox!.x + resolutionCellBox!.width, 0);
      const originalListBox = await originalList.boundingBox();
      const firstListRowBox = await firstListRow.boundingBox();
      expect(originalListBox).not.toBeNull();
      expect(firstListRowBox).not.toBeNull();
      expect(firstListRowBox!.x).toBeGreaterThanOrEqual(originalListBox!.x);
      expect(firstListRowBox!.x + firstListRowBox!.width).toBeLessThanOrEqual(originalListBox!.x + originalListBox!.width + 1);
      const firstListThumbnail = firstListRow.locator("[data-original-photo-list-thumbnail]");
      await expect(firstListThumbnail).toHaveCSS("position", "relative");
      const firstListThumbnailBox = await firstListThumbnail.boundingBox();
      const firstListImageBox = await firstListThumbnail.locator("img").boundingBox();
      expect(firstListThumbnailBox).not.toBeNull();
      expect(firstListImageBox).not.toBeNull();
      expect(firstListThumbnailBox!.width).toBeCloseTo(52, 0);
      expect(firstListThumbnailBox!.height).toBeCloseTo(36, 0);
      expect(firstListImageBox!.x).toBeCloseTo(firstListThumbnailBox!.x, 0);
      expect(firstListImageBox!.y).toBeCloseTo(firstListThumbnailBox!.y, 0);
      expect(firstListImageBox!.width).toBeCloseTo(firstListThumbnailBox!.width, 0);
      expect(firstListImageBox!.height).toBeCloseTo(firstListThumbnailBox!.height, 0);

      const confirmSelectionResponse = await page.request.post("/api/auth/test-setup", {
        data: { action: "set_project_status", projectId: selectingProject.projectId, status: "confirmed" },
      });
      expect(confirmSelectionResponse.ok(), await confirmSelectionResponse.text()).toBe(true);
      await page.reload();
      await page.getByRole("tab", { name: /셀렉/ }).click();
      await expect(page).toHaveURL(
        new RegExp(`/photographer/projects/${selectingProject.projectId}/assets/selected`),
      );
      await expect(page.getByRole("tab", { name: /셀렉/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: "셀렉 결과" })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileSelectedToolbar = page.getByRole("region", { name: "셀렉 결과 도구" });
      await expect(mobileSelectedToolbar).toBeVisible();
      await expect(mobileSelectedToolbar).toHaveCSS("height", "44px");
      const mobileSelectedToolbarBox = await mobileSelectedToolbar.boundingBox();
      expect(mobileSelectedToolbarBox).not.toBeNull();
      expect(mobileSelectedToolbarBox!.height).toBeLessThanOrEqual(49);
      await expect(mobileSelectedToolbar.getByText("셀렉 사진", { exact: true })).toBeHidden();
      await expect(mobileSelectedToolbar.getByLabel("파일명 검색")).toBeHidden();
      const mobileSelectionGrid = page.locator("[data-photo-gallery-variant='selection']");
      await expect(mobileSelectionGrid).toHaveCSS("padding-top", "10px");
      const mobileSelectionRow = mobileSelectionGrid.locator("[data-original-photo-row]").first();
      await expect(mobileSelectionRow).toHaveCSS("column-gap", "6px");
      const mobileSelectionFilename = mobileSelectionRow.locator("[data-original-photo-card]").first().locator("[class*='selectionFilename']");
      await expect(mobileSelectionFilename).toHaveCSS("font-size", "12px");
      await expect(mobileSelectionFilename).toHaveCSS("font-weight", "500");
      const selectedExportTrigger = mobileSelectedToolbar.getByRole("button", { name: "셀렉 결과 내보내기" });
      const selectedToolsTrigger = mobileSelectedToolbar.getByRole("button", { name: "검색 및 정렬 설정" });
      const selectedToolbarBox = await mobileSelectedToolbar.boundingBox();
      const selectedExportBox = await selectedExportTrigger.boundingBox();
      const selectedToolsBox = await selectedToolsTrigger.boundingBox();
      expect(selectedToolbarBox).not.toBeNull();
      expect(selectedExportBox).not.toBeNull();
      expect(selectedToolsBox).not.toBeNull();
      expect(selectedExportBox!.x + selectedExportBox!.width).toBeLessThanOrEqual(selectedToolsBox!.x);
      await expect(mobileSelectedToolbar.locator("[data-mobile-export-hint]")).toHaveCount(0);
      await selectedToolsTrigger.click();
      const selectedToolsSheet = page.getByRole("dialog", { name: "셀렉 사진 찾기" });
      await expect(selectedToolsSheet.getByRole("button", { name: "코멘트 우선" })).toBeVisible();
      await selectedToolsSheet.getByRole("button", { name: "코멘트 우선" }).click();
      await selectedToolsSheet.getByRole("button", { name: "완료", exact: true }).click();
      const sortedSelectionRows = mobileSelectionGrid.locator("[data-original-photo-row]");
      await expect(sortedSelectionRows.first().getByText(sortedComment, { exact: true })).toBeVisible();
      const sortedFirstRowBox = await sortedSelectionRows.nth(0).boundingBox();
      const sortedSecondRowBox = await sortedSelectionRows.nth(1).boundingBox();
      expect(sortedFirstRowBox).not.toBeNull();
      expect(sortedSecondRowBox).not.toBeNull();
      expect(sortedFirstRowBox!.height - sortedSecondRowBox!.height).toBeGreaterThanOrEqual(28);
      expect(sortedFirstRowBox!.height - sortedSecondRowBox!.height).toBeLessThanOrEqual(36);
      expect(sortedSecondRowBox!.y - (sortedFirstRowBox!.y + sortedFirstRowBox!.height)).toBeLessThanOrEqual(1);
      await selectedExportTrigger.click();
      const selectedExportSheet = page.getByRole("dialog", { name: "셀렉 결과 내보내기" });
      await expect(selectedExportSheet.getByRole("button", { name: "파일명 복사" })).toBeVisible();
      await expect(selectedExportSheet.getByRole("button", { name: /셀렉 원본 다운로드|셀렉 프리뷰 다운로드/ })).toBeVisible();
      await selectedExportSheet.getByRole("button", { name: "닫기" }).click();
    } finally {
      await deleteTestProject(page, selectingProject.projectId);
    }
  });

  test("P11: 모바일 원본 업로드는 3열 정사각 갤러리와 축소 헤더를 사용한다", async ({ page }) => {
    const preparingProject = await createFullProject(page, 18);
    try {
      const statusResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "set_project_status",
          projectId: preparingProject.projectId,
          status: "preparing",
        },
      });
      expect(statusResponse.ok()).toBe(true);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/photographer/projects/${preparingProject.projectId}/upload`);
      await expect(page.getByRole("heading", { name: "원본 업로드" })).toBeVisible({ timeout: 8000 });

      const uploadRows = page.locator("[data-original-photo-row]");
      await expect(uploadRows.nth(1).locator(":scope > [data-original-photo-card]")).toHaveCount(3);
      await expect(uploadRows.nth(1)).toHaveCSS("column-gap", "6px");
      await expect(uploadRows.nth(1).locator("[data-original-photo-card]").first()).toHaveCSS("padding-left", "2px");
      const uploadMediaBox = await uploadRows.nth(1).locator("[data-original-photo-media]").first().boundingBox();
      expect(uploadMediaBox).not.toBeNull();
      expect(uploadMediaBox!.width / uploadMediaBox!.height).toBeCloseTo(1, 1);
      await expect(uploadRows.nth(1).locator("[data-photo-thumbnail-frame]").first()).toHaveCSS("border-top-width", "0px");

      const selectionRequestButton = page.getByRole("button", { name: /셀렉 요청하기/ });
      await expect(selectionRequestButton).toBeEnabled();
      await selectionRequestButton.click();
      const mobileSelectionRequestDialog = page.locator("[data-modal-variant='workflow']");
      await expect(mobileSelectionRequestDialog).toBeVisible();
      await expect(mobileSelectionRequestDialog.getByText("셀렉 요청", { exact: true })).toBeVisible();
      await expect(mobileSelectionRequestDialog.locator("[data-mobile-selection-summary]")).toBeVisible();
      await expect(mobileSelectionRequestDialog.getByText("고객 접속 정보", { exact: true })).toBeHidden();
      await expect(mobileSelectionRequestDialog.getByRole("button", { name: "3일 후" })).toBeHidden();
      await expect(mobileSelectionRequestDialog.getByRole("button", { name: "7일 후" })).toBeHidden();
      await expect(mobileSelectionRequestDialog.getByRole("button", { name: "15일 후" })).toBeHidden();
      await expect(mobileSelectionRequestDialog.getByText("요청 후 사진 구성을 변경할 수 없음을 확인했어요", { exact: true })).toBeVisible();
      await expect(mobileSelectionRequestDialog.getByRole("button", { name: "취소", exact: true })).toBeHidden();
      await expect(mobileSelectionRequestDialog.getByRole("button", { name: /장 셀렉 요청하기/ })).toBeVisible();
      const selectionRequestGeometry = await mobileSelectionRequestDialog.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        contentClientWidth: element.querySelector<HTMLElement>("[data-selection-request-content]")?.clientWidth ?? 0,
        contentScrollWidth: element.querySelector<HTMLElement>("[data-selection-request-content]")?.scrollWidth ?? 0,
      }));
      expect(selectionRequestGeometry.scrollWidth).toBeLessThanOrEqual(selectionRequestGeometry.clientWidth);
      expect(selectionRequestGeometry.contentScrollWidth).toBeLessThanOrEqual(selectionRequestGeometry.contentClientWidth);
      await page.setViewportSize({ width: 320, height: 720 });
      const mobileDeadlineField = mobileSelectionRequestDialog.locator("[data-mobile-deadline-field]");
      await expect(mobileDeadlineField).toBeVisible();
      await expect(mobileDeadlineField).toContainText(/^\d{4}\.\d{2}\.\d{2}$/);
      await expect(mobileDeadlineField).toHaveCSS("padding-left", "12px");
      await expect(mobileDeadlineField.locator("svg")).toBeVisible();
      const narrowDeadlineGeometry = await mobileDeadlineField.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(narrowDeadlineGeometry.clientWidth).toBeGreaterThanOrEqual(250);
      expect(narrowDeadlineGeometry.scrollWidth).toBeLessThanOrEqual(narrowDeadlineGeometry.clientWidth);
      await mobileSelectionRequestDialog.getByRole("button", { name: "닫기" }).click();
      await page.setViewportSize({ width: 390, height: 844 });

      const longPressTarget = uploadRows.nth(1).locator("[data-original-photo-media] > button").first();
      await longPressTarget.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, clientX: 120, clientY: 320 });
      await page.waitForTimeout(500);
      await longPressTarget.dispatchEvent("pointerup", { pointerType: "touch", button: 0, clientX: 120, clientY: 320 });
      const mobileManageHeader = page.locator("[data-mobile-photo-manage-mode]");
      await expect(mobileManageHeader).toContainText("사진 선택");
      await expect(mobileManageHeader.getByLabel("1장 선택됨")).toBeVisible();
      const selectedCheckbox = page.locator("[data-mobile-selection-checkbox]").first();
      await expect(selectedCheckbox).toBeVisible();
      await expect(selectedCheckbox).toHaveCSS("width", "44px");
      await expect(selectedCheckbox).toHaveCSS("height", "44px");
      const selectedCheckboxFace = selectedCheckbox.locator("span");
      expect((await selectedCheckboxFace.boundingBox())!.width).toBeLessThanOrEqual(24);
      const selectedActionsMenu = page.locator('summary[aria-label="선택 사진 작업 더보기"]');
      await selectedActionsMenu.click();
      await expect(page.getByRole("menuitem", { name: "사진 1장 삭제" })).toBeVisible();
      await expect(page.getByRole("button", { name: "취소", exact: true })).toHaveCount(1);
      const selectedPhotoButton = page.locator("[data-original-photo-media] > button[aria-pressed='true']").first();
      const selectedInsetBorder = selectedPhotoButton.locator("..").locator("[data-photo-thumbnail-selection-ring]");
      await expect(selectedInsetBorder).toBeVisible();
      await expect(selectedInsetBorder).toHaveCSS("box-shadow", /2px inset/);
      await page.getByRole("menuitem", { name: "사진 1장 삭제" }).click();
      const selectedDeleteDialog = page.getByRole("dialog").last();
      await expect(selectedDeleteDialog).toBeVisible();
      await expect(selectedDeleteDialog).toContainText("원본 1장을 삭제할까요?");
      await expect(selectedDeleteDialog.getByText("삭제한 원본은 복구할 수 없어요.", { exact: true })).toBeVisible();
      await expect(selectedDeleteDialog.getByRole("button", { name: "원본 삭제" })).toBeVisible();
      await selectedDeleteDialog.getByRole("button", { name: "취소", exact: true }).click();
      await selectedPhotoButton.click();
      await expect(mobileManageHeader.getByLabel("0장 선택됨")).toBeVisible();
      await expect(selectedActionsMenu).toHaveAttribute("aria-disabled", "true");
      await page.getByRole("button", { name: "취소", exact: true }).first().click();
      await expect(page.locator("[data-mobile-photo-manage-mode]")).toHaveCount(0);

      await expect(page.getByRole("button", { name: "전체삭제" })).toHaveCount(0);
      await expect(page.getByLabel("사진 관리 메뉴")).toHaveCount(0);

      const uploadScrollBeforeHeaderTest = page.locator(".prj-photo-scroll-mobile-pad");
      await uploadScrollBeforeHeaderTest.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await page.waitForTimeout(100);
      const lastVisibleCard = page.locator("[data-original-photo-card]").last();
      const lastCardBox = await lastVisibleCard.boundingBox();
      const scrollViewportBox = await uploadScrollBeforeHeaderTest.boundingBox();
      expect(lastCardBox).not.toBeNull();
      expect(scrollViewportBox).not.toBeNull();
      expect(lastCardBox!.y + lastCardBox!.height).toBeLessThanOrEqual(scrollViewportBox!.y + scrollViewportBox!.height + 1);
      await uploadScrollBeforeHeaderTest.evaluate((element) => {
        element.scrollTop = 0;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await page.waitForTimeout(260);

      const uploadHeader = page.locator("[data-upload-header-mode]");
      await expect(uploadHeader).toHaveAttribute("data-upload-header-mode", "expanded");
      const uploadScroll = page.locator(".prj-photo-scroll-mobile-pad");
      await uploadScroll.evaluate((element) => {
        element.scrollTop = 160;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(uploadHeader).toHaveAttribute("data-upload-header-mode", "immersive");
      await expect(page.getByRole("navigation", { name: "현재 위치" })).toBeHidden();
      await uploadScroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      const settledHeaderModes = await uploadHeader.evaluate((element) => new Promise<string[]>((resolve) => {
        const modes = [element.getAttribute("data-upload-header-mode") ?? ""];
        const observer = new MutationObserver(() => {
          modes.push(element.getAttribute("data-upload-header-mode") ?? "");
        });
        observer.observe(element, { attributes: true, attributeFilter: ["data-upload-header-mode"] });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(modes);
        }, 500);
      }));
      expect(settledHeaderModes).toEqual(["immersive"]);
      await uploadScroll.evaluate((element) => {
        element.scrollTop = 64;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(uploadHeader).toHaveAttribute("data-upload-header-mode", "compact");
      await page.waitForTimeout(50);
      const transitioningActionBarBox = await page.locator("[data-photographer-page-action-bar]").boundingBox();
      expect(transitioningActionBarBox).not.toBeNull();
      expect(transitioningActionBarBox!.y + transitioningActionBarBox!.height).toBeCloseTo(844, 0);
      await uploadScroll.evaluate((element) => {
        element.scrollTop = 0;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(uploadHeader).toHaveAttribute("data-upload-header-mode", "expanded");

      const mobileShell = page.locator("main[data-app-theme='light']");
      await expect(mobileShell).toHaveCSS("padding-bottom", "0px");
      const mobileActionBar = page.locator("[data-photographer-page-action-bar]");
      await expect(mobileActionBar).toHaveCSS("touch-action", "pan-x");
      await expect(mobileActionBar).toHaveCSS("overscroll-behavior-y", "none");
      await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
      await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
      const actionBarBox = await mobileActionBar.boundingBox();
      expect(actionBarBox).not.toBeNull();
      expect(actionBarBox!.y + actionBarBox!.height).toBeCloseTo(844, 0);
      const documentGeometry = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
      }));
      expect(documentGeometry.scrollHeight).toBeLessThanOrEqual(documentGeometry.viewportHeight + 1);
      expect(documentGeometry.scrollY).toBe(0);
    } finally {
      await deleteTestProject(page, preparingProject.projectId);
    }
  });

  test("P11-A: 고객 진입 대표 설정은 사진 선택만 제공한다", async ({ page }) => {
    const preparingProject = await createFullProject(page, 1);
    try {
      const statusResponse = await page.request.post("/api/auth/test-setup", {
        data: { action: "set_project_status", projectId: preparingProject.projectId, status: "preparing" },
      });
      expect(statusResponse.ok()).toBe(true);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/photographer/projects/${preparingProject.projectId}/upload`);
      const photoButton = page.locator("[data-original-photo-media] > button").first();
      await expect(photoButton).toBeVisible({ timeout: 8000 });
      await photoButton.click();

      const viewer = page.locator("[data-original-photo-viewer]");
      await expect(viewer.getByText("고객 진입 대표", { exact: true })).toBeVisible();
      await expect(viewer.getByRole("slider", { name: "대표 사진 세로 초점" })).toHaveCount(0);
      const coverButton = viewer.getByRole("button", { name: /대표 사진/ });
      await expect(coverButton).toBeVisible();
      await coverButton.click();
      await expect(coverButton).toBeDisabled();
      await expect(coverButton).toContainText("대표 사진");
    } finally {
      await deleteTestProject(page, preparingProject.projectId);
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
