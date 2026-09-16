import { test, expect, type Page } from "@playwright/test";
import { setupFullProject, deleteTestProject, mockCustomerThumbPresigning, type TestProject } from "../../helpers/setup";

let project: TestProject;
test.beforeEach(async ({ page }) => {
  project = await setupFullProject(page, 5);
  await mockCustomerThumbPresigning(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  if (project?.projectId) await deleteTestProject(page, project.projectId);
});

async function recommendations(page: Page, count: number) {
  // Only the recommendation flags are mocked; selection writes and reloads use the real API.
  await page.route("**/api/c/photos?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.photos = data.photos.map((photo: { id: string }) => ({ ...photo,
      photographerRecommended: project.photoIds!.slice(0, count).includes(photo.id),
    }));
    await route.fulfill({ response, json: data });
  });
}

for (const width of [1440, 390]) {
  test(`추천 부족 → 추가 선택 → 상세보기 → 최종 검토 (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await recommendations(page, 2);
    await page.goto(`/c/${project.accessToken}`);
    await page.getByRole("link", { name: "작가 추천 확인하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "이 추천으로 시작하기", exact: true })).toBeVisible();
    await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
    await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(0);
    if (width === 390) {
      const scopeTrigger = page.locator(".gl-mobile-filter-trigger");
      await expect(scopeTrigger).toContainText("작가 추천2장");
      await scopeTrigger.click();
      const scopeSheet = page.getByRole("dialog", { name: "사진 보기" });
      await expect(scopeSheet.getByRole("radio", { name: /작가 추천/ })).toBeChecked();
      await scopeSheet.getByRole("radio", { name: /전체 사진/ }).click();
      await expect(page.locator(".gl-photo-card")).toHaveCount(5);
      await scopeTrigger.click();
      await page.getByRole("dialog", { name: "사진 보기" }).getByRole("radio", { name: /작가 추천/ }).click();
      await expect(page.locator(".gl-photo-card")).toHaveCount(2);
    }
    await page.screenshot({ path: testInfo.outputPath("recommendation-review.png") });
    const bulkRequests: string[][] = [];
    const bulkProjectIds: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/api/c/selections")) return;
      const body = request.postDataJSON();
      if (Array.isArray(body?.photo_ids)) {
        bulkRequests.push(body.photo_ids);
        bulkProjectIds.push(body.project_id);
      }
    });
    const bulkResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "POST" || !response.url().includes("/api/c/selections")) return false;
      return Array.isArray(response.request().postDataJSON()?.photo_ids);
    });
    await page.getByRole("button", { name: "이 추천으로 시작하기", exact: true }).click();
    const bulkResponse = await bulkResponsePromise;
    expect(bulkRequests).toHaveLength(1);
    expect(bulkRequests[0]).toHaveLength(2);
    expect(new Set(bulkRequests[0])).toEqual(new Set(project.photoIds!.slice(0, 2)));
    expect(bulkProjectIds).toEqual([project.projectId]);
    expect(bulkResponse.ok(), await bulkResponse.text()).toBe(true);
    await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(2);
    await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
    await page.locator(".gl-check-box[aria-label='선택']").first().click();
    await page.getByRole("button", { name: "선택한 3장 확인하기", exact: true }).click();
    await expect(page.locator(".gl-photo-card")).toHaveCount(3);
    await expect(page).toHaveURL(/selected=selected/);
    await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".gl-photo-card")).toHaveCount(3);
    await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(3);
    await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("selection-review.png") });
    await page.goto(`/c/${project.accessToken}/viewer/${project.photoIds![0]}?selected=recommended`);
    await expect(page.locator(".fv-photo-checkbox:visible")).toHaveAttribute("aria-label", "사진 선택 해제");
    await page.getByRole("button", { name: "선택한 3장 확인하기", exact: true }).click();
    await expect(page.locator(".gl-photo-card")).toHaveCount(3);
    await page.getByRole("button", { name: "보정 요청하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const sent = page.waitForRequest((request) => request.url().includes("/api/c/confirm") && request.method() === "POST");
    await expect(page.getByRole("dialog")).toContainText("선택한 3장으로 보정을 요청할까요?");
    await page.getByRole("dialog").getByRole("button", { name: "보정 요청하기" }).click();
    expect(new Set((await sent).postDataJSON().selected_photo_ids).size).toBe(3);
    await expect(page).toHaveURL(/\/confirmed/);
  });
}

test("추천과 기존 선택의 합계가 초과되면 기존 선택을 보존하고 직접 조정한다", async ({ page }) => {
  await recommendations(page, 4);
  const seed = await page.request.post("/api/auth/test-setup", { data: { action: "seed_selections",
    projectId: project.projectId, photoIds: [project.photoIds![4]] } });
  expect(seed.ok()).toBe(true);
  await page.goto(`/c/${project.accessToken}`);
  await expect(page.getByRole("link", { name: "이어서 선택하기", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "작가 추천 확인하기", exact: true }).click();
  await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 추천으로 시작하기", exact: true })).toHaveCount(0);
  await page.locator(".gl-check-box[aria-label='선택']").first().click();
  await page.locator(".gl-check-box[aria-label='선택']").first().click();
  await page.getByRole("button", { name: "선택한 3장 확인하기", exact: true }).click();
  await expect(page.locator(".gl-photo-card")).toHaveCount(3);
  const response = await page.request.get(`/api/c/selections?token=${project.accessToken}&project_id=${project.projectId}`);
  expect((await response.json()).selectedIds).toContain(project.photoIds![4]);
});

test("목표와 같은 추천을 기존 선택에 중복 없이 포함하고 해제 상태를 재접속 후에도 유지한다", async ({ page }) => {
  await recommendations(page, 3);
  const seed = await page.request.post("/api/auth/test-setup", { data: { action: "seed_selections",
    projectId: project.projectId, photoIds: [project.photoIds![0]] } });
  expect(seed.ok()).toBe(true);
  await page.goto(`${project.galleryUrl}?selected=recommended`);
  await expect(page.locator(".gl-gallery-notice-dismissible")).toHaveCount(0);
  await page.getByRole("button", { name: "추천 사진도 선택하기", exact: true }).click();
  await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(3);
  await page.locator(".gl-check-box[aria-label='선택 해제']").first().click();
  await expect(page.getByRole("button", { name: "전체 사진에서 더 고르기", exact: true })).toBeEnabled();
  await page.goto(`${project.galleryUrl}?selected=recommended`);
  await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(2);
  await expect(page.locator(".gl-check-box[aria-label='선택']")).toHaveCount(1);
});

test("추천 적용 저장 실패 시 오류를 알리고 실패한 체크를 되돌린다", async ({ page }) => {
  await recommendations(page, 2);
  await page.route("**/api/c/selections", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 503, json: { error: "test save failure" } });
    else await route.continue();
  });
  await page.goto(`${project.galleryUrl}?selected=recommended`);
  await page.getByRole("button", { name: "이 추천으로 시작하기", exact: true }).click();
  await expect(page.locator("p[role='alert']")).toContainText("저장하지 못했어요");
  await expect(page.locator(".gl-check-box[aria-label='선택 해제']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 추천으로 시작하기", exact: true })).toBeEnabled();
});
