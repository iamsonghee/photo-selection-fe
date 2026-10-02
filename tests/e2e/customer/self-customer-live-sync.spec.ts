import { test, expect, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

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
  let sharedComment = "";
  const online = new Set<string>();
  const views: Record<string, string | null> = {};
  const project = () => ({
    id: "live-sync", name: "실시간 확인", shootType: "wedding", target: 30, photoCount: 1, uploaded: true, realtimeKey: "live-sync-e2e",
    // 빈 src는 개발 모드 오류 배지를 띄워 하단 버튼을 덮는다 — 1픽셀 이미지를 쓴다.
    photos: [{ id: "p1", projectId: "live-sync", orderIndex: 0, url: PIXEL, previewUrl: PIXEL, originalFilename: "A001.jpg" }],
    selectedIds: selected ? ["p1"] : [], photoStates: sharedComment ? { p1: { comment: sharedComment } } : {}, participantOpinions: {},
    participantDone: { red: false, blue: participantDone }, participantNicknames: { red: "소유자", blue: "동행" },
    shareToken: "", shareEnabled: true, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  });
  const collaboration = () => ({
    selectedIds: selected ? ["p1"] : [], photoStates: sharedComment ? { p1: { comment: sharedComment } } : {}, participantOpinions: {},
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
      if (Object.prototype.hasOwnProperty.call(body, "comment")) sharedComment = body.comment ?? "";
      await route.fulfill({ json: { ok: true } });
    });
  }
  await mock(owner, true);
  await mock(participant, false);

  await owner.goto("/customer-select/live-sync/select");
  await participant.goto("/customer-select/live-sync/select");
  // 헤더의 참여자 아바타: 이름·상태는 아바타 이름(aria-label)에 `동행 · 다 골랐어요 · 온라인`처럼 들어 있다.
  const ownerSeesParticipant = owner.getByRole("group", { name: "함께 고르는 사람" }).locator('[aria-label^="동행"]');
  await expect(ownerSeesParticipant).toBeVisible();
  await expect(ownerSeesParticipant).not.toHaveAttribute("aria-label", /다 골랐어요/);
  await participant.getByRole("button", { name: "다 골랐어요" }).click();
  await expect(ownerSeesParticipant).toHaveAttribute("aria-label", /다 골랐어요/, { timeout: 5000 });
  await expect(ownerSeesParticipant).toHaveAttribute("aria-label", /온라인|보는 사진 열기/, { timeout: 5000 });
  await owner.locator('[data-photo-id="p1"] .gl-check-box').click();
  // 참여자는 소유자의 최종 선택을 "✓ 최종 선택" 보기로 확인한다.
  await participant.getByRole("button", { name: "✓ 최종 선택" }).click();
  await expect(participant.locator('[data-photo-id="p1"]')).toBeVisible({ timeout: 5000 });
  await participant.getByRole("button", { name: "모두", exact: true }).click();
  await participant.locator('[data-photo-id="p1"]').click();
  const samePhoto = owner.getByRole("button", { name: /^동행 · .*보는 사진 열기/ }).first();
  await expect(samePhoto).toBeVisible({ timeout: 5000 });
  await samePhoto.click();
  // 모바일 상세의 메모는 `메모 쓰기`를 눌러야 펼쳐진다.
  await participant.getByRole("button", { name: "메모 쓰기" }).click();
  await participant.getByRole("textbox", { name: "작가 전달 메모" }).fill("조금 밝게 부탁드려요");
  await participant.getByRole("textbox", { name: "작가 전달 메모" }).blur();
  // 같은 사진을 보고 있는 소유자 화면에도 공용 메모가 반영된다.
  await expect(owner.getByRole("textbox", { name: "작가 전달 메모" })).toHaveValue("조금 밝게 부탁드려요", { timeout: 5000 });
  // 일시 대화는 당분간 숨긴다(select/page.tsx CHAT_ENABLED) — 다시 켜면 메시지 주고받기 확인을 되살린다.
  await expect(participant.getByRole("button", { name: /대화 열기/ })).toHaveCount(0);
  await expect(owner.getByRole("complementary", { name: "일회성 대화" })).toHaveCount(0);

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
      selectedIds: ["p1"], photoStates: { p1: { comment: '좋아요, "밝게"' } }, participantOpinions: {}, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, shareToken: "", shareEnabled: true,
      exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } } });
  });
  await page.route("**/api/customer-select/projects/delivery-sync/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/presence", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/delivery-sync/sync", async (route) => {
    await route.fulfill({ json: {
      selectedIds: ["p1"], photoStates: { p1: { comment: '좋아요, "밝게"' } }, participantOpinions: {}, participantDone: { red: false, blue: true },
      participantNicknames: { red: "소유자", blue: "동행" }, onlineParticipants: ["red", "blue"], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
    } });
  });
  await page.route("**/api/customer-select/projects/delivery-sync/result-link", async (route) => {
    resultLinkCalls += 1;
    await route.fulfill({ json: { url: "/customer-select/result/delivery-sync/access?result_token=fake" } });
  });

  await page.goto("/customer-select/delivery-sync/export");
  await expect(page.getByRole("heading", { name: "1장을 보낼게요" })).toBeVisible();
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV 다운로드" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe("전달 확인_selections.csv");
  let csv = "";
  for await (const chunk of await csvDownload.createReadStream()) csv += chunk.toString();
  expect(csv).toBe('\ufeff파일명,작가 전달 메모\nA001.jpg,"좋아요, ""밝게"""');

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
