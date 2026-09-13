import { test, expect } from "@playwright/test";
import {
  setupFullProject,
  deleteTestProject,
  mockCustomerThumbPresigning,
  type TestProject,
} from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5); // 사진 5장 + selecting 상태
  const groupResponse = await page.request.post("/api/auth/test-setup", {
    data: {
      action: "seed_photo_group",
      projectId: project.projectId,
      photoIds: project.photoIds!.slice(0, 3),
    },
  });
  expect(groupResponse.ok()).toBe(true);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 — 갤러리 (사진 선택)", () => {
  async function openGallery(page: import("@playwright/test").Page) {
    await mockCustomerThumbPresigning(page);
    await page.goto(project.galleryUrl);
    await page.waitForLoadState("networkidle");
  }

  test("S1: 갤러리 로드 → 사진 목록 표시", async ({ page }) => {
    await openGallery(page);
    await expect(page).toHaveURL(/\/gallery/);
    // 초기 가시 범위는 성능 최적화에 따라 eager일 수 있으므로 loading 속성에 의존하지 않는다.
    const photos = page.getByRole("img", { name: /E2E_TEST_/ });
    await expect(photos.first()).toBeVisible({ timeout: 10_000 });
    expect(await photos.count()).toBeGreaterThan(0);
  });

  test("R1: 보조 필터와 모바일 너비가 사진 선택을 방해하지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGallery(page);
    for (const color of ["red", "yellow", "green", "blue", "purple"]) {
      const response = await page.request.post("/api/c/selections", { data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: project.photoIds![0],
        color_op: { color, add: true },
      } });
      expect(response.ok()).toBe(true);
    }
    await page.reload();
    await expect(page.getByRole("textbox", { name: "파일명으로 필터링" })).toBeVisible();
    await expect(page.getByRole("button", { name: "별점 5점 이상 필터" })).toBeVisible();
    await expect(page.locator(".gl-photo-card").first().getByRole("button", { name: /^별점 \d점$/ })).toHaveCount(5);
    const fourthStar = page.locator(".gl-photo-card").first().getByRole("button", { name: "별점 4점", exact: true });
    await fourthStar.click();
    await expect(fourthStar).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/gallery/);
    const desktopCard = (await page.locator(".gl-photo-card").first().boundingBox())!;
    expect(desktopCard.width).toBeGreaterThanOrEqual(180);
    expect(desktopCard.width).toBeLessThan(220);
    expect(desktopCard.width / desktopCard.height).toBeCloseTo(1, 1);
    await expect(page.locator(".gl-photo-card").first()).toHaveCSS("border-radius", "4px");
    await expect(page.locator(".gl-photo-card").first().locator(".gl-color-dot")).toHaveCount(5);
    const ratingBox = await page.locator(".gl-photo-card").first().locator(".gl-rating-row").boundingBox();
    const markerBox = await page.locator(".gl-photo-card").first().locator(".gl-marker-row").boundingBox();
    expect(ratingBox!.x + ratingBox!.width).toBeLessThanOrEqual(markerBox!.x);
    await page.screenshot({ path: "test-results/gallery-desktop-redesign.png" });
    for (const width of [1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      await expect(page.getByRole("img", { name: /E2E_TEST_/ }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/gallery-mobile-${width}-redesign.png` });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const firstCard = page.locator(".gl-photo-card").first();
    for (const columns of [2, 3]) {
      await page.getByRole("button", { name: `현재 ${columns}열, 누르면 ${columns + 1}열로 변경` }).click();
      await expect(firstCard.locator(".gl-rating-summary")).toBeVisible();
      await expect(firstCard.locator(".gl-rating-summary")).toHaveText("4");
      await expect(firstCard.locator(".gl-rating-row")).toBeHidden();
      await page.screenshot({ path: `test-results/gallery-mobile-${columns + 1}cols.png` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(firstCard.locator(".gl-rating-row")).toBeVisible();
    await expect(firstCard.locator(".gl-rating-summary")).toBeHidden();
  });

  test("R2: 보정본 상태 구분과 미검토 이동을 샘플 응답으로 확인한다", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.request.post("/api/auth/test-setup", { data: { action: "set_project_status", projectId: project.projectId, status: "reviewing_v1" } });
    // 테스트 전용 프로젝트의 읽기 응답만 바꾸며 실제 검토 데이터는 저장하지 않는다.
    await page.route("**/api/c/photos?*", async route => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ json: { ...data, project: { ...data.project, status: "reviewing_v1", maxRevisionCount: 2 } } });
    });
    const photos = ["0001", "0006", "0010"].map((number, index) => ({
      id: project.photoIds![index], photoVersionId: `sample-${index}`,
      originalFilename: `ACUT_${number}.jpg`, orderIndex: index,
      originalUrl: `/landing/sample-project/studio-v2/originals/ACUT_${number}.jpg`,
      versionUrl: `/landing/sample-project/studio-v2/retouched/ACUT_${number}.jpg`,
      versionThumbUrl: `/landing/sample-project/studio-v2/retouched/ACUT_${number}.jpg`,
    }));
    await page.route("**/api/c/review?*", route => route.fulfill({ json: { photos } }));
    await page.route("**/api/c/review/draft?*", route => route.fulfill({ json: { drafts: {
      [photos[0].id]: { status: "approved" },
      [photos[1].id]: { status: "revision_requested", comment: "배경을 조금 밝게 해주세요." },
    } } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/c/${project.accessToken}/review`);
    await expect(page.locator(".rgv-card")).toHaveCount(3);
    await expect(page.locator(".rgv-card").first()).toHaveCSS("border-radius", "4px");
    const reviewCard = (await page.locator(".rgv-card").first().boundingBox())!;
    expect(reviewCard.width).toBeGreaterThanOrEqual(180);
    expect(reviewCard.width).toBeLessThan(220);
    expect(reviewCard.width / reviewCard.height).toBeCloseTo(1, 1);
    await expect(page.locator(".rgv-card-pill")).toHaveText(["확정", "재보정 요청", "미검토"]);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/review-desktop-redesign.png" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("button", { name: "현재 2열, 3열로 변경" })).toBeVisible();
    await page.screenshot({ path: "test-results/review-mobile-redesign.png" });
    await page.getByRole("button", { name: "현재 2열, 3열로 변경" }).click();
    await expect(page.getByRole("button", { name: "현재 3열, 2열로 변경" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "미검토 사진 보기" }).click();
    await expect(page).toHaveURL(new RegExp(`/review/${photos[2].id}$`));
    await page.request.post("/api/auth/test-setup", { data: { action: "set_project_status", projectId: project.projectId, status: "selecting" } });
  });

  test("S1-1: 모바일 ACUT 홈 로고가 기본·축소 헤더에서 유지된다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openGallery(page);

    const homeLogo = page.getByRole("link", { name: "처음 화면으로" });
    await expect(homeLogo).toBeVisible();
    await expect(homeLogo).toHaveAttribute("href", `/c/${project.accessToken}`);
    await expect(page.getByRole("button", { name: "이전 화면" })).toHaveCount(0);

    const dDayBadge = page.locator(".gl-mobile-deadline .font-mono");
    await expect(dDayBadge).toBeVisible();
    const dDayText = (await dDayBadge.textContent()) ?? "";
    if (dDayText.startsWith("D+") || dDayText === "D-Day") {
      await expect(dDayBadge).toHaveClass(/text-danger/);
    } else if (/^D-[1-3]$/.test(dDayText)) {
      await expect(dDayBadge).toHaveClass(/text-warning/);
    } else {
      await expect(dDayBadge).toHaveClass(/text-subtle-foreground/);
    }

    await page.evaluate(() => window.scrollTo(0, 240));
    await expect(page.locator(".gl-mobile-header")).toHaveClass(/gl-mobile-header-compact/);
    await expect(homeLogo).toBeVisible();
  });

  test("S1-2: 모바일 그리드 버튼으로 2·3·4열을 순환한다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(({ densityKey }) => {
      sessionStorage.setItem(densityKey, "2");
    }, { densityKey: `ps:c-gallery-density:${project.accessToken}` });
    await openGallery(page);

    const commentResponse = await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: project.photoIds![0],
        comment: "코멘트 표시 확인",
      },
    });
    expect(commentResponse.ok()).toBe(true);
    const colorResponse = await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: project.photoIds![0],
        color_op: { color: "red", add: true },
      },
    });
    expect(colorResponse.ok()).toBe(true);
    await page.reload();

    const pageWrapper = page.locator(".gl-page-wrapper");
    const firstCard = page.locator(".gl-photo-card").first();
    const firstFrame = firstCard.locator("[data-photo-thumbnail-frame]");
    await expect(pageWrapper).toHaveClass(/gl-density-2/);
    await expect(page.getByText("두 손가락으로 사진 크기를 조절해 보세요")).toHaveCount(0);
    const commentIndicator = page.getByRole("img", { name: "코멘트 있음" });
    const colorDot = firstCard.locator(".gl-color-dot").first();
    await expect(commentIndicator).toBeVisible();
    await expect(colorDot).toBeVisible();
    const indicatorBox = await commentIndicator.boundingBox();
    const colorDotBox = await colorDot.boundingBox();
    expect(indicatorBox).not.toBeNull();
    expect(colorDotBox).not.toBeNull();
    expect(Math.abs(
      indicatorBox!.y + indicatorBox!.height / 2 - (colorDotBox!.y + colorDotBox!.height / 2),
    )).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "현재 2열, 누르면 3열로 변경" }).click();
    await expect(pageWrapper).toHaveClass(/gl-density-3/);
    await expect(page.getByRole("img", { name: "코멘트 있음" })).toBeHidden();
    await expect(firstCard).toHaveCSS("border-top-width", "0px");
    await expect(firstFrame).toHaveCSS("border-top-width", "0px");

    await page.getByRole("button", { name: "현재 3열, 누르면 4열로 변경" }).click();
    await expect(pageWrapper).toHaveClass(/gl-density-4/);
    await expect(firstCard).toHaveCSS("border-top-width", "0px");
    await expect(firstFrame).toHaveCSS("border-top-width", "0px");

    await page.getByRole("button", { name: "현재 4열, 누르면 2열로 변경" }).click();
    await expect(pageWrapper).toHaveClass(/gl-density-2/);
    await expect(page.getByRole("img", { name: "코멘트 있음" })).toBeVisible();
  });

  test("S1-3: 모바일 하단 선택 영역은 진행선과 48px CTA로 압축한다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openGallery(page);

    const footer = page.locator(".ac-confirm-footer-gallery");
    const footerInner = footer.locator(".ac-confirm-footer-inner");
    await expect(footerInner).toHaveCSS("height", "80px");
    await expect(footer.locator(".ac-confirm-footer-progress-label")).toBeHidden();
    await expect(footer.getByRole("progressbar")).toHaveCSS("height", "4px");
    await expect(footer.locator(".ac-confirm-footer-btn")).toHaveCSS("height", "48px");
    await expect(page.locator(".gl-page-wrapper")).toHaveCSS("padding-bottom", "92px");
  });

  test("S2: 사진 클릭 → 선택 카운트 증가", async ({ page }) => {
    await openGallery(page);
    const selectedButtons = page.getByRole("button", { name: "선택 해제", exact: true });
    const selectedBefore = await selectedButtons.count();
    const selectionButtons = page.getByRole("button", { name: "선택", exact: true });
    await expect(selectionButtons).not.toHaveCount(0);
    await selectionButtons.first().click();
    await expect(selectedButtons).toHaveCount(selectedBefore + 1);
  });

  test("S3: 사진 선택 후 재클릭 → 선택 해제", async ({ page }) => {
    await openGallery(page);
    const selectButton = page.getByRole("button", { name: "선택", exact: true }).first();
    await selectButton.click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "선택 해제", exact: true }).first().click();
    await page.waitForTimeout(400);
    // 선택 수가 0으로 돌아가야 함 → 확정 버튼 비활성
    const confirmBtn = page.getByRole("button", { name: /보정 의뢰|확정/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(confirmBtn).toBeDisabled();
    }
  });

  test("S4: 필터 탭 — '선택됨' 전환", async ({ page }) => {
    await openGallery(page);
    const selectedTab = page.getByRole("button", { name: "선택됨" });
    await expect(selectedTab).toBeVisible({ timeout: 5000 });
    await selectedTab.click();
    await page.waitForTimeout(300);
    const allTab = page.getByRole("button", { name: "전체 사진", exact: true });
    await allTab.click();
    await expect(page).toHaveURL(/\/gallery/);
  });

  test("S5: N장 선택 완료 → 확정 버튼으로 확인 모달 표시", async ({ page }) => {
    await openGallery(page);
    const selectionButtons = page.getByRole("button", { name: "선택", exact: true });
    const N = project.requiredCount ?? 3;
    const total = await selectionButtons.count();
    // N장 선택
    for (let i = 0; i < Math.min(N, total); i++) {
      // 선택한 버튼은 즉시 "선택 해제"로 이름이 바뀌므로, 매번 남은 첫 선택 버튼을 누른다.
      await selectionButtons.first().click();
      await page.waitForTimeout(500);
    }
    // 확정 버튼 활성화 및 확인 모달 표시 (SelectionConfirmFooter 고정 하단)
    const confirmBtn = page.getByRole("button", { name: "셀렉 확정하기" });
    await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
    await confirmBtn.click();

    const confirmDialog = page.getByRole("dialog", { name: "사진 셀렉을 확정할까요?" });
    await expect(confirmDialog).toBeVisible();
    await expect(page.locator(".selection-confirm-backdrop")).toHaveCSS("position", "fixed");
    await expect(page.locator(".selection-confirm-backdrop")).toHaveCSS("background-color", "rgba(0, 0, 0, 0.5)");

    await confirmDialog.getByRole("button", { name: "취소" }).click();
    await expect(confirmDialog).toBeHidden();
  });

  test("S6: 모바일 유사컷 보기 모드를 toolbar에서 켜고 끈다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => localStorage.removeItem("ps:c-gallery-similarity-hint:v1"));
    await openGallery(page);

    const similarityButton = page.getByRole("button", { name: "유사컷 1개 그룹 묶어보기" });
    await expect(similarityButton).toBeVisible();
    await expect(page.getByText("비슷한 사진을 묶어서 볼 수 있어요", { exact: true })).toBeVisible();

    await similarityButton.click();
    const activeSimilarityButton = page.getByRole("button", { name: "유사컷 1개 그룹 묶기 해제" });
    await expect(activeSimilarityButton).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/grouped=1/);
    await expect(page.getByRole("button", { name: /유사컷 .*펼치기/ })).toBeVisible();
    const expand = page.getByRole("button", { name: /유사컷 .*펼치기/ });
    expect((await expand.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expand.click();
    const expandedCards = page.locator(".gl-in-expanded-group");
    await expect(expandedCards.first()).toBeVisible();
    await expect(expandedCards.locator('[data-photo-thumbnail-frame][data-active="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /유사컷 .*접기/ }).first()).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: /유사컷 .*접기/ }).last().click();
    await expect(expandedCards).toHaveCount(0);


    await activeSimilarityButton.click();
    await expect(page).not.toHaveURL(/grouped=1/);
  });

  test("S7: 목표 장수 초과 선택 시 이유와 선택 사진 보기 경로를 안내한다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openGallery(page);

    const requiredCount = project.requiredCount ?? 3;
    let selectedCount = await page.getByRole("button", { name: "선택 해제", exact: true }).count();
    while (selectedCount < requiredCount) {
      await page.getByRole("button", { name: "선택", exact: true }).first().click();
      await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toHaveCount(selectedCount + 1);
      selectedCount += 1;
    }

    await page.getByRole("button", { name: "선택", exact: true }).first().click();
    const limitSnackbar = page.locator(".selection-limit-snackbar");
    await expect(page.getByText(`${requiredCount}장을 모두 선택했어요`, { exact: true })).toBeVisible();
    await expect(page.getByText("다른 사진을 선택하려면 기존 사진 1장을 해제해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toHaveCount(requiredCount);
    await expect(limitSnackbar).toHaveCSS("position", "fixed");
    await expect(limitSnackbar).toHaveCSS("background-color", "rgba(25, 25, 24, 0.96)");

    await page.getByRole("button", { name: "선택한 사진 보기", exact: true }).click();
    await expect(page).toHaveURL(/selected=selected/);
    await expect(page.getByRole("button", { name: new RegExp(`선택됨 ${requiredCount}장`) })).toBeVisible();
  });
});
