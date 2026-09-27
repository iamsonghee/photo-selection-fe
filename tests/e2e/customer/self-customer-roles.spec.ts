import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("shared participant can leave opinions but cannot change the final selection", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.addInitScript(() => localStorage.setItem("acut:customer-select:identity:role-check", "red"));

  const writes: Array<Record<string, unknown>> = [];
  await page.route("**/api/customer-select/projects/role-check", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { isOwner: false, project: {
      id: "role-check", name: "권한 확인", shootType: "wedding", target: 30, photoCount: 1, uploaded: true,
      photos: [{ id: "p1", projectId: "role-check", orderIndex: 0, url: "", previewUrl: "", originalFilename: "A001.jpg" }],
      selectedIds: ["p1"], photoStates: { p1: { color: ["blue"] } },
      participantOpinions: { p1: { blue: { rating: 4, comment: "표정이 좋아요" } } },
      participantDone: { red: false, blue: false }, participantNicknames: { red: "나", blue: "동행" },
      shareToken: "", shareEnabled: true, exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/role-check/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/role-check/sync", async (route) => route.fulfill({ json: {
    selectedIds: ["p1"], photoStates: { p1: { color: ["blue"] } }, participantOpinions: { p1: { blue: { rating: 4, comment: "표정이 좋아요" } } },
    participantDone: { red: false, blue: false }, participantNicknames: { red: "나", blue: "동행" }, onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  } }));
  await page.route("**/api/customer-select/projects/role-check/selections", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/customer-select/role-check/select");
    await expect(page.getByRole("button", { name: "내 의견 완료" })).toBeVisible();
    await expect(page.getByRole("button", { name: "내 선택 완료" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "최종 검토하기" })).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"] .gl-check-box')).toHaveCount(0);

    await page.locator('[data-photo-id="p1"]').click();
    await expect(width < 768 ? page.getByText("표정이 좋아요").last() : page.getByText("표정이 좋아요").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "사진 선택 해제" })).toHaveCount(0);
    await page.keyboard.press("Space");
  }
  expect(writes.some((body) => "is_selected" in body)).toBe(false);
});

test("first-time participant chooses an available color before entering", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.removeItem("acut:customer-select:identity:join-check"));

  let claim: Record<string, unknown> | null = null;
  const photos = Array.from({ length: 24 }, (_, index) => ({
    id: `p${index + 1}`, projectId: "join-check", orderIndex: index, url: "", previewUrl: "", originalFilename: `A${index + 1}.jpg`,
  }));
  await page.route("**/api/customer-select/projects/join-check", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { isOwner: false, project: {
      id: "join-check", name: "우리 웨딩", shootType: "wedding", target: 30, photoCount: photos.length, uploaded: true,
      photos,
      selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: { blue: false },
      participantNicknames: { blue: "신랑" }, shareToken: "", shareEnabled: true, exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/join-check/participants", async (route) => {
    claim = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/customer-select/projects/join-check/sync", async (route) => route.fulfill({ json: {
    selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: { blue: false }, participantNicknames: { blue: "신랑" }, onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  } }));

  await page.goto("/customer-select/join-check/select");
  await expect(page.getByRole("heading", { name: /함께 참여해 주세요/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "신랑", exact: true })).toBeDisabled();
  await page.getByPlaceholder("예: 신랑, 엄마").fill("신부");
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();

  await expect(page.locator('[data-photo-id="p1"]')).toBeVisible();
  await expect(page.locator("[data-photo-id]")).toHaveCount(24);
  await expect.poll(() => page.locator("[data-photo-id]").evaluateAll((cards) => {
    const firstTop = cards[0]?.getBoundingClientRect().top;
    return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1).length;
  })).toBe(7);
  expect(claim).toMatchObject({ claim: true, color: "red", nickname: "신부" });
  expect(await page.evaluate(() => localStorage.getItem("acut:customer-select:identity:join-check"))).toBe("red");
});

test("participant can continue the same identity on another device", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.removeItem("acut:customer-select:identity:resume-check"));
  let participantWrites = 0;

  await page.route("**/api/customer-select/projects/resume-check", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { isOwner: false, project: {
      id: "resume-check", name: "가족 사진", shootType: "family", target: 20, photoCount: 1, uploaded: true,
      photos: [{ id: "p1", projectId: "resume-check", orderIndex: 0, url: "", previewUrl: "", originalFilename: "A001.jpg" }],
      selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: { red: false, blue: false },
      participantNicknames: { red: "소유자", blue: "신랑" }, shareToken: "", shareEnabled: true, exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/resume-check/participants", async (route) => {
    participantWrites++;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/customer-select/projects/resume-check/sync", async (route) => route.fulfill({ json: {
    selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: { red: false, blue: false }, participantNicknames: { red: "소유자", blue: "신랑" }, onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  } }));

  await page.goto("/customer-select/resume-check/select");
  await page.getByRole("button", { name: /신랑.*이어서 참여/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("신랑님으로 이어서 참여할까요?")).toBeVisible();
  await dialog.getByRole("button", { name: "이어서 참여", exact: true }).click();

  await expect(page.getByText("가족 사진").last()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("acut:customer-select:identity:resume-check"))).toBe("blue");
  expect(participantWrites).toBe(0);
});

test("stopped or replaced invite shows an access-ended screen", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.route("**/api/customer-select/projects/stopped-share", async (route) => {
    await route.fulfill({ status: 403, json: { error: "이 프로젝트에 접근할 권한이 없습니다." } });
  });
  await page.goto("/customer-select/stopped-share/select");
  await expect(page.getByRole("heading", { name: /더 이상 사용할 수 없어요/ })).toBeVisible();
  await expect(page.getByText("새로운 초대 링크를 요청해 주세요", { exact: false })).toBeVisible();
});
