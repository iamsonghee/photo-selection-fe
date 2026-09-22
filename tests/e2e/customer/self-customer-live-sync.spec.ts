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
    exported: false, deliveryCount: 0, lastDeliveredAt: null,
  });

  async function mock(page: Page, isOwner: boolean) {
    await page.route("**/api/customer-select/projects/live-sync", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ json: { isOwner, project: project() } });
    });
    await page.route("**/api/customer-select/projects/live-sync/sync", async (route) => route.fulfill({ json: collaboration() }));
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
  await owner.locator('[data-photo-id="p1"] .gl-check-box').click();
  await expect(participant.locator(".gld-selected-count").first()).toContainText("1", { timeout: 5000 });

  await ownerContext.close();
  await participantContext.close();
});
