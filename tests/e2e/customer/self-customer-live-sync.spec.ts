import { test, expect, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("selection and participant completion sync between sessions without a reload", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const participantContext = await browser.newContext();
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
    id: "live-sync", name: "실시간 확인", shootType: "wedding", target: 30, photoCount: 1, uploaded: true,
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

  await ownerContext.close();
  await participantContext.close();
});

test("delivery refreshes collaboration state immediately before completion", async ({ page }) => {
  await loginAsPhotographer(page);
  let syncCalls = 0;
  let requiredSyncCalls = 0;
  await page.route("**/api/customer-select/projects/delivery-sync", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill(syncCalls >= requiredSyncCalls
        ? { json: { project: { exported: true, deliveryCount: 1, lastDeliveredAt: "2026-09-22T00:00:00Z" } } }
        : { status: 409, json: { error: "sync required" } });
      return;
    }
    await route.fulfill({ json: { isOwner: true, project: {
      id: "delivery-sync", name: "전달 확인", shootType: "wedding", target: 1, photoCount: 1, uploaded: true,
      photos: [{ id: "p1", projectId: "delivery-sync", orderIndex: 0, url: "", previewUrl: "", originalFilename: "A001.jpg" }],
      selectedIds: ["p1"], photoStates: {}, participantOpinions: {}, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, shareToken: "", shareEnabled: true,
      exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } } });
  });
  await page.route("**/api/customer-select/projects/delivery-sync/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/presence", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/sync", async (route) => {
    syncCalls += 1;
    await route.fulfill({ json: {
      selectedIds: ["p1"], photoStates: {}, participantOpinions: {}, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, onlineParticipants: ["red", "blue"], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } });
  });

  await page.goto("/customer-select/delivery-sync/export");
  const deliver = page.getByRole("button", { name: "작가에게 전달했어요" });
  await expect(deliver).toBeEnabled();
  requiredSyncCalls = syncCalls + 1;
  await deliver.click();
  await expect(page.getByText("셀렉 전달 완료")).toBeVisible();
});
