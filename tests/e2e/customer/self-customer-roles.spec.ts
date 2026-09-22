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
      shareToken: "", exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/role-check/participants", async (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/customer-select/projects/role-check/selections", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/customer-select/role-check/select");
    await expect(page.getByRole("button", { name: "내 의견 완료" })).toBeVisible();
    await expect(page.getByRole("button", { name: "최종 검토하기" })).toHaveCount(0);
    await expect(page.locator('[data-photo-id="p1"] .gl-check-box')).toHaveCount(0);

    await page.locator('[data-photo-id="p1"]').click();
    await expect(width < 768 ? page.getByText("표정이 좋아요").last() : page.getByText("표정이 좋아요").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "사진 선택 해제" })).toHaveCount(0);
    await page.keyboard.press("Space");
  }
  expect(writes.some((body) => "is_selected" in body)).toBe(false);
});
