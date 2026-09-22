import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("self customer start screens and over-limit selection", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginAsPhotographer(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/customer-select/new");
    await expect(page.getByRole("heading", { name: "어떤 사진을 골라볼까요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "웨딩" })).toBeVisible();
    await expect(page.locator('input[inputmode="numeric"]')).toHaveValue("30");
    await expect(page.getByText("작가님과 약속한 장수를 입력해 주세요.", { exact: false })).toBeVisible();
    await expect(page.locator("details")).not.toHaveAttribute("open", "");
    await page.locator("summary").click();
    await expect(page.locator("details")).toHaveAttribute("open", "");
    await page.locator("summary").click();
    await page.screenshot({ path: testInfo.outputPath(`create-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/customer-select");
  await page.screenshot({ path: testInfo.outputPath("projects-mobile.png"), fullPage: true });
  const overview = page.getByRole("link", { name: "프로젝트 현황", exact: true }).first();
  if (await overview.count()) {
    await overview.click();
    await expect(page.getByRole("region", { name: "프로젝트 진행 현황" })).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } else {
    testInfo.annotations.push({ type: "coverage", description: "No existing test-owner project: overview requires separate verification." });
  }

  // Isolate upload preflight: no photos or participant records are written.
  let uploadRequests = 0;
  await page.route("**/api/customer-select/upload/photos", async (route) => { uploadRequests++; await route.abort(); });
  await page.route("**/api/customer-select/projects/*", async (route) => {
    await route.fulfill({ json: { isOwner: true, project: {
      id: "limit-check", name: "업로드 한도 확인", photoCount: 1999, target: 30,
      photos: [], selectedIds: [], photoStates: {}, participantDone: {}, participantNicknames: { red: "테스트" }, shareToken: "", exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/*/participants", async (route) => { await route.fulfill({ json: { ok: true } }); });
  await page.goto("/customer-select/limit-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 한도 확인" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles([
    { name: "one.jpg", mimeType: "image/jpeg", buffer: Buffer.from("unused") },
    { name: "two.jpg", mimeType: "image/jpeg", buffer: Buffer.from("unused") },
  ]);
  const limitAlert = page.getByRole("alert").filter({ hasText: "2장을 선택했어요" });
  await expect(limitAlert).toContainText("2장을 선택했어요");
  await expect(limitAlert).toContainText("1장까지 추가");
  await expect(page.getByRole("button", { name: "파일 다시 선택" })).toBeVisible();
  expect(uploadRequests).toBe(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(`upload-limit-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
