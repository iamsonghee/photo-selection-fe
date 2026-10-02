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
  expect((await page.locator('[class*="selectGrid"]').first().boundingBox())?.x).toBe(viewport === "desktop" ? 24 : 8);
  const firstCardMs = Date.now() - started;
  const initialCards = await page.locator("[data-photo-id]").count();
  let maxCards = initialCards;
  const sample = async () => { maxCards = Math.max(maxCards, await page.locator("[data-photo-id]").count()); };
  const gallery = page.locator('[class*="selectGallery"]').first();

  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await page.waitForTimeout(350);
  await sample();
  const endIds = await visiblePhotoIds(page);
  expect(endIds.some((id) => id === "p2000")).toBeTruthy();

  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight * 0.5 }));
  await page.waitForTimeout(300);
  await sample();

  const options = page.getByRole("button", { name: "보기 옵션" });
  // 모바일 보기 크기 버튼은 누를 때마다 바로 다음 크기로 바뀐다(크게 2열 → 중간 3열 → 작게 4열 → 크게). 메뉴는 열지 않는다.
  const label: Record<number, string> = { 2: "크게", 3: "중간", 4: "작게" };
  const setColumns = async (count: number) => {
    await page.getByRole("button", { name: /^보기 크기/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^보기 크기: ${label[count]}`) })).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
  };
  if (viewport === "mobile") {
    await setColumns(3);
    await page.waitForTimeout(250);
    await setColumns(4);
  }
  // 흐림(137번째마다 15장) + 눈 감음(211번째마다 10장), 첫 사진이 겹쳐 24장
  // 흔들림 사진 빼기를 켜면 흐림 15장만 뺐다고 알리고(눈 감음은 빼지 않음), 끄기로 되돌린다.
  await options.click();
  await page.getByRole("switch", { name: /흔들림 사진 빼기/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[class*="toolsNote"]')).toContainText("흔들림 15장 빼고 보는 중");
  await page.getByRole("button", { name: "끄기" }).click();
  await page.waitForTimeout(250);
  await sample();

  // 파일명 검색은 PC만(모바일 툴바는 그 자리에 보기 크기) — 모바일은 지금 보이는 첫 사진으로 고른다.
  const search = page.getByRole("searchbox", { name: "파일명 검색" });
  let targetId = "p1999";
  if (viewport === "desktop") {
    await page.getByRole("button", { name: "파일명 검색 열기" }).click();
    await search.fill("PHOTO_1999.jpg");
    await expect(page.locator("[data-photo-id]")).toHaveCount(1);
  } else {
    await expect(page.getByRole("button", { name: "파일명 검색 열기" })).toBeHidden();
    // 3열 이상에서는 체크 버튼 대신 상태만 보여주므로 2열로 돌아와 고른다.
    await setColumns(2);
    await page.waitForTimeout(250);
    targetId = (await visiblePhotoIds(page))[0];
  }
  const targetCard = page.locator(`[data-photo-id="${targetId}"]`);
  await expect(targetCard).toBeVisible();
  await targetCard.getByRole("button", { name: "선택" }).click();
  const selectedCheck = targetCard.getByRole("button", { name: "선택 해제" });
  await expect(selectedCheck).toBeVisible();
  expect(await selectedCheck.evaluate((element) => {
    const face = getComputedStyle(element, "::before");
    return [face.left, face.top, face.borderRadius];
  })).toEqual(["8px", "8px", "6px"]);
  await targetCard.click({ position: { x: 60, y: 60 } });
  await expect(page.getByRole("dialog", { name: `PHOTO_${targetId.slice(1)}.jpg 상세 보기` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /상세 보기/ })).toHaveCount(0);
  if (viewport === "desktop") await search.fill("");
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  if (viewport === "desktop") {
    await page.locator('[data-photo-id="p0001"]').click();
    await page.getByRole("button", { name: "다음 사진" }).click();
    await expect(page.getByRole("dialog", { name: "PHOTO_0002.jpg 상세 보기" })).toBeVisible();
    await page.getByRole("button", { name: "이전 사진" }).click();
    await expect(page.getByRole("dialog", { name: "PHOTO_0001.jpg 상세 보기" })).toBeVisible();
    // 상세에서 한참 넘겨 본 뒤 닫으면 마지막으로 본 사진이 화면에 오도록 목록이 따라간다(작가 고객 갤러리와 같은 규칙).
    for (let i = 0; i < 120; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "PHOTO_0121.jpg 상세 보기" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => visiblePhotoIds(page)).toContain("p0121");
  }

  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight * 0.63 }));
  await page.waitForTimeout(400);
  // select/page.tsx positionKey: ps:self-select:{프로젝트}:{장면|all}:{보기 범위}:{인물 필터}:{유사컷 묶기}
  const positionKey = `ps:self-select:${PROJECT_ID}:all:all::1`;
  const restoreBefore = await page.evaluate((key) => sessionStorage.getItem(key), positionKey);
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
