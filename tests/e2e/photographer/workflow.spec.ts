import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { deleteTestProject, createEditingProject, setProjectStatus, type TestProject } from "../../helpers/setup";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  project = await createEditingProject(page, 5);
  const photosResponse = await page.request.get(`/api/photographer/projects/${project.projectId}/photos`);
  const { photos } = await photosResponse.json() as { photos: Array<{ id: string }> };
  await page.request.post("/api/auth/test-setup", {
    data: { action: "seed_photo_version", projectId: project.projectId, photoIds: [photos[0].id] },
  });
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

  test("W-MOB: 모바일 보정본의 간결한 상단 도구와 하단 업로드 동선", async ({ browser }) => {
    // editing 상태 프로젝트 별도 생성 (selecting 상태에서는 업로드 패널 비활성)
    const helperPage = await browser.newPage();
    await loginAsPhotographer(helperPage);
    const editingProject = await createEditingProject(helperPage, 5);
    await helperPage.close();

    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await loginAsPhotographer(page);
    await page.goto(`/photographer/projects/${editingProject.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");

    // 첫 보정본이 없으면 일괄 업로드 패널이 자동으로 한 번 열린다.
    const uploadDialog = page.getByRole("dialog", { name: "보정본 업로드" });
    await expect(uploadDialog).toBeVisible({ timeout: 8000 });
    await expect(uploadDialog.locator("[data-upload-title-icon]")).toHaveClass(/text-accent/);

    await uploadDialog.locator('input[type="file"][multiple]').setInputFiles({
      name: "E2E_TEST_001.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("retouched-image"),
    });
    const selectionSummary = uploadDialog.locator("[data-upload-selection-summary]");
    await expect(selectionSummary).toBeVisible();
    expect(await selectionSummary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    const activeMappingRow = uploadDialog.locator('[data-pending-upload="true"]').first();
    await expect(activeMappingRow).toHaveClass(/border-transparent/);
    await expect(activeMappingRow.getByRole("button", { name: /선택한 보정본 삭제$/ })).toBeVisible();
    await expect(uploadDialog.getByText("순서", { exact: true })).toHaveCount(0);
    await expect(uploadDialog.getByRole("button", { name: "교체", exact: true })).toHaveCount(0);
    await expect(uploadDialog.getByRole("button", { name: "변경", exact: true })).toHaveCount(0);
    await expect(uploadDialog.locator("[data-mapping-state]").first()).toContainText("E2E_TEST_001.jpg");
    await expect(uploadDialog.getByRole("button", { name: "연결 해제" })).toHaveCount(0);
    await expect(uploadDialog.getByText("미매핑", { exact: true })).toHaveCount(0);
    await expect(uploadDialog.getByText("매핑 없음", { exact: true })).toHaveCount(0);
    const emptyMappingRow = uploadDialog.locator('[data-mapping-state="empty"]').first();
    await expect(emptyMappingRow).toHaveClass(/border-border-subtle/);
    await expect(emptyMappingRow.getByRole("button", { name: /보정본 파일 선택$/ })).toBeVisible();

    // 업로드 버튼이 viewport 안에 보여야 함 (모바일 하단 네비 뒤에 가리면 실패)
    const uploadBtn = uploadDialog.getByRole("button", { name: /^(?:업로드|\d+장 업로드)$/i });
    await expect(uploadBtn).toBeVisible({ timeout: 8000 });

    // 버튼 하단이 모바일 네비(60px) 위에 있어야 함
    const box = await uploadBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(667 - 8);

    // 업로드 전 로컬 파일도 행의 삭제 CTA로 업로드 대상에서 제거할 수 있다.
    await activeMappingRow.getByRole("button", { name: /선택한 보정본 삭제$/ }).click();
    await expect(uploadDialog.locator('[data-pending-upload="true"]')).toHaveCount(0);
    await expect(uploadBtn).toBeDisabled();

    await uploadDialog.getByRole("button", { name: "닫기" }).click();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "보정본 업로드" })).toHaveCount(0);

    const workflowAssetScroll = page.locator("[data-workflow-asset-scroll]");
    await workflowAssetScroll.evaluate((element) => {
      element.style.paddingBottom = "1000px";
      element.scrollTop = 180;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const compactWorkflowHeader = page.locator(".photographer-mobile-header");
    await expect(compactWorkflowHeader).toHaveAttribute("data-project-context-visible", "true");
    await expect(compactWorkflowHeader.locator("[data-mobile-project-header-context]")).toContainText("[E2E] 테스트 프로젝트");
    await expect(compactWorkflowHeader.locator("[data-mobile-project-header-context]")).not.toContainText("E2E 테스트 고객 고객");
    await expect(compactWorkflowHeader.locator("[data-mobile-project-header-context]")).not.toContainText(/#[A-Z0-9-]+/);
    await expect(compactWorkflowHeader.getByText("A-CUT.", { exact: true })).toBeHidden();
    await workflowAssetScroll.evaluate((element) => {
      element.scrollTop = 0;
      element.style.paddingBottom = "";
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const retouchedToolbar = page.getByRole("region", { name: "보정본 작업 도구" });
    await expect(retouchedToolbar).toHaveCSS("height", "44px");
    await expect(retouchedToolbar).not.toContainText("최신 정보 확인 중");
    const retouchedMobileActions = retouchedToolbar.locator("[data-mobile-asset-toolbar-actions]");
    await expect(retouchedMobileActions).toBeVisible();
    await expect(retouchedMobileActions.getByRole("button", { name: /일괄 (업로드|교체)/ })).toHaveCount(0);
    await expect(retouchedToolbar.getByText(/^(1차 보정|재보정)\s*·?\s*\d+장$/)).toHaveCount(0);
    await expect(retouchedMobileActions.getByRole("button", { name: "보정본 내보내기" })).toHaveCount(0);
    await retouchedMobileActions.getByRole("button", { name: "보정본 필터 설정" }).click();
    const filterSheet = page.getByRole("dialog", { name: "보정본 필터" });
    await expect(filterSheet.getByRole("group", { name: "사진 상태 필터" })).toBeVisible();
    await filterSheet.getByRole("button", { name: "닫기" }).click();
    await retouchedMobileActions.getByRole("button", { name: "목록으로 보기" }).click();
    const retouchedList = page.getByRole("table", { name: "보정본 사진 목록" });
    await expect(retouchedList).toBeVisible();
    await expect(page.locator("[data-workflow-asset-content]")).toHaveCSS("padding-bottom", "0px");
    await expect(page.locator("[data-workflow-asset-scroll]")).toHaveCSS("scroll-padding-bottom", "80px");
    const retouchedHeader = retouchedList.getByRole("row").first();
    await expect(retouchedHeader).toHaveCSS("height", "44px");
    await expect(retouchedHeader.getByRole("columnheader").nth(0)).toHaveText("원본");
    await expect(retouchedHeader.getByRole("columnheader").nth(1)).toHaveText("보정본");
    const mobileMappingRow = retouchedList.locator("[data-retouched-mapping-row='true']").first();
    expect((await mobileMappingRow.boundingBox())!.height).toBeGreaterThanOrEqual(68);
    const mappingGeometry = await mobileMappingRow.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(mappingGeometry.scrollWidth).toBeLessThanOrEqual(mappingGeometry.clientWidth);
    const mobileMappingFiles = mobileMappingRow.locator(":scope > div[role='cell']");
    await expect(mobileMappingFiles).toHaveCount(2);
    await expect(mobileMappingFiles.nth(1)).toHaveCSS("display", "grid");
    await expect(retouchedList.getByText("원본명 유지", { exact: true })).toHaveCount(0);
    await retouchedMobileActions.getByRole("button", { name: "갤러리로 보기" }).click();
    await expect(page.locator("[data-photographer-page-action-bar]")).toHaveCSS("position", "fixed");

    const projectPhotosResponse = await page.request.get(`/api/photographer/projects/${editingProject.projectId}/photos`);
    expect(projectPhotosResponse.ok()).toBeTruthy();
    const projectPhotos = await projectPhotosResponse.json() as { photos: Array<{ id: string; original_filename: string }> };
    const finalPhoto = projectPhotos.photos[0];
    expect(finalPhoto).toBeTruthy();
    await page.route(`**/api/photographer/projects/${editingProject.projectId}/versions*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          project_status: "delivered",
          versions: [{
            id: "e2e-final-version",
            photo_id: finalPhoto.id,
            version: 1,
            r2_url: "/customer/entry/hero-fallback.svg",
            r2_thumb_url: "/customer/entry/hero-fallback.svg",
            review_status: "approved",
            customer_comment: "최종본에서는 숨겨질 코멘트",
            version_filename: "FINAL_DELIVERY.jpg",
            created_at: new Date().toISOString(),
            reviewed_at: new Date().toISOString(),
          }],
          version_history: [],
        }),
      });
    });
    await setProjectStatus(page, editingProject.projectId, "delivered");
    await page.goto(`/photographer/projects/${editingProject.projectId}/assets/final`);
    const finalToolbar = page.getByRole("region", { name: "최종본 작업 도구" });
    await expect(finalToolbar).toHaveCSS("height", "44px");
    await expect(finalToolbar.locator("[data-mobile-asset-toolbar-actions]")).toBeVisible();
    await finalToolbar.getByRole("button", { name: "최종본 필터 설정" }).click();
    await expect(page.getByRole("dialog", { name: "최종본 필터" })).toBeVisible();
    await page.getByRole("dialog", { name: "최종본 필터" }).getByRole("button", { name: "닫기" }).click();
    const finalHeader = page.locator("[data-final-photo-header]");
    await expect(finalHeader).toHaveText("FINAL_DELIVERY.jpg");
    await expect(finalHeader).not.toContainText("원본");
    await expect(page.getByText("최종본에서는 숨겨질 코멘트", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await finalToolbar.getByRole("button", { name: "목록으로 보기" }).click();
    const finalList = page.getByRole("table", { name: "최종본 사진 목록" });
    await expect(finalList.getByRole("columnheader")).toHaveCount(2);
    await expect(finalList.getByText("FINAL_DELIVERY.jpg", { exact: true })).toBeVisible();
    await finalToolbar.getByRole("button", { name: "갤러리로 보기" }).click();
    await page.locator("[data-final-photo-image]").click();
    const finalViewer = page.locator("[data-original-photo-viewer]");
    await expect(finalViewer).toBeVisible();
    await expect(finalViewer.getByText("FINAL_DELIVERY.jpg", { exact: true })).toBeVisible();
    await expect(finalViewer.getByLabel("사진 상세 정보")).toHaveCount(0);
    await finalViewer.getByRole("button", { name: "사진 상세 보기 닫기" }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(finalHeader).toHaveText("FINAL_DELIVERY.jpg");
    await expect(finalHeader).not.toContainText("원본");
    await finalToolbar.getByRole("button", { name: "목록으로 보기" }).click();
    await expect(finalList.getByRole("columnheader")).toHaveCount(2);
    await expect(finalList.getByText("FINAL_DELIVERY.jpg", { exact: true })).toBeVisible();

    // 테스트 프로젝트 정리
    await page.request.delete("/api/auth/test-setup", {
      data: { projectId: editingProject.projectId },
    });
    await page.close();
  });

  test("W-LOCK: 고객 검토 중에는 보정본 선택과 삭제를 UI와 API에서 차단한다", async ({ page }) => {
    const reviewingProject = await createEditingProject(page, 1);
    try {
      const photosResponse = await page.request.get(`/api/photographer/projects/${reviewingProject.projectId}/photos`);
      expect(photosResponse.ok()).toBeTruthy();
      const { photos } = await photosResponse.json() as { photos: Array<{ id: string }> };
      expect(photos).toHaveLength(1);

      const seedResponse = await page.request.post("/api/auth/test-setup", {
        data: {
          action: "seed_photo_version",
          projectId: reviewingProject.projectId,
          photoIds: [photos[0].id],
        },
      });
      expect(seedResponse.ok(), await seedResponse.text()).toBeTruthy();
      const { versionId } = await seedResponse.json() as { versionId: string };
      await setProjectStatus(page, reviewingProject.projectId, "reviewing_v1");

      await page.goto(`/photographer/projects/${reviewingProject.projectId}/assets/retouched?round=v1`);
      await expect(page.getByRole("region", { name: "보정본 작업 도구" })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: /보정본/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /선택 삭제/ })).toHaveCount(0);

      const deleteResponse = await page.request.delete(
        `/api/photographer/projects/${reviewingProject.projectId}/versions/${versionId}`,
      );
      expect(deleteResponse.status()).toBe(409);
      await expect(deleteResponse.json()).resolves.toMatchObject({
        code: "customer_review_in_progress",
      });
    } finally {
      await deleteTestProject(page, reviewingProject.projectId);
    }
  });

  test("W1: 워크플로우 페이지 로드 → 원본 탭 표시", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");
    // 원본 탭은 모든 상태에서 보임
    await expect(page.getByRole("tab", { name: /^원본/ })).toBeVisible({ timeout: 8000 });
  });

  test("W2: 셀렉 탭 → 내보내기 버튼 존재", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /^셀렉/ }).click();
    await page.waitForTimeout(500);
    const exportBtn = page.getByRole("region", { name: "셀렉 결과 도구" }).locator("[data-project-asset-export-trigger]");
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
  });

  test("W3: 갤러리/파일명 뷰 토글", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "목록으로 보기", exact: true }).click();
    await expect(page).toHaveURL(/\/assets\/retouched/);
  });

  test("W4: 셀렉 탭 → CSV 내보내기 다운로드", async ({ page }) => {
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /^셀렉/ }).click();
    await page.waitForTimeout(500);
    const exportBtn = page.getByRole("region", { name: "셀렉 결과 도구" }).locator("[data-project-asset-export-trigger]");
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
    await exportBtn.click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.getByRole("button", { name: "CSV 다운로드", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("W5: V2 상세는 사진 클릭으로 집중 보기를 열고 이동 버튼을 숨긴다", async ({ page }) => {
    const detailProject = await createEditingProject(page, 1);
    try {
      const photosResponse = await page.request.get(`/api/photographer/projects/${detailProject.projectId}/photos`);
      expect(photosResponse.ok()).toBeTruthy();
      const payload = await photosResponse.json() as { photos: Array<{ id: string }> };
      const photo = payload.photos[0];
      expect(photo).toBeTruthy();

      await page.route(`**/api/photographer/projects/${detailProject.projectId}/versions*`, route => route.fulfill({
        json: {
          project_status: "editing_v2",
          versions: [
            {
              id: "focus-v1",
              photo_id: photo.id,
              version: 1,
              r2_url: "/customer/entry/hero-fallback.svg",
              r2_thumb_url: "/customer/entry/hero-fallback.svg",
              review_status: "revision_requested",
              customer_comment: "재보정 요청",
              version_filename: "FOCUS_V1.jpg",
              created_at: new Date().toISOString(),
              reviewed_at: new Date().toISOString(),
            },
            {
              id: "focus-v2",
              photo_id: photo.id,
              version: 2,
              r2_url: "/customer/entry/hero-fallback.svg",
              r2_thumb_url: "/customer/entry/hero-fallback.svg",
              review_status: null,
              customer_comment: null,
              version_filename: "FOCUS_V2.jpg",
              created_at: new Date().toISOString(),
              reviewed_at: null,
            },
          ],
          version_history: [],
        },
      }));
      await page.route("https://picsum.photos/**", route => route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#536b78"/></svg>',
      }));
      await setProjectStatus(page, detailProject.projectId, "editing_v2");
      await page.goto(`/photographer/projects/${detailProject.projectId}/assets/retouched?round=v2`);
      await page.getByRole("img", { name: "V2", exact: true }).first().click();

      const viewer = page.locator("[data-original-photo-viewer]");
      const prev = viewer.getByRole("button", { name: "이전 사진" });
      const next = viewer.getByRole("button", { name: "다음 사진" });
      await expect(viewer).toBeVisible();
      await expect(prev).toBeVisible();
      await expect(next).toBeVisible();

      await viewer.locator("[data-viewer-stage] img").first().click();
      await expect(viewer).toHaveAttribute("data-focused", "true");
      await expect(prev).toHaveCount(0);
      await expect(next).toHaveCount(0);

      const focusedImage = viewer.locator("[data-viewer-stage] img").first();
      await focusedImage.dispatchEvent("pointerdown", {
        pointerType: "mouse", isPrimary: true, button: 0, pointerId: 11, clientX: 600, clientY: 400,
      });
      await page.waitForTimeout(350);
      const focusedOriginal = viewer.locator("[data-viewer-stage] img").nth(1);
      await expect(focusedOriginal).toHaveCSS("opacity", "1");
      await focusedImage.dispatchEvent("pointerup", {
        pointerType: "mouse", isPrimary: true, button: 0, pointerId: 11, clientX: 600, clientY: 400,
      });
      await focusedImage.dispatchEvent("click");
      /* 원본 비교를 마쳐도 집중 보기를 해제하는 사진 클릭으로 재해석하지 않는다. */
      await expect(viewer).toHaveAttribute("data-focused", "true");
      await expect(viewer.getByRole("button", { name: /사진/ })).toHaveCount(0);
      await expect(focusedOriginal).toHaveCSS("opacity", "0");

      await page.keyboard.press("Escape");
      await expect(viewer).not.toHaveAttribute("data-focused", "true");
      await expect(prev).toBeVisible();
      await expect(next).toBeVisible();
    } finally {
      await deleteTestProject(page, detailProject.projectId);
    }
  });

  test("W6: 보정 회차를 보정본 탭 옆 단계 진행으로 표시한다", async ({ page }) => {
    const stageProject = await createEditingProject(page, 1);
    try {
      const photosResponse = await page.request.get(`/api/photographer/projects/${stageProject.projectId}/photos`);
      const { photos } = await photosResponse.json() as { photos: Array<{ id: string }> };
      const photo = photos[0];
      await page.route(`**/api/photographer/projects/${stageProject.projectId}/versions*`, route => route.fulfill({
        json: {
          project_status: "editing_v2",
          versions: [
            { id: "stage-v1", photo_id: photo.id, version: 1, r2_url: "/customer/entry/hero-fallback.svg", r2_thumb_url: "/customer/entry/hero-fallback.svg", review_status: "revision_requested", customer_comment: "재보정 요청", version_filename: "STAGE_V1.jpg", created_at: new Date().toISOString(), reviewed_at: new Date().toISOString() },
            { id: "stage-v2", photo_id: photo.id, version: 2, r2_url: "/customer/entry/hero-fallback.svg", r2_thumb_url: "/customer/entry/hero-fallback.svg", review_status: null, customer_comment: null, version_filename: "STAGE_V2.jpg", created_at: new Date().toISOString(), reviewed_at: null },
          ],
          version_history: [],
        },
      }));
      await setProjectStatus(page, stageProject.projectId, "editing_v2");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/photographer/projects/${stageProject.projectId}/assets/retouched?round=v2`);

      const retouchedTab = page.getByRole("tab", { name: "보정본", exact: true });
      const stepper = page.locator("[data-retouch-stage-stepper]");
      await expect(stepper).toBeVisible();
      await expect(page.getByRole("tablist", { name: "보정 회차" })).toHaveCount(0);
      const [tabBox, stepperBox] = await Promise.all([retouchedTab.boundingBox(), stepper.boundingBox()]);
      expect(tabBox).not.toBeNull();
      expect(stepperBox).not.toBeNull();
      expect(stepperBox!.x).toBeGreaterThanOrEqual(tabBox!.x + tabBox!.width);
      await expect(stepper.getByRole("button", { name: "재보정" })).toHaveAttribute("aria-current", "step");
      await expect(stepper.locator('[data-retouch-round="v2"]')).toHaveAttribute("data-viewed", "true");
      await stepper.locator('[data-retouch-round="v1"]').click();
      await expect(stepper.locator('[data-retouch-round="v1"]')).toHaveAttribute("data-viewed", "true");
      await expect(stepper.locator('[data-retouch-round="v2"]')).toContainText("진행 중");
      await stepper.locator('[data-retouch-round="v2"]').click();

      await page.setViewportSize({ width: 390, height: 844 });
      const trigger = page.locator("[data-mobile-retouch-stage-trigger]");
      await expect(trigger).toContainText("2/2 재보정");
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "보정 단계" });
      await expect(sheet.getByText("완료된 단계", { exact: true })).toBeVisible();
      await sheet.getByRole("button", { name: /1차 보정 완료된 단계/ }).click();
      await expect(trigger).toContainText("1/2 1차 보정");
      await expect(page).toHaveURL(/round=v1/);
    } finally {
      await deleteTestProject(page, stageProject.projectId);
    }
  });
});
