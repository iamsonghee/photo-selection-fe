import { expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

const PROJECT_ID = "scene-timeline";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const pad = (n: number) => String(n).padStart(2, "0");

// 촬영 시각 공백으로 장면 3개가 나오는 사진(오전 11:00 30장, 11:40 30장, 오후 12:30 30장).
function project(blocks: number[][] = [[11, 0], [11, 40], [12, 30]]) {
  const photos = blocks.flatMap(([hour, minute], block) => Array.from({ length: 30 }, (_, i) => {
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

async function mock(page: Page, data = project()) {
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sync")) return route.fulfill({ json: { selectedIds: data.selectedIds, photoStates: data.photoStates, participantOpinions: {}, participantDone: data.participantDone, participantNicknames: data.participantNicknames, onlineParticipants: [], participantViews: {}, exported: false } });
    if (path.endsWith(`/projects/${PROJECT_ID}`) && route.request().method() === "GET") return route.fulfill({ json: { isOwner: true, project: data } });
    // 선택·찜 쓰기를 기억해 둔다 — 주기 동기화가 방금 바꾼 상태를 되돌려 테스트가 흔들리지 않게.
    if (path.endsWith("/selections") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { photo_id: string; is_selected?: boolean; color_op?: { color: string; add: boolean } };
      if (typeof body.is_selected === "boolean") data.selectedIds = body.is_selected ? [...new Set([...data.selectedIds, body.photo_id])] : data.selectedIds.filter((id) => id !== body.photo_id);
      if (body.color_op) {
        const states = data.photoStates as Record<string, { color?: string[] }>;
        const current = states[body.photo_id]?.color ?? [];
        states[body.photo_id] = { ...states[body.photo_id], color: body.color_op.add ? [...new Set([...current, body.color_op.color])] : current.filter((color) => color !== body.color_op!.color) };
      }
    }
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

  // 바닥으로 흘러든 관성 스크롤(계속 느려지는 휠)만으로는 넘어가지 않는다.
  await gallery.evaluate((element) => { element.scrollTop = element.scrollHeight - element.clientHeight - 400; });
  await page.waitForTimeout(400);
  for (let i = 0; i < 50; i++) { await page.mouse.wheel(0, 60 * Math.pow(0.93, i)); await page.waitForTimeout(16); }
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/scene=0/);

  // 바닥에서 멈췄다가 휠을 이어서 굴리면(쉬지 않고 연달아 굴려도) 손을 떼기 전에 바로 넘어간다.
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await expect(page).toHaveURL(/scene=1/);
  await expect(page.locator('[class*="barMeta"]').first()).toContainText("입장");
  await context.close();
});

test("desktop: pulling past the top of a scene moves to the end of the previous scene", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=2`);
  const gallery = page.locator('[class*="selectGallery"]').first();
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  await gallery.evaluate((element) => element.scrollTo({ top: 0 }));
  const box = (await gallery.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300); // 맨 위에 닿은 뒤 새로 시작한 당김만 인정한다

  // 위로도 아래와 같은 고무줄: 조금 당기면 이전 장면이 드러나지만, 놓으면 제자리로 돌아온다.
  await page.mouse.wheel(0, -30);
  await expect(page.locator('[class*="pullReveal"]')).toContainText("입장");
  await expect(page.locator('[class*="pullReveal"]')).toHaveCount(0);
  await expect(page).toHaveURL(/scene=2/);

  // 충분히 당기면 이전 장면의 끝으로 넘어간다.
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect(page).toHaveURL(/scene=1/);
  await expect(page.locator('[class*="sceneNext"]').filter({ visible: true })).toContainText("예식");
  // 연달아 올려도 한 번에 두 장면을 건너뛰지 않는다.
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -60); await page.waitForTimeout(40); }
  await expect(page).toHaveURL(/scene=1/);
  await context.close();
});

test("desktop: sample photos shot in one burst are still split into scenes in mock mode", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  // 60장이 20초 간격으로 이어져 촬영 시각만으로는 장면이 하나뿐이다.
  await mock(page, project([[11, 0], [11, 10]]));
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await expect(page.locator('[class*="barMeta"]').first()).toContainText("식전·신부 대기실");
  await page.getByRole("button", { name: /^입장/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/scene=1/);
  await context.close();
});

test("desktop: one continuous scroll moves at most one scene", async ({ browser }) => {
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
  await page.waitForTimeout(400);

  // 쉬지 않고 2초 넘게 계속 굴려도(트랙패드 연속 스와이프·관성) 다음 장면 하나까지만 간다.
  // 테스트 기기가 바쁘면 Playwright가 보내는 휠 자체에 0.14초 넘는 틈이 생기는데, 그건 "쉬었다 다시 당김"이라 넘어가는 게 맞다.
  // 그래서 결과 장면 대신 규칙을 확인한다: 첫 이동 뒤의 이동은 그 장면에서 0.14초 이상 쉰 휠이 있었을 때만 일어난다.
  await page.evaluate(() => {
    const w = window as unknown as { __wheels: { t: number; scene: string }[] };
    w.__wheels = [];
    addEventListener("wheel", (event) => w.__wheels.push({ t: event.timeStamp, scene: new URLSearchParams(location.search).get("scene") ?? "" }), { capture: true });
  });
  for (let i = 0; i < 120; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(16); }
  await page.waitForTimeout(500);
  const wheels = await page.evaluate(() => (window as unknown as { __wheels: { t: number; scene: string }[] }).__wheels);
  const finalScene = Number(new URL(page.url()).searchParams.get("scene"));
  expect(finalScene).toBeGreaterThanOrEqual(1);
  for (let scene = 1; scene < finalScene; scene++) {
    const inScene = wheels.filter((wheel) => wheel.scene === String(scene));
    const paused = inScene.some((wheel, index) => index > 0 && wheel.t - inScene[index - 1].t >= 140);
    expect(paused, `장면 ${scene}에서 쉬지 않았는데 다음 장면으로 넘어감`).toBe(true);
  }
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=1`);
  await expect(page).toHaveURL(/scene=1/);

  // 한 번 쉬었다가 다시 장면 끝에서 당기면 그다음 장면으로 간다.
  await gallery.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await page.waitForTimeout(400);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await expect(page).toHaveURL(/scene=2/);
  await context.close();
});

test("owner card: like is a secondary hover action on desktop and display-only on mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=1`);
  const card = page.locator('[data-photo-id="p43"]');
  const like = card.getByRole("button", { name: "찜하기" });
  await expect(card).toBeVisible();
  await expect(like).toHaveCSS("opacity", "0");

  // 마우스를 올리면 ♡가 보이고, 찜해도 최종 선택(✓)은 그대로다.
  await card.hover();
  await expect(like).toHaveCSS("opacity", "1");
  await like.click();
  await expect(card.getByRole("button", { name: "찜 해제" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("button", { name: "선택", exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(card.getByRole("button", { name: "찜 해제" })).toHaveCSS("opacity", "1");
  await context.close();

  // 터치 기기: 찜하지 않은 카드에는 ♡가 없고, 찜은 상세에서 한다.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await mobile.newPage();
  await loginAsPhotographer(phone);
  await mock(phone);
  await phone.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=1`);
  await expect(phone.locator('[data-photo-id="p43"]')).toBeVisible();
  await expect(phone.locator('[data-photo-id="p43"]').getByRole("button", { name: "찜하기" })).toBeHidden();
  await mobile.close();
});

test("selecting a card pops only at the moment it turns on", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  // 이미 선택돼 있던 사진(p1·p2)이 있는 장면을 열어도 처음 그려질 때 튀지 않는다.
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await expect(page.locator('.gl-photo-card[data-photo-id="p1"]').getByRole("img", { name: "2장 선택" })).toBeVisible();
  await expect(page.locator(".gl-photo-card[data-pop]")).toHaveCount(0);

  const card = page.locator('.gl-photo-card[data-photo-id="p5"]');
  await card.getByRole("button", { name: "선택", exact: true }).click();
  await expect(card).toHaveAttribute("data-pop", "");
  await expect(card).toHaveClass(/gl-selected/);
  await expect(card).not.toHaveAttribute("data-pop");
  // 해제할 때는 조용하다.
  await card.getByRole("button", { name: "선택 해제" }).click();
  await expect(card).not.toHaveClass(/gl-selected/);
  await expect(page.locator(".gl-photo-card[data-pop]")).toHaveCount(0);
  await context.close();
});

test("mock analysis also shows similar-cut groups and blur/eyes-closed flags", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await expect(page.getByRole("switch", { name: /유사컷 묶기/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  // 묶음 표지의 사진을 누르면(펼치지 않고) 바로 상세가 열린다. 펼치기는 ⧉ 배지로만 한다.
  const cover = page.locator('.gl-photo-card[data-photo-id="p8"]');
  await expect(cover.getByRole("button", { name: "유사컷 3장 펼치기" })).toBeVisible();
  await expect(page.locator(".gl-quality-badge").first()).toBeVisible();
  await cover.click();
  await expect(page.getByRole("dialog", { name: "S_8.jpg 상세 보기" })).toBeVisible();
  await expect(page.locator('[class*="detailCount"]')).toContainText("비슷한 사진 1/3");
  await page.keyboard.press("Escape");
  await expect(page.locator('.gl-photo-card[data-photo-id="p9"]')).toHaveCount(0);

  // 흔들림 사진 빼기: 첫 장면(30장)의 흔들림 3장만 뺀다 — 눈 감음 2장은 남는다(묶음을 끄고 전체에서).
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await page.getByRole("switch", { name: /유사컷 묶기/ }).click();
  await expect(page.locator("[data-photo-id]")).toHaveCount(30);
  await page.getByRole("switch", { name: /흔들림 사진 빼기/ }).click();
  await expect(page.getByRole("switch", { name: /흔들림 사진 빼기/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[class*="toolsNote"]')).toContainText("흔들림 3장 빼고 보는 중");
  // 켠 옵션 수가 보기 옵션 버튼에 보인다(유사컷 묶기 끔 · 빼기 켬 = 1).
  await expect(page.getByRole("button", { name: "보기 옵션" })).toHaveText("1");
  await expect(page.locator("[data-photo-id]")).toHaveCount(27);
  await expect(page.locator(".gl-quality-badge-blur")).toHaveCount(0);
  // 다시 켠 채로 들어와도 기억한다(아래). 끄기 전에 새로고침해 확인한다.
  // 다시 켠 채로 들어와도 기억한다(기기별 보기 설정).
  await page.reload();
  await expect(page.locator('[class*="toolsNote"]')).toContainText("빼고 보는 중");
  await expect(page.locator('[class*="toolsNote"]').getByRole("button", { name: "따로 보기" })).toHaveCount(0);
  // 유사컷 묶기를 끈 것도 기억한다.
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await expect(page.getByRole("switch", { name: /유사컷 묶기/ })).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  // 끄기: 뺀 5장이 이유 표시와 함께 돌아온다.
  await page.getByRole("button", { name: "끄기" }).click();
  await expect(page.locator('[class*="toolsNote"]')).toHaveCount(0);
  await expect(page.locator("[data-photo-id]")).toHaveCount(30);
  // 카드에는 흔들림만 보이고, 눈 감음은 카드에 표시하지 않는다(상세 안내·묶음 안 순서로만).
  await expect(page.locator(".gl-quality-badge-blur")).toHaveCount(3);
  for (const eyes of await page.locator(".gl-quality-badge-eyes").all()) await expect(eyes).toBeHidden();

  // 정리 전(none)에는 가짜 결과가 붙지 않는다.
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=none`);
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await expect(page.getByRole("switch", { name: /유사컷 묶기/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /유사컷 \d+장 펼치기/ })).toHaveCount(0);
  await expect(page.locator(".gl-quality-badge")).toHaveCount(0);
  await context.close();
});

test("detail moves by gallery stops and browses a folded group with up/down and the filmstrip", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  // 첫 장면 30장 중 유사컷 4묶음(각 3장)이 접혀 22칸. p8~p10은 표지(p8) 한 칸이다.
  await expect(page.locator('.gl-photo-card[data-photo-id="p9"]')).toHaveCount(0);
  await page.locator('.gl-photo-card[data-photo-id="p7"]').click();
  const count = page.locator('[class*="detailCount"]');
  await expect(count).toContainText("6 / 22");

  // ‹ › 는 묶음을 한 칸으로 지나고, 묶음 안에서는 ↑↓ 로 넘긴다. 눈 감음 의심(p9)은 묶음 맨 뒤.
  await page.keyboard.press("ArrowRight");
  await expect(count).toContainText("7 / 22 · 비슷한 사진 1/3");
  await page.keyboard.press("ArrowDown");
  await expect(count).toContainText("7 / 22 · 비슷한 사진 2/3");
  await expect(page.getByRole("dialog", { name: "S_10.jpg 상세 보기" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("dialog", { name: "S_9.jpg 상세 보기" })).toBeVisible();
  await expect(page.locator('[class*="stripRow"]').getByRole("button", { name: "S_9.jpg 보기" }).getByLabel("눈 감음 의심")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(count).toContainText("8 / 22");
  await expect(count).not.toContainText("비슷한 사진");

  // 띠도 같은 칸 순서: 다른 묶음은 겹친 썸네일 한 칸, 누르면 그 묶음의 표지부터 본다.
  const strip = page.locator('[class*="stripRow"]');
  await expect(strip.getByRole("button", { name: "S_11.jpg 보기" })).toHaveAttribute("aria-current", "true");
  await expect(strip.getByRole("button", { name: "S_8.jpg 외 비슷한 사진 2장 보기" })).toBeVisible();
  // p16~p18 묶음은 흔들림 의심(p16)이 맨 뒤라 표지가 p17이다.
  await strip.getByRole("button", { name: "S_17.jpg 외 비슷한 사진 2장 보기" }).click();
  await expect(count).toContainText("13 / 22 · 비슷한 사진 1/3");
  await expect(strip.locator('[class*="stripGroup"]').filter({ hasText: "비슷한 사진 3장" })).toHaveCount(1);
  await strip.getByRole("button", { name: "S_16.jpg 보기" }).click();
  await expect(count).toContainText("13 / 22 · 비슷한 사진 3/3");
  await context.close();
});

test("detail continues across scene boundaries in both directions", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await page.locator('.gl-photo-card[data-photo-id="p29"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/scene=1/);
  await expect(page.getByRole("dialog", { name: "S_30.jpg 상세 보기" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "입장" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/scene=0/);
  await expect(page.getByRole("dialog", { name: "S_29.jpg 상세 보기" })).toBeVisible();
  await context.close();
});

test("detail skips scenes without photos in the current filter", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project();
  data.selectedIds.push("p60");
  await mock(page, data);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await page.getByRole("button", { name: "✓ 최종 선택" }).click();
  await page.locator('.gl-photo-card[data-photo-id="p1"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/scene=2/);
  await expect(page.getByRole("dialog", { name: "S_60.jpg 상세 보기" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/scene=0/);
  await context.close();
});

test("review detail follows the displayed scene order", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project();
  data.selectedIds = ["p29", "p30", "p60"];
  data.photos.unshift(data.photos.splice(60, 1)[0]); // 저장 배열 순서는 장면 순서와 다르다.
  await mock(page, data);
  await page.goto(`/customer-select/${PROJECT_ID}/review?mockAnalysis=ready`);
  await page.getByRole("button", { name: "S_29.jpg 크게 보기" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "S_30.jpg 상세 보기" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "다음 장면 · 입장" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "S_60.jpg 상세 보기" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "S_30.jpg 상세 보기" })).toBeVisible();
  await context.close();
});

test("a collapsed cover can be picked directly; the badge shows the group's picks", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  // p1·p2를 고른 첫 묶음(p0~p2)의 표지는 고른 사진(p1). 고른 장수는 ✓ 자리(왼쪽 위)에 `✓ 2`, 묶음 배지는 ⧉ 3 만.
  const cover = page.locator('.gl-photo-card[data-photo-id="p1"]');
  const picks = cover.getByRole("img", { name: "2장 선택" });
  await expect(picks).toHaveText("2");
  const [coverBox, picksBox] = [(await cover.boundingBox())!, (await picks.boundingBox())!];
  expect(picksBox.x - coverBox.x).toBeLessThan(24);
  expect(picksBox.y - coverBox.y).toBeLessThan(24);
  await expect(cover.getByRole("button", { name: "유사컷 3장 펼치기" })).toHaveText("3");
  await expect(cover.locator('[data-active="true"]')).toHaveCount(1);

  // 고른 사진이 없는 묶음도 펼치지 않고 표지(앞의 대표 사진)를 바로 최종 선택한다.
  const plain = page.locator('.gl-photo-card[data-photo-id="p8"]');
  await expect(plain.locator('[data-active="true"]')).toHaveCount(0);
  await plain.hover();
  await plain.getByRole("button", { name: "선택", exact: true }).click();
  // 선택 순간(data-pop)에도 표지 뒤 회색 카드(::after)는 사진 뒤에 머문다 — 사진을 덮지 않는다.
  expect(await plain.evaluate((element) => { const after = getComputedStyle(element, "::after"); return [element.hasAttribute("data-pop"), after.zIndex, after.animationName]; })).toEqual([true, "0", "none"]);
  await expect(plain.getByRole("img", { name: "1장 선택" })).toBeVisible();
  await expect(plain.locator('[data-active="true"]')).toHaveCount(1);
  // ✓ 1 을 다시 누르면 표지 사진 선택이 풀린다(배지는 표시만, 아래 ✓가 눌린다).
  await plain.getByRole("img", { name: "1장 선택" }).click();
  await expect(plain.getByRole("img", { name: /장 선택/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /상세 보기/ })).toHaveCount(0);
  // 찜(♡)도 ✓처럼 표지 사진 한 장 — 펼치지 않고 표지에서 바로 찜한다.
  await plain.hover();
  await plain.getByRole("button", { name: /^찜하기/ }).click();
  await expect(plain.getByRole("button", { name: /^찜 해제 · 1명 찜/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /상세 보기/ })).toHaveCount(0);
  await context.close();
});

test("selected photos keep their original brightness", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=none`);
  const card = page.locator('.gl-photo-card[data-photo-id="p1"]');
  await expect(card).toHaveClass(/gl-selected/);
  await expect(card.locator(".gl-card-media img")).toHaveCSS("filter", "none");
  await context.close();
});

test("owner like sits bottom-left and quality flags stay at the top-right edge", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  // p5는 흔들림 의심. ♡는 왼쪽 아래라 오른쪽 위 표시는 찜해도 움직이지 않는다.
  const card = page.locator('.gl-photo-card[data-photo-id="p5"]');
  const flag = card.locator(".gl-quality-badge");
  await card.hover();
  const like = card.getByRole("button", { name: "찜하기" });
  const [cardBox, likeBox] = [(await card.boundingBox())!, (await like.boundingBox())!];
  expect(likeBox.x - cardBox.x).toBeLessThan(12);
  expect(cardBox.y + cardBox.height - (likeBox.y + likeBox.height)).toBeLessThan(12);
  await like.click();
  await page.mouse.move(0, 0);
  await expect(card.getByRole("button", { name: "찜 해제" })).toHaveAttribute("aria-pressed", "true");
  await expect(flag).toHaveCSS("transform", "none");
  await context.close();
});

test("set-aside never hides a photo that is already picked", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await page.getByRole("switch", { name: /유사컷 묶기/ }).click();
  await page.keyboard.press("Escape");
  // p5(흔들림 의심)를 먼저 고른 뒤 빼기를 켜면 p5는 남는다.
  await page.locator('.gl-photo-card[data-photo-id="p5"]').getByRole("button", { name: "선택", exact: true }).click();
  await page.getByRole("button", { name: "보기 옵션" }).click();
  await page.getByRole("switch", { name: /흔들림 사진 빼기/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('.gl-photo-card[data-photo-id="p5"]')).toBeVisible();
  await expect(page.locator('[class*="toolsNote"]')).toContainText("흔들림 2장 빼고 보는 중");
  await page.getByRole("button", { name: "끄기" }).click();
  await context.close();
});

test("only decided marks stay on cards: empty check shows on hover, my own like dot is not repeated", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=none`);
  const card = page.locator('.gl-photo-card[data-photo-id="p5"]');
  const check = card.getByRole("button", { name: "선택", exact: true });
  await page.mouse.move(0, 0);
  await expect(check).toHaveCSS("opacity", "0");
  await expect(page.locator('.gl-photo-card[data-photo-id="p1"]').getByRole("button", { name: "선택 해제" })).toHaveCSS("opacity", "1");
  await card.hover();
  await expect(check).toHaveCSS("opacity", "1");
  // 내가 찜하면 ♥만 남고 내 색 점은 따로 보이지 않는다.
  await card.getByRole("button", { name: "찜하기" }).click();
  await expect(card.getByRole("button", { name: "찜 해제" })).toBeVisible();
  await expect(card.locator(".gl-color-dot")).toHaveCount(0);
  await context.close();
});

test("likes show as one heart with a count; names on hover", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project();
  data.participantNicknames = { red: "소유자", blue: "엄마", green: "아빠", yellow: "언니" } as typeof data.participantNicknames;
  data.photoStates = { p5: { color: ["blue", "green", "yellow"] } } as typeof data.photoStates;
  await mock(page, data);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=none`);
  const card = page.locator('.gl-photo-card[data-photo-id="p5"]');
  await page.mouse.move(0, 0);
  // 색 점 대신 왼쪽 아래 `♥ 3` — 찜이 있으면 마우스 없이도 보인다.
  const chip = card.getByRole("button", { name: "찜하기 · 3명 찜" });
  await expect(chip).toHaveText("3");
  await expect(chip).toHaveCSS("opacity", "1");
  await expect(chip).toHaveAttribute("title", "엄마, 아빠, 언니");
  await expect(card.locator(".gl-color-dot")).toHaveCount(0);
  // 내가 찜하면 4로 늘고 주황으로 채워진다.
  await chip.click();
  await expect(card.getByRole("button", { name: "찜 해제 · 4명 찜" })).toHaveText("4");
  await context.close();
});

test("a single similar-cut group can be expanded from its badge", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  // p8~p10 묶음만 배지로 펼친다. 다른 묶음(p16~p18)은 그대로 접혀 있다.
  await page.locator('.gl-photo-card[data-photo-id="p8"]').getByRole("button", { name: "유사컷 3장 펼치기" }).click();
  await expect(page.locator('.gl-photo-card[data-photo-id="p9"]')).toBeVisible();
  await expect(page.locator('.gl-photo-card[data-photo-id="p10"]')).toBeVisible();
  await expect(page.locator('.gl-photo-card[data-photo-id="p18"]')).toHaveCount(0);
  await expect(page.locator('.gl-photo-card[data-photo-id="p8"]').getByRole("button", { name: "유사컷 3장 접기" })).toHaveText("접기");
  await expect(page.locator('.gl-photo-card[data-photo-id="p9"]').getByRole("button", { name: /유사컷/ })).toHaveCount(0);
  // 펼친 사진은 바로 고를 수 있고, 상세에서는 한 장씩 넘어간다(22칸 → 24칸).
  await page.locator('.gl-photo-card[data-photo-id="p9"]').getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.locator('.gl-photo-card[data-photo-id="p9"]')).toHaveClass(/gl-selected/);
  await page.locator('.gl-photo-card[data-photo-id="p9"]').click();
  // 펼친 묶음도 의심 사진(p9, 눈 감음)을 맨 뒤에 둔다: p8, p10, p9 → p9는 9번째.
  await expect(page.locator('[class*="detailCount"]')).toContainText("9 / 24");
  await expect(page.locator('[class*="detailCount"]')).not.toContainText("비슷한 사진");
  await page.keyboard.press("Escape");
  // 접기
  await page.locator('.gl-photo-card[data-photo-id="p8"]').getByRole("button", { name: "유사컷 3장 접기" }).click();
  await expect(page.locator('.gl-photo-card[data-photo-id="p10"]')).toHaveCount(0);
  await context.close();
});

test("an expanded group sits on its own row inside one band", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  await page.locator('.gl-photo-card[data-photo-id="p8"]').getByRole("button", { name: "유사컷 3장 펼치기" }).click();
  // p8~p10은 같은 줄에 나란히, 앞(p7)·뒤(p11) 사진과는 다른 줄이다.
  const top = async (id: string) => (await page.locator(`.gl-photo-card[data-photo-id="${id}"]`).boundingBox())!.y;
  const [y7, y8, y9, y10, y11] = await Promise.all(["p7", "p8", "p9", "p10", "p11"].map(top));
  expect(y8).toBe(y9);
  expect(y9).toBe(y10);
  expect(y7).toBeLessThan(y8);
  expect(y11).toBeGreaterThan(y10);
  await expect(page.locator('[class*="groupBand"]')).toHaveCount(1);
  await context.close();
});

test("an expanded group stays together even when its photos are not consecutive in time", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  // p8은 p8~p10 묶음이지만 촬영 시각이 p12 뒤라, 시간순으로는 p9·p10과 떨어져 있다.
  const data = project();
  data.photos[8] = { ...data.photos[8], takenAt: "2026-10-03T11:04:05" };
  await mock(page, data);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  const badge = page.getByRole("button", { name: "유사컷 3장 펼치기" }).nth(1);
  await badge.click();
  const top = async (id: string) => (await page.locator(`.gl-photo-card[data-photo-id="${id}"]`).boundingBox())!.y;
  const [y8, y9, y10] = await Promise.all(["p8", "p9", "p10"].map(top));
  expect(y8).toBe(y9);
  expect(y9).toBe(y10);
  await expect(page.locator('[class*="groupBand"]')).toHaveCount(1);
  await context.close();
});

test("filter bar: scope segments with counts, like scope menu, and scene progress", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project();
  data.participantNicknames = { red: "소유자", blue: "엄마" } as typeof data.participantNicknames;
  data.photoStates = { p3: { color: ["blue"] }, p4: { color: ["blue", "red"] }, p40: { color: ["red"] } } as typeof data.photoStates;
  await mock(page, data);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=none&scene=0`);
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=ready&scene=0`);
  const scopes = page.getByRole("group", { name: "보기 범위" });
  // 지금 장면(30장) 기준: 누구든 찜 2장(p3·p4), 고른 사진 2장(p1·p2).
  await expect(scopes.getByRole("button", { name: "전체", exact: true })).toContainText("30");
  await expect(scopes.getByRole("button", { name: "♥ 찜한 사진" })).toContainText("2");
  await expect(scopes.getByRole("button", { name: "✓ 최종 선택" })).toContainText("2");
  await scopes.getByRole("button", { name: "♥ 찜한 사진" }).click();
  await expect(page.locator(".gl-photo-card[data-photo-id]")).toHaveCount(2);
  // ▾ 메뉴에서 내 찜(p4)·2명 이상(p4)으로 좁힌다.
  await scopes.getByRole("button", { name: "찜 범위 바꾸기" }).click();
  await page.getByRole("menuitemradio", { name: /내 찜/ }).click();
  await expect(scopes.getByRole("button", { name: "♡ 내 찜" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gl-photo-card[data-photo-id]")).toHaveCount(1);
  // 장면 목록: 장면마다 ♥ 찜 수 · ✓ 고른 수/목표.
  const rail = page.getByRole("navigation", { name: "장면" }).first();
  await expect(rail.getByRole("button", { name: /식전·신부 대기실/ })).toContainText("♥2");
  await expect(rail.getByRole("button", { name: /식전·신부 대기실/ })).toContainText("✓2/3");
  await expect(rail.getByRole("button", { name: /입장/ })).toContainText("♥1");
  await context.close();
});

test("real AI scenes: named scenes from the server, new photos collected, re-tidy sends the scene catalog", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project() as ReturnType<typeof project> & { aiScenes?: unknown };
  // 서버 장면 2개(p0~p29 입장, p30~p59 예식) — p60~p89는 정리 뒤 새로 올린 사진이라 어느 장면에도 없다.
  data.aiScenes = [
    { name: "입장", start: data.photos[0].takenAt, end: data.photos[29].takenAt, photoIds: data.photos.slice(0, 30).map((photo) => photo.id) },
    { name: "예식", start: data.photos[30].takenAt, end: data.photos[59].takenAt, photoIds: data.photos.slice(30, 60).map((photo) => photo.id) },
  ];
  await mock(page, data);
  const started: { kind: string | undefined; body: unknown }[] = [];
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}/ai/*`, async (route) => {
    if (route.request().method() === "POST") {
      started.push({ kind: new URL(route.request().url()).pathname.split("/").pop(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { status: "processing" } });
    }
    return route.fulfill({ json: { status: "completed" } });
  });
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=off`);
  const rail = page.getByRole("navigation", { name: "장면" }).first();
  await expect(rail.getByRole("button", { name: /^입장/ })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^예식/ })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^새로 올린 사진/ })).toBeVisible();

  await page.getByRole("button", { name: "보기 옵션" }).click();
  const retidy = page.getByRole("button", { name: /AI 다시 정리/ });
  await expect(retidy).toContainText("새로 올린 30장");
  await retidy.click();
  await page.getByRole("button", { name: "정리 시작" }).click();
  await expect.poll(() => started.length).toBeGreaterThan(0);
  // 장면 정리는 별도 실행(scene)이고 장면 이름 목록은 그 요청에만 실린다.
  const scene = started.find((item) => item.kind === "scene")?.body as { sceneNames: string[] };
  expect(scene.sceneNames).toContain("식전·신부 대기실");
  expect(started.map((item) => item.kind).sort()).toEqual(["quality", "scene", "similarity"]);
  await context.close();
});

// 진행 중 실행 응답: 장면은 이름 붙일 장면 6개 중 3개, 유사컷 90장 중 30장, 흔들림 90장 중 60장.
const RUNNING: Record<string, { image_count: number; processed_count: number }> = {
  scene: { image_count: 6, processed_count: 3 }, similarity: { image_count: 90, processed_count: 30 }, quality: { image_count: 90, processed_count: 60 },
};

test("analysis banner shows each running step separately", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}/ai/*`, (route) => {
    const kind = new URL(route.request().url()).pathname.split("/").pop()!;
    return route.fulfill({ json: { status: "processing", run: RUNNING[kind] } });
  });
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=off`);
  const banner = page.getByRole("status").filter({ hasText: "AI가 장면을 나누고 있어요" });
  await expect(banner).toContainText("장면 이름 붙이는 중 · 3 / 6");
  await expect(banner).toContainText("비슷한 사진 묶는 중 · 30 / 90장");
  await expect(banner).toContainText("흔들림·눈 감음 확인 중 · 60 / 90장");
  await context.close();
});

test("scenes show before similar-photo grouping finishes", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  const data = project() as ReturnType<typeof project> & { aiScenes?: unknown };
  data.aiScenes = [
    { name: "입장", start: data.photos[0].takenAt, end: data.photos[44].takenAt, photoIds: data.photos.slice(0, 45).map((photo) => photo.id) },
    { name: "예식", start: data.photos[45].takenAt, end: data.photos[89].takenAt, photoIds: data.photos.slice(45, 90).map((photo) => photo.id) },
  ];
  await mock(page, data);
  // 장면 정리는 끝났고 유사컷 묶기만 진행 중 → 장면은 바로 보이고, 유사컷 진행은 장면 목록 아래 한 줄로.
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}/ai/*`, (route) => {
    const kind = new URL(route.request().url()).pathname.split("/").pop()!;
    if (kind === "similarity") return route.fulfill({ json: { status: "processing", run: RUNNING.similarity } });
    return route.fulfill({ json: { status: "completed", run: { image_count: 2, processed_count: 2, failed_count: 0 } } });
  });
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=off`);
  const rail = page.getByRole("navigation", { name: "장면" }).first();
  await expect(rail.getByRole("button", { name: /^입장/ })).toBeVisible();
  await expect(rail.getByRole("status")).toHaveText("비슷한 사진 묶는 중 · 30 / 90장");
  await expect(page.getByText("AI가 장면을 나누고 있어요")).toHaveCount(0);
  await context.close();
});

test("a step that fails to start is named, and runs that finish before the first poll still refresh the project", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await loginAsPhotographer(page);
  await mock(page);
  let projectReads = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname.endsWith(`/projects/${PROJECT_ID}`)) projectReads += 1;
  });
  let started = false;
  await page.route(`**/api/customer-select/projects/${PROJECT_ID}/ai/*`, (route) => {
    const kind = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "POST") {
      started = true;
      // 흔들림 확인만 시작 실패, 나머지는 시작 — 시작한 작업은 첫 조회 전에 이미 끝난다(캐시 재사용 등).
      return kind === "quality" ? route.fulfill({ status: 503, json: { error: "down" } }) : route.fulfill({ status: 202, json: { status: "processing" } });
    }
    return route.fulfill({ json: started && kind !== "quality" ? { status: "completed", run: { image_count: 0, processed_count: 0, failed_count: 0 } } : { status: null } });
  });
  await page.goto(`/customer-select/${PROJECT_ID}/select?mockAnalysis=off`);
  await page.getByRole("button", { name: "AI로 장면 정리" }).click();
  await page.getByRole("button", { name: "정리 시작" }).click();
  await expect(page.getByRole("dialog", { name: "AI로 사진 정리" }).getByRole("alert")).toContainText("흔들림·눈 감음 확인을(를) 시작하지 못했어요. 나머지는 진행 중이에요.");
  const readsAfterStart = projectReads;
  await expect.poll(() => projectReads).toBeGreaterThan(readsAfterStart);
  await context.close();
});
