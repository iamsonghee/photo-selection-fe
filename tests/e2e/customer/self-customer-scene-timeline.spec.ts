import { expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

const PROJECT_ID = "scene-timeline";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const pad = (n: number) => String(n).padStart(2, "0");

// 촬영 시각 공백으로 장면 3개가 나오는 사진(오전 11:00 30장, 11:40 30장, 오후 12:30 30장).
function project() {
  const photos = [[11, 0], [11, 40], [12, 30]].flatMap(([hour, minute], block) => Array.from({ length: 30 }, (_, i) => {
    const n = block * 30 + i;
    const seconds = hour * 3600 + minute * 60 + i * 20;
    return {
      id: `p${n}`, projectId: PROJECT_ID, orderIndex: n, url: PIXEL, previewUrl: PIXEL, originalFilename: `S_${n}.jpg`,
      takenAt: `2026-10-03T${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`,
    };
  }));
  return {
    id: PROJECT_ID, name: "장면 타임라인", shootType: "wedding_ceremony", target: 9, photoCount: photos.length, uploaded: true,
    photos, selectedIds: ["p1", "p2"], photoStates: {}, participantOpinions: {}, participantDone: { red: false },
    participantNicknames: { red: "소유자" }, onlineParticipants: [], participantViews: {}, realtimeKey: "scene-timeline",
    shareToken: "", shareEnabled: true, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  };
}

async function mock(page: Page) {
  const data = project();
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sync")) return route.fulfill({ json: { selectedIds: data.selectedIds, photoStates: {}, participantOpinions: {}, participantDone: data.participantDone, participantNicknames: data.participantNicknames, onlineParticipants: [], participantViews: {}, exported: false } });
    if (path.endsWith(`/projects/${PROJECT_ID}`) && route.request().method() === "GET") return route.fulfill({ json: { isOwner: true, project: data } });
    return route.fulfill({ json: { ok: true } });
  });
}

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name}: one scene at a time, switched from the quick menu`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loginAsPhotographer(page);
    await mock(page);

    // 장면 개요 없이, 아직 덜 고른 첫 장면에서 바로 시작한다(첫 장면은 목표 3장 중 2장만 고름).
    await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready`);
    await expect(page.locator('[class*="barMeta"]').first()).toContainText("식전·신부 대기실");
    await expect(page.getByRole("heading", { name: "장면별로 골라볼까요?" })).toHaveCount(0);

    // 퀵메뉴(PC 오른쪽 목록 / 모바일 떠 있는 버튼 → 장면 시트)로 장면을 바꾼다.
    if (viewport.name === "mobile") await page.getByRole("button", { name: "장면 목록 열기" }).click();
    await page.getByRole("button", { name: /^입장/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/scene=1/);
    await expect(page.locator('[class*="barMeta"]').first()).toContainText("입장");

    // 장면 끝에는 다음 장면 이름만 얇게, 마지막 장면 끝에는 보내기가 있다.
    const gallery = page.locator('[class*="selectGallery"]').first();
    await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.locator('[class*="sceneNext"]').filter({ visible: true })).toContainText("예식");
    if (viewport.name === "mobile") await page.getByRole("button", { name: "장면 목록 열기" }).click();
    await page.getByRole("button", { name: /^예식/ }).filter({ visible: true }).first().click();
    await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.getByText("마지막 장면", { exact: false }).filter({ visible: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("desktop: pulling past the end of a scene moves to the next scene", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  const gallery = page.locator('[class*="selectGallery"]').first();
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const box = (await gallery.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300); // 바닥에 닿은 뒤 새로 시작한 당김만 인정한다(관성 스크롤 구분)

  // 조금 당기면 다음 장면이 드러나지만, 놓으면 제자리로 돌아온다.
  await page.mouse.wheel(0, 30);
  await expect(page.locator('[class*="pullReveal"]')).toContainText("입장");
  await expect(page.locator('[class*="pullReveal"]')).toHaveCount(0);
  await expect(page).toHaveURL(/scene=0/);

  // 충분히 당겼다 놓으면 다음 장면으로 넘어간다.
  await page.waitForTimeout(300);
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(30); }
  await expect(page).toHaveURL(/scene=1/);
  await expect(page.locator('[class*="barMeta"]').first()).toContainText("입장");
  await context.close();
});
