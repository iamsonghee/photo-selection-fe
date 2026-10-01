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
  test(`${viewport.name}: scenes form one continuous timeline`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loginAsPhotographer(page);
    await mock(page);

    // 개발 확인용 AI 장면 결과(시간 장면 + 웨딩 본식 장면 이름)로 개요에서 시작한다.
    await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready`);
    await expect(page.getByRole("heading", { name: "장면별로 골라볼까요?" })).toBeVisible();
    await page.getByRole("button", { name: /입장/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/scene=1/);

    // 장면 단독 화면이 아니라 모든 장면이 이어진 타임라인이다: 계속 내리면 경계 카드를 지나 다음 장면이 이어진다.
    const gallery = page.locator('[class*="selectGallery"]').first();
    await expect(page.locator('[class*="barMeta"]').first()).toContainText("입장");
    const nextCard = page.locator('[class*="boundaryCard"]').filter({ hasText: "다음 장면" }).filter({ hasText: "예식" });
    await expect.poll(async () => {
      await gallery.evaluate((element) => element.scrollBy({ top: element.clientHeight * 0.6 }));
      return nextCard.count();
    }).toBe(1);
    await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    // 스크롤 위치를 따라 현재 장면이 바뀌고 주소에도 남는다.
    await expect(page).toHaveURL(/scene=2/);
    await expect(page.locator('[class*="barMeta"]').first()).toContainText("예식");
    await expect(page.getByText("마지막 장면이에요", { exact: false }).filter({ visible: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}
