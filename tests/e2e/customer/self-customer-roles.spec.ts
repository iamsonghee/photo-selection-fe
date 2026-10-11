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
    await page.goto("/select/role-check/select");
    // 참여자의 메인 동작은 찜(왼쪽 아래 ♥)이다. 최종 선택 체크(누르기)와 보내기 행동은 보이지 않는다.
    await expect(page.getByRole("button", { name: "다 골랐어요" })).toBeVisible();
    await expect(page.getByRole("button", { name: /선택 완료/ })).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"]').getByRole("button", { name: /^선택/ })).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"]').getByRole("button", { name: /^찜/ })).toHaveCount(1);

    await page.locator('[data-photo-id="p1"]').click();
    // 모바일 상세는 사진 위주 — 메모는 메모 버튼을 눌러야 펼친다.
    if (width < 768) await page.getByRole("button", { name: /^메모 (보기|쓰기)$/ }).dispatchEvent("click"); // dev 서버 Next.js 이슈 배지가 왼쪽 아래를 덮는다
    const memo = page.getByRole("textbox", { name: "작가 전달 메모" });
    await expect(memo).toHaveValue("표정이 좋아요");
    await memo.fill("참여자 자동저장 확인");
    await memo.blur();
    await expect(page.locator('[role="status"]:visible').filter({ hasText: "저장됨" })).toBeVisible();
    await expect(page.getByRole("button", { name: "최종 선택", exact: true })).toHaveCount(0);
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
  }
  expect(writes.some((body) => "is_selected" in body)).toBe(false);
});

test("first-time participant browses before registration and resumes the first like", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.removeItem("acut:customer-select:identity:join-check"));

  let claim: Record<string, unknown> | null = null;
  const likes: Record<string, unknown>[] = [];
  await page.route("**/api/customer-select/projects/join-check/selections", async (route) => {
    likes.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
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

  await page.goto("/select/join-check/select");
  // 이름 없이 탐색한 뒤 첫 찜에서 등록한다. 취소한 찜은 저장하지 않는다.
  // 소유자 이름이 없는 프로젝트라 제목은 "함께 사진을 골라 주세요".
  await expect(page.getByRole("heading", { name: /함께 사진을\s*골라 주세요/ })).toBeVisible();
  await page.getByRole("button", { name: "사진 둘러보기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(claim).toBeNull();
  const firstLike = page.locator('[data-photo-id="p1"]').getByRole("button", { name: "찜하기", exact: true });
  await firstLike.click();
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  expect(claim).toBeNull();
  expect(likes).toHaveLength(0);
  await firstLike.click();
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
  await expect.poll(() => likes.length).toBe(1);
  expect(likes[0]).toMatchObject({ photo_id: "p1", color_op: { color: "red", add: true } });
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

  await page.goto("/select/resume-check/select");
  await page.getByRole("button", { name: "전에 참여했나요? 이어서 하기" }).click();
  await page.getByRole("button", { name: "신랑", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("신랑님으로 이어서 할까요?")).toBeVisible();
  await dialog.getByRole("button", { name: "이어서 하기", exact: true }).click();

  await expect(page.getByText("가족 사진").last()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("acut:customer-select:identity:resume-check"))).toBe("blue");
  expect(participantWrites).toBe(0);
});

for (const action of ["comment", "done"] as const) {
  test(`first ${action} waits for registration and resumes once`, async ({ page }) => {
    await loginAsPhotographer(page);
    const writes: Record<string, unknown>[] = [];
    const nicknames: Record<string, string> = { red: "소유자" };
    const state = { selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: {}, participantNicknames: nicknames, onlineParticipants: [], participantViews: {}, exported: false, deliveryCount: 0, lastDeliveredAt: null };
    await page.route("**/api/customer-select/projects/late-join", (route) => route.fulfill({ json: { isOwner: false, project: {
      ...state, id: "late-join", name: "둘러보기", target: 1, uploaded: true, photoCount: 1, shareToken: "", shareEnabled: true,
      photos: [{ id: "p1", projectId: "late-join", orderIndex: 0, url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", originalFilename: "A001.jpg" }],
    } } }));
    await page.route("**/api/customer-select/projects/late-join/sync", (route) => route.fulfill({ json: state }));
    await page.route("**/api/customer-select/projects/late-join/presence", (route) => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/customer-select/projects/late-join/participants", (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.claim) nicknames[body.color] = body.nickname;
      return route.fulfill({ json: { ok: true } });
    });
    await page.route("**/api/customer-select/projects/late-join/selections", (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/select/late-join/select");
    await page.getByRole("button", { name: "사진 둘러보기" }).click();
    await expect(page.getByRole("button", { name: "참여하기", exact: true })).toBeVisible();
    if (action === "comment") {
      await page.locator('[data-photo-id="p1"]').click();
      const memo = page.getByRole("textbox", { name: "작가 전달 메모" });
      await memo.fill("등록 후 저장할 메모");
      await memo.blur();
    } else {
      await page.getByRole("button", { name: "다 골랐어요", exact: true }).click();
    }
    const join = page.getByRole("dialog", { name: "이름을 알려 주세요", exact: true });
    await expect(join).toBeVisible();
    expect(writes).toHaveLength(0);
    await join.getByRole("textbox", { name: "이름", exact: true }).fill("참여자");
    await join.getByRole("button", { name: "시작하기", exact: true }).click();
    await expect(join).toHaveCount(0);
    await expect.poll(() => writes.filter((body) => action === "comment" ? "comment" in body : "done" in body).length).toBe(1);
    expect(writes[0]).toMatchObject({ claim: true, color: "blue", nickname: "참여자" });
    expect(writes[1]).toMatchObject(action === "comment" ? { photo_id: "p1", comment: "등록 후 저장할 메모" } : { color: "blue", done: true });
  });
}

test("stopped or replaced invite shows an access-ended screen", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.route("**/api/customer-select/projects/stopped-share", async (route) => {
    await route.fulfill({ status: 403, json: { error: "이 프로젝트에 접근할 권한이 없습니다." } });
  });
  await page.goto("/select/stopped-share/select");
  await expect(page.getByRole("heading", { name: /더 이상 사용할 수 없어요/ })).toBeVisible();
  await expect(page.getByText("새로운 초대 링크를 요청해 주세요", { exact: false })).toBeVisible();
});
