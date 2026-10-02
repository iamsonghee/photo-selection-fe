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
    photoStates: { p1: { comment: "표정이 좋아요" } }, participantOpinions: { p1: { blue: { rating: 4 } } },
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
    if (path.endsWith("/selections") && request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.photo_id === "p1" && Object.prototype.hasOwnProperty.call(body, "comment")) data.photoStates.p1 = { comment: body.comment ?? "" };
      return route.fulfill({ json: { ok: true } });
    }
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
  // 셀프 고르기 카드는 모바일 기본 2열에서도 1:1(공용 카드의 2열 4:3을 덮어쓴다).
  const cardBox = await page.locator("[data-photo-id]").first().boundingBox();
  expect(Math.abs(cardBox!.width - cardBox!.height)).toBeLessThan(2);
  const galleryTexts = await page.locator("body").innerText();
  // 목표 장수는 참고값이다 — 장수만 알려주고 더 고르거나 줄이라고 압박하지 않는다.
  // 진행은 분수 대신 문장: 한 일(지금까지 N장) + 할 일(약속 장수 정도).
  expect(galleryTexts).toContain(`지금까지 ${selectedCount}장 골랐어요`);
  expect(galleryTexts).toContain("10장 정도 골라주세요");
  expect(galleryTexts).not.toContain("더 골라주세요");
  expect(galleryTexts).not.toContain("더 선택해 주세요");
  expect(galleryTexts).not.toContain("줄여주세요");
  const confirm = page.getByRole("button", { name: /선택 완료/ }).last();
  const confirmBox = await confirm.boundingBox();
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));

  await page.locator('[data-photo-id="p1"]').click();
  const viewer = page.getByRole("dialog", { name: /상세 보기/ });
  await expect(viewer).toBeVisible();
  const viewerTexts = await viewer.innerText();
  expect(viewerTexts).toContain(`지금까지 ${selectedCount}장 골랐어요`);
  expect(viewerTexts).not.toContain("장 남음");
  // 모바일 상세는 사진 위주 — 메모는 메모 버튼으로 펼친다(dispatchEvent: dev 서버의 Next.js 이슈 배지가 왼쪽 아래를 덮는다).
  if (viewport === "mobile") await viewer.getByRole("button", { name: /^메모 (보기|쓰기)$/ }).dispatchEvent("click");
  const memo = page.getByRole("textbox", { name: "작가 전달 메모" });
  await memo.fill("자동 저장 확인");
  await expect(page.locator('[role="status"]:visible', { hasText: "저장됨" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  const viewerReviewBox = await confirm.boundingBox();
  const viewerReviewText = await confirm.innerText();
  await confirm.click();
  await expect(page).toHaveURL(/\/customer-select\/core-flow\/review/);
  await expect(page.getByRole("heading", { name: `${selectedCount}장을 보낼게요` })).toBeVisible();
  const reviewTexts = await page.locator("body").innerText();
  expect(reviewTexts).toContain(`약속한 10장보다 ${Math.abs(selectedCount - 10)}장 ${selectedCount > 10 ? "많아요" : "적어요"}`);
  await expect(page.getByRole("button", { name: /크게 보기$/ })).toHaveCount(selectedCount);
  const firstSelectedPhoto = page.getByRole("button", { name: /크게 보기$/ }).first().locator("img");
  const firstSelectedPhotoBox = await firstSelectedPhoto.boundingBox();
  const reviewPageBox = await page.locator("main").first().boundingBox();
  const reviewCardBoxes = await page.locator("img").evaluateAll((images) => images.map((image) => {
    const r = image.getBoundingClientRect(); return { width: r.width, height: r.height };
  }));
  const reviewOverflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  await page.screenshot({ path: `test-results/core-flow-${viewport}-${selectedCount}-review.png`, fullPage: true });
  await page.getByRole("button", { name: "CORE_001.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "CORE_001.jpg 상세 보기" })).toBeVisible();
  await page.keyboard.press("Escape");

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
  expect(csvText).toContain("파일명,작가 전달 메모");
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
