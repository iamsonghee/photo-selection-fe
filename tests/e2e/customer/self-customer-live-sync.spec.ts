import { test, expect, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("selection and participant completion sync between sessions without a reload", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const participantContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  const participant = await participantContext.newPage();
  await loginAsPhotographer(owner);
  await loginAsPhotographer(participant);
  await participant.addInitScript(() => localStorage.setItem("acut:customer-select:identity:live-sync", "blue"));

  let participantDone = false;
  let selected = false;
  const online = new Set<string>();
  const views: Record<string, string | null> = {};
  const project = () => ({
    id: "live-sync", name: "실시간 확인", shootType: "wedding", target: 30, photoCount: 1, uploaded: true, realtimeKey: "live-sync-e2e",
    photos: [{ id: "p1", projectId: "live-sync", orderIndex: 0, url: "", previewUrl: "", originalFilename: "A001.jpg" }],
    selectedIds: selected ? ["p1"] : [], photoStates: {}, participantOpinions: {},
    participantDone: { red: false, blue: participantDone }, participantNicknames: { red: "소유자", blue: "동행" },
    shareToken: "", shareEnabled: true, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  });
  const collaboration = () => ({
    selectedIds: selected ? ["p1"] : [], photoStates: {}, participantOpinions: {},
    participantDone: { red: false, blue: participantDone }, participantNicknames: { red: "소유자", blue: "동행" },
    onlineParticipants: [...online], participantViews: { ...views }, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  });

  async function mock(page: Page, isOwner: boolean) {
    await page.route("**/api/customer-select/projects/live-sync", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ json: { isOwner, project: project() } });
    });
    await page.route("**/api/customer-select/projects/live-sync/sync", async (route) => route.fulfill({ json: collaboration() }));
    await page.route("**/api/customer-select/projects/live-sync/presence", async (route) => {
      const body = route.request().postDataJSON();
      online.add(body.color);
      if (Object.prototype.hasOwnProperty.call(body, "current_photo_id")) views[body.color] = body.current_photo_id;
      await route.fulfill({ json: { ok: true } });
    });
    await page.route("**/api/customer-select/projects/live-sync/participants", async (route) => {
      const body = route.request().postDataJSON();
      if (body.color === "blue" && body.done === true) participantDone = true;
      await route.fulfill({ json: { ok: true } });
    });
    await page.route("**/api/customer-select/projects/live-sync/selections", async (route) => {
      const body = route.request().postDataJSON();
      if (typeof body.is_selected === "boolean") selected = body.is_selected;
      await route.fulfill({ json: { ok: true } });
    });
  }
  await mock(owner, true);
  await mock(participant, false);

  await owner.goto("/customer-select/live-sync/select");
  await participant.goto("/customer-select/live-sync/select");
  await expect(owner.getByText("동행 고르는 중").first()).toBeVisible();
  await participant.getByRole("button", { name: "내 의견 완료" }).click();
  await expect(owner.getByText("동행 완료").first()).toBeVisible({ timeout: 5000 });
  await expect(owner.locator('[class*="participantPill"]').filter({ hasText: "동행" }).first()).toContainText("온라인", { timeout: 5000 });
  await owner.locator('[data-photo-id="p1"] .gl-check-box').click();
  await expect(participant.locator(".gld-selected-count").first()).toContainText("1", { timeout: 5000 });
  await participant.locator('[data-photo-id="p1"]').click();
  const samePhoto = owner.getByRole("button", { name: "동행님이 보는 A001.jpg 열기" }).first();
  await expect(samePhoto).toBeVisible({ timeout: 5000 });
  await samePhoto.click();
  await participant.getByRole("button", { name: "대화 열기" }).click();
  await participant.getByLabel("일회성 메시지").fill("이 사진 같이 볼까요?");
  await expect(owner.getByRole("complementary", { name: "일회성 대화" })).toHaveAttribute("data-chat-connected", "true", { timeout: 10000 });
  const send = participant.getByRole("button", { name: "메시지 보내기" });
  await expect(send).toBeEnabled({ timeout: 10000 });
  await send.click();
  await expect(owner.getByText("이 사진 같이 볼까요?", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(owner.getByText("이 사진 같이 볼까요?", { exact: true })).toBeHidden({ timeout: 10000 });

  await ownerContext.close();
  await participantContext.close();
});

test("result link copy does not complete or lock the project", async ({ page }) => {
  await loginAsPhotographer(page);
  let projectPatches = 0;
  let resultLinkCalls = 0;
  await page.route("**/api/customer-select/projects/delivery-sync", async (route) => {
    if (route.request().method() === "PATCH") {
      projectPatches += 1;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { isOwner: true, project: {
      id: "delivery-sync", name: "전달 확인", shootType: "wedding", target: 1, photoCount: 1, uploaded: true,
      photos: [{ id: "p1", projectId: "delivery-sync", orderIndex: 0, url: "", previewUrl: "", originalFilename: "A001.jpg" }],
      selectedIds: ["p1"], photoStates: {}, participantOpinions: { p1: { blue: { comment: '좋아요, "밝게"' } } }, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, shareToken: "", shareEnabled: true,
      exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } } });
  });
  await page.route("**/api/customer-select/projects/delivery-sync/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/presence", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/sync", async (route) => {
    await route.fulfill({ json: {
      selectedIds: ["p1"], photoStates: {}, participantOpinions: { p1: { blue: { comment: '좋아요, "밝게"' } } }, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, onlineParticipants: ["red", "blue"], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } });
  });
  await page.route("**/api/customer-select/projects/delivery-sync/result-link", async (route) => {
    resultLinkCalls += 1;
    await route.fulfill({ json: { url: "/customer-select/result/delivery-sync/access?result_token=fake" } });
  });

  await page.goto("/customer-select/delivery-sync/export");
  await page.getByText("파일로 내보내기").click();
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV 다운로드" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe("전달 확인_selections.csv");
  let csv = "";
  for await (const chunk of await csvDownload.createReadStream()) csv += chunk.toString();
  expect(csv).toBe('파일명,코멘트\nA001.jpg,"동행: 좋아요, ""밝게"""');

  const [txtDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "TXT 다운로드" }).click(),
  ]);
  expect(txtDownload.suggestedFilename()).toBe("전달 확인_selections.txt");
  let txt = "";
  for await (const chunk of await txtDownload.createReadStream()) txt += chunk.toString();
  expect(txt).toBe("A001.jpg");

  const copyLink = page.getByRole("button", { name: "링크 복사" });
  await expect(copyLink).toBeEnabled();
  await copyLink.click();
  await expect.poll(() => resultLinkCalls).toBe(1);
  expect(projectPatches).toBe(0);
});
