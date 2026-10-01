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
      selectedIds: ["p1"], photoStates: { p1: { color: ["blue"], comment: "표정이 좋아요" } },
      participantOpinions: { p1: { blue: { rating: 4 } } },
      participantDone: { red: false, blue: false }, participantNicknames: { red: "나", blue: "동행" },
      shareToken: "", shareEnabled: true, exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/role-check/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/role-check/sync", async (route) => route.fulfill({ json: {
    selectedIds: ["p1"], photoStates: { p1: { color: ["blue"], comment: "표정이 좋아요" } }, participantOpinions: { p1: { blue: { rating: 4 } } },
    participantDone: { red: false, blue: false }, participantNicknames: { red: "나", blue: "동행" }, onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null,
  } }));
  await page.route("**/api/customer-select/projects/role-check/selections", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/customer-select/role-check/select");
    // 참여자의 메인 동작은 찜(♡)이다. 최종 선택 체크와 보내기 행동은 보이지 않는다.
    await expect(page.getByRole("button", { name: "다 골랐어요" })).toBeVisible();
    await expect(page.getByRole("button", { name: /작가에게 보내기/ })).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"] .gl-check-box:not(.gl-check-heart)')).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"] .gl-check-heart')).toHaveCount(1);

    await page.locator('[data-photo-id="p1"]').click();
    const memo = page.getByRole("textbox", { name: "작가 전달 메모" });
    await expect(memo).toHaveValue("표정이 좋아요");
    await memo.fill("참여자 자동저장 확인");
    await memo.blur();
    await expect(page.locator('[role="status"]:visible').filter({ hasText: "저장됨" })).toBeVisible();
    await expect(page.getByRole("button", { name: /보정 받/ })).toHaveCount(0);
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
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
  await expect(page.getByText(/사진 고르기에 초대했어요/)).toBeVisible();
  // 이름만 입력하면 남은 색(사용 중인 파랑 제외)이 자동으로 배정된다.
  await page.getByRole("button", { name: "바꾸기" }).click();
  await expect(page.getByRole("radio", { name: "파랑" })).toHaveCount(0);
  await page.getByPlaceholder("예: 엄마, 신랑, 지우").fill("신부");
  await page.getByRole("button", { name: "시작하기" }).click();

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
  await page.getByRole("button", { name: "전에 참여했나요? 이어서 하기" }).click();
  await page.getByRole("button", { name: "신랑", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("신랑님으로 이어서 할까요?")).toBeVisible();
  await dialog.getByRole("button", { name: "이어서 하기", exact: true }).click();

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
