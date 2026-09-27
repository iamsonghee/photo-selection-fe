import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loginAsPhotographer } from "../../helpers/auth";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function project(selectedCount: number) {
  const photos = Array.from({ length: 24 }, (_, index) => ({
    id: `p${index + 1}`,
    projectId: "core-flow",
    orderIndex: index,
    url: PIXEL,
    previewUrl: PIXEL,
    originalFilename: index === 1 ? "유사컷02.jpg".normalize("NFD") : `CORE_${String(index + 1).padStart(3, "0")}.jpg`,
  }));
  return {
    id: "core-flow", name: "핵심 흐름 QA", shootType: "wedding", target: 10,
    photoCount: photos.length, uploaded: true, realtimeKey: "core-flow-qa", photos,
    selectedIds: photos.slice(0, selectedCount).map((photo) => photo.id),
    photoStates: {}, participantOpinions: { p1: { blue: { rating: 4, comment: "표정이 좋아요" } } },
    participantDone: { red: false, blue: true }, participantNicknames: { red: "소유자", blue: "동행" },
    onlineParticipants: ["red", "blue"], participantViews: {}, shareToken: "", shareEnabled: true,
    exported: false, deliveryCount: 0, lastDeliveredAt: null,
  };
}

async function mock(page: Page, selectedCount: number) {
  const data = project(selectedCount);
  await page.route("**/api/customer-select/projects/core-flow**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/sync")) return route.fulfill({ json: {
      selectedIds: data.selectedIds, photoStates: data.photoStates, participantOpinions: data.participantOpinions,
      participantDone: data.participantDone, participantNicknames: data.participantNicknames,
      onlineParticipants: data.onlineParticipants, participantViews: {}, exported: false,
      deliveryCount: 0, lastDeliveredAt: null,
    } });
    if (path.endsWith("/presence") || path.endsWith("/participants")) return route.fulfill({ json: { ok: true } });
    if (path.endsWith("/result-link")) return route.fulfill({ json: { url: "/customer-select/result/core-flow?result_token=fake" } });
    if (path.endsWith("/projects/core-flow") && request.method() === "PATCH") return route.fulfill({ json: { project: { ...data, exported: true } } });
    if (path.endsWith("/projects/core-flow") && request.method() === "GET") return route.fulfill({ json: { isOwner: true, project: data } });
    return route.fulfill({ json: { ok: true } });
  });
}

async function inspect(page: Page, selectedCount: number, viewport: string) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const projectStatePatches: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("request", (request) => { if (request.method() === "PATCH" && new URL(request.url()).pathname.endsWith("/projects/core-flow")) projectStatePatches.push(request.url()); });
  await loginAsPhotographer(page);
  await mock(page, selectedCount);
  await page.goto("/customer-select/core-flow/select");
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  const galleryTexts = await page.locator("body").innerText();
  if (viewport === "desktop") expect(galleryTexts).toContain(`${selectedCount}장 선택 · 목표 10장`);
  else {
    expect(galleryTexts).toContain("선택한 사진");
    expect(galleryTexts).toContain(`${selectedCount} / 10`);
  }
  expect(galleryTexts).not.toContain("더 골라주세요");
  expect(galleryTexts).not.toContain("더 선택해 주세요");
  const confirm = page.getByRole("button", { name: "최종 검토하기" });
  const confirmBox = await confirm.boundingBox();
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));

  await page.locator('[data-photo-id="p1"]').click();
  await expect(page.locator(".fs-page-root")).toBeVisible();
  const viewerTexts = await page.locator(".fs-page-root").innerText();
  const viewerReview = page.locator(".fs-page-root").getByRole("button", { name: "최종 검토하기" });
  const viewerReviewBox = await viewerReview.boundingBox();
  const viewerReviewText = await viewerReview.innerText();
  expect(viewerTexts).toContain(`${selectedCount}장 선택 · 목표 10장`);
  expect(viewerTexts).not.toContain("줄여주세요");
  expect(viewerTexts).not.toContain("장 남음");
  expect(viewerTexts).not.toContain("전체 사진에서 더 고르기");
  if (viewport === "desktop") {
    await page.getByRole("button", { name: "사진별 요청 남기기" }).click();
    await page.getByRole("textbox", { name: "사진별 요청" }).fill("자동 저장 확인");
  } else {
    await page.getByRole("button", { name: "코멘트 남기기" }).click();
    await page.getByRole("textbox", { name: "사진 코멘트" }).fill("자동 저장 확인");
  }
  await expect(page.locator('span:visible', { hasText: "✓ 저장됨" })).toBeVisible();
  if (viewport === "mobile") await page.getByRole("textbox", { name: "사진 코멘트" }).blur();
  await viewerReview.click();
  await expect(page).toHaveURL(/\/customer-select\/core-flow\/review/);
  await expect(page.getByRole("heading", { name: "핵심 흐름 QA", exact: true })).toBeVisible();
  const reviewTexts = await page.locator("body").innerText();
  const collapsed = selectedCount > 10;
  await expect(page.getByRole("button", { name: /크게 보기$/ })).toHaveCount(collapsed ? 10 : selectedCount);
  const firstSelectedPhoto = page.getByRole("button", { name: /크게 보기$/ }).first().locator("img");
  const firstSelectedPhotoBox = await firstSelectedPhoto.boundingBox();
  if (collapsed) {
    await page.getByRole("button", { name: `사진 ${selectedCount - 10}장 더 보기` }).click();
    await expect(page.getByRole("button", { name: /크게 보기$/ })).toHaveCount(selectedCount);
    await page.getByRole("button", { name: "사진 접기" }).click();
    await expect(page.getByRole("button", { name: /크게 보기$/ })).toHaveCount(10);
    await page.getByRole("button", { name: `사진 ${selectedCount - 10}장 더 보기` }).click();
  }
  const reviewPageBox = await page.locator('[class*="page"]').first().boundingBox();
  const reviewCardBoxes = await page.locator("img").evaluateAll((images) => images.map((image) => {
    const r = image.getBoundingClientRect(); return { width: r.width, height: r.height };
  }));
  const reviewOverflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  await page.screenshot({ path: `test-results/core-flow-${viewport}-${selectedCount}-review.png`, fullPage: true });
  await page.getByRole("button", { name: "CORE_001.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "CORE_001.jpg 크게 보기" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByText("파일로 내보내기").click();
  const exportTexts = await page.locator("body").innerText();
  await page.getByRole("button", { name: "링크 복사" }).click();
  expect(projectStatePatches).toEqual([]);
  const csvBox = await page.getByRole("button", { name: "CSV 다운로드" }).boundingBox();
  const txtBox = await page.getByRole("button", { name: "TXT 다운로드" }).boundingBox();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV 다운로드" }).click()]);
  const [txt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TXT 다운로드" }).click()]);
  const csvBytes = await readFile(await csv.path());
  const csvText = csvBytes.toString("utf8");
  await page.screenshot({ path: `test-results/core-flow-${viewport}-${selectedCount}-review-export.png`, fullPage: true });

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  expect(reviewOverflow.scrollWidth).toBeLessThanOrEqual(reviewOverflow.innerWidth);
  expect(confirmBox?.height).toBeGreaterThanOrEqual(40);
  expect(viewerReviewBox?.height).toBeGreaterThanOrEqual(40);
  expect(csvBox?.height).toBeGreaterThanOrEqual(40);
  expect(txtBox?.height).toBeGreaterThanOrEqual(40);
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(csvText).toContain("파일명,코멘트");
  expect(csvText).toContain("유사컷02.jpg");
  expect(csvText).not.toContain("유사컷02.jpg".normalize("NFD"));
  expect(Math.abs((firstSelectedPhotoBox?.width ?? 0) - (firstSelectedPhotoBox?.height ?? 0))).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  console.log("CORE_FLOW_QA", JSON.stringify({ viewport, selectedCount, galleryTexts, viewerTexts, viewerReviewText, reviewTexts, exportTexts,
    confirmBox, viewerReviewBox, reviewPageBox, reviewCardBoxes, overflow, reviewOverflow, csvBox, txtBox,
    csv: csv.suggestedFilename(), txt: txt.suggestedFilename(), consoleErrors, pageErrors, failedRequests }));
}

test("legacy exported project can continue selecting", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __sawSelectionGallery?: boolean };
    state.__sawSelectionGallery = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-photo-id]")) state.__sawSelectionGallery = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await loginAsPhotographer(page);
  const delivered = { ...project(7), id: "delivered", exported: true };
  await page.route("**/api/customer-select/projects/delivered**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/participants")) return route.fulfill({ json: { ok: true } });
    if (route.request().method() === "GET") return route.fulfill({ json: { isOwner: true, project: delivered } });
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/customer-select/delivered/select");
  await expect(page).toHaveURL(/\/customer-select\/delivered\/select$/);
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __sawSelectionGallery?: boolean }).__sawSelectionGallery)).toBe(true);
});

for (const selectedCount of [7, 24]) {
  for (const config of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    test(`${selectedCount}/10 ${config.name} core flow`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, acceptDownloads: true });
      const page = await context.newPage();
      await inspect(page, selectedCount, config.name);
      await context.close();
    });
  }
}
