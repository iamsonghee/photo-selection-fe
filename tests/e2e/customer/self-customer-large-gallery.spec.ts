import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "large-gallery";
const PHOTO_COUNT = 2_000;
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type Metrics = {
  viewport: string;
  firstCardMs: number;
  initialCards: number;
  maxCards: number;
  endIds: string[];
  restoreBefore: string | null;
  restoreAfter: string | null;
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
};

function project() {
  return {
    id: PROJECT_ID,
    name: "2천장 갤러리 QA",
    shootType: "wedding",
    target: 30,
    photoCount: PHOTO_COUNT,
    uploaded: true,
    realtimeKey: "large-gallery-qa",
    photos: Array.from({ length: PHOTO_COUNT }, (_, index) => ({
      id: `p${String(index + 1).padStart(4, "0")}`,
      projectId: PROJECT_ID,
      orderIndex: index,
      url: PIXEL,
      previewUrl: PIXEL,
      originalFilename: `PHOTO_${String(index + 1).padStart(4, "0")}.jpg`,
      isBlurry: index % 137 === 0,
      faceDetected: index % 211 === 0,
      eyesClosed: index % 211 === 0,
    })),
    selectedIds: [] as string[],
    photoStates: {},
    participantOpinions: {},
    participantDone: { red: false },
    participantNicknames: { red: "소유자" },
    onlineParticipants: ["red"],
    participantViews: {},
    shareToken: "",
    shareEnabled: false,
    exported: false,
    deliveryCount: 0,
    lastDeliveredAt: null,
  };
}

async function installMocks(page: Page) {
  const data = project();
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith("/sync")) {
      return route.fulfill({ json: {
        selectedIds: data.selectedIds,
        photoStates: data.photoStates,
        participantOpinions: data.participantOpinions,
        participantDone: data.participantDone,
        participantNicknames: data.participantNicknames,
        onlineParticipants: data.onlineParticipants,
        participantViews: data.participantViews,
        exported: false,
        deliveryCount: 0,
        lastDeliveredAt: null,
      } });
    }
    if (url.pathname.endsWith("/selections") && method === "POST") {
      const body = route.request().postDataJSON();
      if (typeof body.is_selected === "boolean") {
        data.selectedIds = body.is_selected
          ? [...new Set([...data.selectedIds, body.photo_id])]
          : data.selectedIds.filter((id) => id !== body.photo_id);
      }
      return route.fulfill({ json: { ok: true } });
    }
    if ((url.pathname.endsWith("/participants") || url.pathname.endsWith("/presence")) && method === "POST") {
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith(`/projects/${PROJECT_ID}`) && method === "GET") {
      return route.fulfill({ json: { isOwner: true, project: data } });
    }
    return route.fulfill({ json: { ok: true } });
  });
}

async function visiblePhotoIds(page: Page) {
  return page.locator("[data-photo-id]").evaluateAll((cards) => cards.flatMap((card) => {
    const rect = card.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight ? [card.getAttribute("data-photo-id")!] : [];
  }));
}

async function exercise(page: Page, viewport: string): Promise<Metrics> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "";
    if (request.url().endsWith("/presence") && error.includes("ERR_ABORTED")) return;
    failedRequests.push(`${request.method()} ${request.url()} ${error}`);
  });
  await installMocks(page);

  const started = Date.now();
  await page.goto(`/customer-select/${PROJECT_ID}/select`);
  await expect(page.locator("[data-photo-id]").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-customer-shell-header-mode]")).toBeVisible();
  await expect(page.locator(".gld-brand-mark")).toBeHidden();
  expect((await page.locator('[class*="selectGrid"]').first().boundingBox())?.x).toBe(viewport === "desktop" ? 24 : 20);
  const firstCardMs = Date.now() - started;
  const initialCards = await page.locator("[data-photo-id]").count();
  let maxCards = initialCards;
  const sample = async () => { maxCards = Math.max(maxCards, await page.locator("[data-photo-id]").count()); };
  const gallery = page.locator('[class*="selectGallery"]').first();

  if (viewport === "desktop") {
    await page.getByRole("button", { name: "마지막으로 이동" }).click();
  } else {
    await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  }
  await page.waitForTimeout(350);
  await sample();
  const endIds = await visiblePhotoIds(page);
  expect(endIds.some((id) => id === "p2000")).toBeTruthy();

  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight * 0.5 }));
  await page.waitForTimeout(300);
  await sample();

  if (viewport === "desktop") {
    await page.getByTitle("작게 보기").click();
    await page.waitForTimeout(250);
    await page.getByTitle("크게 보기").click();
  } else {
    await page.getByRole("button", { name: /현재 2열, 누르면 3열로 변경/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /현재 3열, 누르면 4열로 변경/ }).click();
    await page.getByRole("button", { name: "사진 필터 설정" }).click();
    await expect(page.getByRole("dialog", { name: "필터 설정" })).toBeVisible();
    await page.getByRole("button", { name: "흐림만" }).click();
    await page.getByRole("button", { name: "필터 닫기" }).first().click();
    await expect(page.locator("[data-photo-id]")).toHaveCount(15);
    await page.getByRole("button", { name: "흐림" }).click();
  }
  await page.waitForTimeout(250);
  await sample();

  const search = viewport === "desktop"
    ? page.getByLabel("파일명으로 필터링").filter({ visible: true })
    : (await page.getByRole("button", { name: "파일명 검색" }).click(), page.getByLabel("파일명으로 필터링").filter({ visible: true }));
  await search.fill("PHOTO_1999.jpg");
  const targetCard = page.locator('[data-photo-id="p1999"]');
  await expect(targetCard).toBeVisible();
  await expect(page.locator("[data-photo-id]")).toHaveCount(1);
  await targetCard.getByRole("button", { name: "선택" }).click();
  const selectedCheck = targetCard.getByRole("button", { name: "선택 해제" });
  await expect(selectedCheck).toBeVisible();
  expect(await selectedCheck.evaluate((element) => {
    const face = getComputedStyle(element, "::before");
    return [face.left, face.top, face.borderRadius];
  })).toEqual(["8px", "8px", "4px"]);
  await targetCard.click({ position: { x: 40, y: 60 } });
  await expect(page.locator(".fs-page-root")).toBeVisible();
  await expect(page.getByText(/파일명 · PHOTO_1999/).filter({ visible: true })).toBeVisible();
  if (viewport === "desktop") {
    await page.getByRole("button", { name: "다음 사진" }).click();
    await page.getByRole("button", { name: "이전 사진" }).click();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByText(/파일명 · PHOTO_/)).toHaveCount(0);
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();

  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight * 0.63 }));
  await page.waitForTimeout(400);
  const restoreBefore = await page.evaluate((id) => sessionStorage.getItem(`ps:self-gallery-position:${id}`), PROJECT_ID);
  await page.reload();
  await expect(page.locator("[data-photo-id]").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const restoredIds = await visiblePhotoIds(page);
  const restoreAfter = restoredIds[0] ?? null;
  expect(restoreBefore).not.toBeNull();
  expect(restoredIds).toContain(restoreBefore);
  await sample();

  expect(initialCards).toBeLessThan(300);
  expect(maxCards).toBeLessThan(300);
  return { viewport, firstCardMs, initialCards, maxCards, endIds, restoreBefore, restoreAfter, pageErrors, consoleErrors, failedRequests };
}

test("2,000-photo desktop gallery stays virtualized and usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const metrics = await exercise(page, "desktop");
  console.log("LARGE_GALLERY_METRICS", JSON.stringify(metrics));
  expect(metrics.pageErrors).toEqual([]);
  expect(metrics.consoleErrors).toEqual([]);
  expect(metrics.failedRequests).toEqual([]);
  await context.close();
});

test("2,000-photo mobile gallery stays virtualized and usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const metrics = await exercise(page, "mobile");
  console.log("LARGE_GALLERY_METRICS", JSON.stringify(metrics));
  expect(metrics.pageErrors).toEqual([]);
  expect(metrics.consoleErrors).toEqual([]);
  expect(metrics.failedRequests).toEqual([]);
  await context.close();
});
