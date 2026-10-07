import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

// 상세 화면 안전장치: 보이는 사진과 고르는 사진이 어긋나지 않기, 사진을 못 불러올 때 이전 사진 유지, 메모 저장 실패 보관.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const img = (name: string) => `http://localhost:3001/__e2e-img/${name}.png`;

async function setup(page: Page, { holdThumbs = false } = {}) {
  await loginAsPhotographer(page);
  const photos = ["d1", "d2", "d3"].map((id, index) => ({
    id, projectId: "detail-safety", orderIndex: index, url: img(`${id}-thumb`), previewUrl: img(id), originalFilename: `${id.toUpperCase()}.jpg`,
  }));
  const project = {
    id: "detail-safety", name: "상세 안전장치", shootType: "wedding", target: 3, photoCount: photos.length, uploaded: true,
    photos, selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: {}, participantNicknames: { red: "소유자" },
    shareToken: "", shareEnabled: true, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  };
  await page.route("**/api/customer-select/projects/detail-safety", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { isOwner: true, project } });
  });
  await page.route("**/api/customer-select/projects/detail-safety/sync", (route) => route.fulfill({ json: {
    selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: {}, participantNicknames: { red: "소유자" },
    onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  } }));
  await page.route("**/api/customer-select/projects/detail-safety/presence", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/detail-safety/participants", (route) => route.fulfill({ json: { ok: true } }));
  // 큰 사진 요청은 테스트가 직접 풀어 준다(늦게 오기·실패).
  const held = new Map<string, Route>();
  let failing = new Set<string>();
  await page.route("**/__e2e-img/**", async (route) => {
    const name = route.request().url().split("/").pop()!.replace(".png", "");
    // d1(처음 여는 사진)은 바로 준다. 썸네일은 holdThumbs면 d1 것만 바로 주고 나머지는 붙잡는다.
    if (name === "d1" || name === "d1-thumb" || (name.endsWith("-thumb") && !holdThumbs)) return route.fulfill({ body: PNG, contentType: "image/png" });
    if (failing.has(name)) return route.abort();
    held.set(name, route);
  });
  return {
    release: async (name: string) => { await expect.poll(() => held.has(name)).toBe(true); await held.get(name)!.fulfill({ body: PNG, contentType: "image/png" }); held.delete(name); },
    fail: (names: string[]) => { failing = new Set(names); },
  };
}

test("next photo: until its thumbnail or full image arrives, name, state and buttons stay with the photo on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const images = await setup(page, { holdThumbs: true });
  // 썸네일 요청을 일부러 붙잡아 두므로 load 이벤트까지 기다리면 영영 끝나지 않는다.
  await page.goto("/customer-select/detail-safety/select", { waitUntil: "domcontentloaded" });
  await page.locator('.gl-photo-card[data-photo-id="d1"]').click();
  const pick = page.getByRole("button", { name: "최종 선택", exact: true });
  await expect(pick).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  // d2 이미지가 오기 전: 화면은 아직 d1 — 이름·버튼도 d1이고, 이때 고르면 보이는 사진(d1)이 골라진다.
  await expect(page.getByRole("status", { name: "다음 사진을 불러오는 중" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "D1.jpg 상세 보기" })).toBeVisible();
  await page.keyboard.press(" ");
  await expect(page.locator('.gl-photo-card[data-photo-id="d1"]')).toHaveClass(/gl-selected/);
  await expect(page.locator('.gl-photo-card[data-photo-id="d2"]')).not.toHaveClass(/gl-selected/);
  // 작은 썸네일이 먼저 오면 바로 d2로 바뀐다(이름·상태·버튼도 함께) — 큰 사진은 뒤이어 선명하게.
  await images.release("d2-thumb");
  await expect(page.getByRole("dialog", { name: "D2.jpg 상세 보기" })).toBeVisible();
  await expect(page.locator('[role="dialog"] [class*="detailImage"] img')).toHaveAttribute("src", /d2-thumb\.png$/);
  await expect(pick).toBeEnabled();
  await images.release("d2");
  await expect(page.locator('[role="dialog"] [class*="detailImage"] img')).toHaveAttribute("src", /d2\.png$/);
});

test("full image that fails to load stays on the thumbnail and offers a retry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const images = await setup(page);
  images.fail(["d2"]);
  await page.goto("/customer-select/detail-safety/select");
  await page.locator('.gl-photo-card[data-photo-id="d1"]').click();
  await page.keyboard.press("ArrowRight");
  const error = page.getByRole("alert").filter({ hasText: "불러오지 못했어요" });
  await expect(error).toBeVisible();
  // 깨진 사진으로 바꾸지 않고 받아 둔 썸네일을 그대로 둔다.
  await expect(page.locator('[role="dialog"] [class*="detailImage"] img')).toHaveAttribute("src", /d2-thumb\.png$/);
  await expect(page.getByRole("dialog", { name: "D2.jpg 상세 보기" })).toBeVisible();
  images.fail([]);
  await error.getByRole("button", { name: "다시 시도" }).click();
  await images.release("d2");
  await expect(error).toHaveCount(0);
  await expect(page.locator('[role="dialog"] [class*="detailImage"] img')).toHaveAttribute("src", /d2\.png$/);
  await expect(page.getByRole("dialog", { name: "D2.jpg 상세 보기" })).toBeVisible();
});

test("memo that fails to save stays after closing the detail and can be saved again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  let saveOk = false;
  const saved: unknown[] = [];
  await page.route("**/api/customer-select/projects/detail-safety/selections", async (route) => {
    const body = route.request().postDataJSON();
    if (!saveOk) return route.fulfill({ status: 500, json: { error: "down" } });
    saved.push(body);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/customer-select/detail-safety/select");
  await page.locator('.gl-photo-card[data-photo-id="d1"]').click();
  const memo = page.getByRole("textbox", { name: "작가 전달 메모" });
  await memo.fill("배경 사람 지워주세요");
  await expect(page.getByRole("status").filter({ hasText: "저장하지 못했어요" })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // 상세를 닫아도 안내가 남고, 쓴 글은 버리지 않는다.
  const banner = page.getByRole("alert").filter({ hasText: "메모 1개를 저장하지 못했어요" });
  await expect(banner).toBeVisible();
  await page.locator('.gl-photo-card[data-photo-id="d1"]').click();
  await expect(memo).toHaveValue("배경 사람 지워주세요");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  saveOk = true;
  await banner.getByRole("button", { name: "다시 저장" }).click();
  await expect(banner).toHaveCount(0);
  expect(saved).toContainEqual(expect.objectContaining({ photo_id: "d1", comment: "배경 사람 지워주세요" }));
});

test("mobile: dragging down moves the photo with the finger, springs back when short, closes when far enough", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addInitScript(() => { try { localStorage.setItem("ps:self-select-swipe-hint", "1"); } catch {} });
  const page = await context.newPage();
  await setup(page);
  await page.goto("/customer-select/detail-safety/select");
  await page.locator('.gl-photo-card[data-photo-id="d1"]').click();
  const dialog = page.getByRole("dialog", { name: "D1.jpg 상세 보기" });
  await expect(dialog).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }] });
  const stage = dialog.locator('[class*="detailImage"]');
  // 천천히 70px 끌면: 사진이 따라 내려오고, 놓으면 제자리로 돌아온다.
  await touch("touchStart", 300);
  for (let y = 310; y <= 370; y += 10) { await touch("touchMove", y); await page.waitForTimeout(40); }
  expect(await stage.evaluate((element) => element.style.transform)).toContain("translateY(70px)");
  await touch("touchEnd", 370);
  await expect(dialog).toBeVisible();
  await expect.poll(() => stage.evaluate((element) => element.style.transform)).toBe("");
  // 천천히 200px 끌면 놓을 때 닫힌다.
  await touch("touchStart", 300);
  for (let y = 320; y <= 500; y += 20) { await touch("touchMove", y); await page.waitForTimeout(40); }
  await touch("touchEnd", 500);
  await expect(dialog).toHaveCount(0);
  await context.close();
});
