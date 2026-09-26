import { expect, test, type Page } from "@playwright/test";

const projectId = "retouch-qa";
const pixel =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23ddd'/%3E%3C/svg%3E";

type Decision = "pending" | "confirmed" | "redo";

function photos(decisions: Decision[] = ["pending", "pending"]) {
  return [
    { id: "p1", filename: "A001.jpg", url: pixel, previewUrl: pixel, versions: [{ id: "v1", round: 1, filename: "A001-final.jpg", thumbUrl: pixel, previewUrl: pixel, decision: decisions[0], redoReason: null, createdAt: "2026-09-26" }] },
    { id: "p2", filename: "A002.jpg", url: pixel, previewUrl: pixel, versions: [{ id: "v2", round: 1, filename: "A002-final.jpg", thumbUrl: pixel, previewUrl: pixel, decision: decisions[1], redoReason: decisions[1] === "redo" ? "피부톤을 낮춰주세요" : null, createdAt: "2026-09-26" }] },
    { id: "p3", filename: "A003.jpg", url: pixel, previewUrl: pixel, versions: [] },
  ];
}

async function mockGet(page: Page, value = photos()) {
  await page.route(`**/api/customer-select/projects/${projectId}/retouch`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { photos: value, retouchDone: false, isOwner: true } });
    } else {
      await route.fulfill({ status: 500, json: { error: "완료 저장 실패" } });
    }
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name}: upload partial failure and unmatched handling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockGet(page, photos([]));
    let uploadCount = 0;
    await page.route("**/api/customer-select/upload/retouched", async (route) => {
      uploadCount++;
      await route.fulfill({ json: uploadCount === 1 ? { uploaded: 0, rejected: ["A001-final.jpg"] } : { uploaded: 1, rejected: [] } });
    });

    await page.goto(`/customer-select/${projectId}/retouch/upload`);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([{ name: "A001-final.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") }, { name: "mystery.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") }]);
    await expect(page.getByText("자동 연결됨 (1장)")).toBeVisible();
    await expect(page.getByText(/연결 안 된 파일.*1장/)).toBeVisible();
    await page.getByRole("button", { name: "매칭 확인하고 검토 시작" }).click();
    await expect(page).toHaveURL(new RegExp(`/retouch/upload$`));
    await expect(page.getByText(/0장은 업로드했고 1장은 실패했어요/)).toBeVisible();
    expect(uploadCount).toBe(1);

    await page.goto(`/customer-select/${projectId}/retouch/upload`);
    await input.setInputFiles({ name: "unknown.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") });
    await page.getByRole("button", { name: "매칭 확인하고 검토 시작" }).click();
    await expect(page.getByText("업로드할 사진과 원본 연결을 먼저 확인해주세요.")).toBeVisible();
    await page.locator("select").selectOption("p2");
    await page.getByRole("button", { name: "매칭 확인하고 검토 시작" }).click();
    await expect(page).toHaveURL(new RegExp(`/retouch/compare$`));
  });

  test(`${viewport.name}: decision failure, completion gate and layout`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state: Decision[] = ["pending", "pending"];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route(`**/api/customer-select/projects/${projectId}/retouch`, async (route) => {
      await route.fulfill({ json: { photos: photos(state), retouchDone: false, isOwner: true } });
    });
    let fail = true;
    await page.route(`**/api/customer-select/projects/${projectId}/retouch/decisions`, async (route) => {
      const body = route.request().postDataJSON();
      if (fail) return route.fulfill({ status: 500, json: { error: "저장 실패 재현" } });
      state[body.version_id === "v1" ? 0 : 1] = body.decision;
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto(`/customer-select/${projectId}/retouch/compare`);
    await page.getByRole("button", { name: "A001.jpg 크게 보기" }).click();
    await expect(page.getByRole("dialog", { name: "A001.jpg 크게 보기" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "A002.jpg 크게 보기" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "확정", exact: true }).first().click();
    await expect(page.getByText("저장 실패 재현")).toBeVisible();
    expect(pageErrors).toEqual([]);

    fail = false;
    await page.getByRole("button", { name: "확정", exact: true }).first().click();
    await page.getByRole("button", { name: "재보정 요청", exact: true }).nth(1).click();
    await page.getByPlaceholder("예: 피부톤이 너무 밝아요").fill("피부톤을 낮춰주세요");
    await page.getByRole("button", { name: "재보정 요청 확정" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
    await expect(page.getByText("1장은 아직 보정본을 못 받았어요")).toBeVisible();
    await expect(page.getByRole("button", { name: /검토 마치기/ })).toBeDisabled();

    const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, mainWidth: document.querySelector("main")?.getBoundingClientRect().width ?? document.querySelector('[class*="shellMain"]')?.getBoundingClientRect().width }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
    if (viewport.name === "desktop") expect(layout.mainWidth).toBeGreaterThan(375);
  });

  test(`${viewport.name}: export, done failure and participant denial`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const failed: string[] = [];
    page.on("response", (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await mockGet(page, photos(["confirmed", "redo"]));
    await page.goto(`/customer-select/${projectId}/retouch/export`);
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV 다운로드" }).click()]);
    const [txt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TXT 다운로드" }).click()]);
    expect(csv.suggestedFilename()).toBe("재보정_요청.csv");
    expect(txt.suggestedFilename()).toBe("재보정_요청.txt");
    await page.getByRole("button", { name: "다음 보정본 기다리기" }).click();
    await expect(page).toHaveURL(new RegExp(`/retouch/upload$`));

    await page.goto(`/customer-select/${projectId}/done`);
    await page.getByRole("button", { name: "완료로 표시", exact: true }).click();
    await expect.poll(() => failed.some((item) => item.includes("500") && item.includes("/retouch"))).toBe(true);
    await expect(page.getByText("완료 저장 실패")).toBeVisible();
    await expect(page.getByRole("button", { name: "완료로 표시", exact: true })).toBeEnabled();

    await page.unrouteAll({ behavior: "wait" });
    await page.route(`**/api/customer-select/projects/${projectId}/retouch`, (route) => route.fulfill({ status: 403, json: { error: "프로젝트 소유자만 이용할 수 있습니다." } }));
    await page.goto(`/customer-select/${projectId}/retouch/compare`);
    await expect(page.getByText("프로젝트 소유자만 이용할 수 있습니다.")).toBeVisible();
    await expect(page.getByText("검토할 보정본이 없어요")).toHaveCount(0);
  });
}
