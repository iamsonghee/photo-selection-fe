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
    const targetInput = page.locator('input[inputmode="numeric"]');
    await expect(targetInput).toHaveValue("");
    await targetInput.fill("2000");
    expect(await targetInput.evaluate((input) => Number.parseFloat(getComputedStyle(input).paddingRight))).toBeGreaterThanOrEqual(56);
    await expect(page.getByText("작가님과 약속한 장수를 입력해 주세요.", { exact: false })).toBeVisible();
    await expect(page.locator("details")).not.toHaveAttribute("open", "");
    await page.locator("summary").click();
    await expect(page.locator("details")).toHaveAttribute("open", "");
    await page.locator("summary").click();
    await page.screenshot({ path: testInfo.outputPath(`create-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/customer-select");
  await expect(page.getByText(/미입력/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "전체 사진 이용량" })).toBeVisible();
  const accountMenu = page.locator('summary[aria-label="계정 메뉴"]');
  await expect(accountMenu).toBeVisible();
  await accountMenu.click();
  await expect(page.locator("details").filter({ has: accountMenu }).getByRole("button", { name: "로그아웃" })).toBeVisible();
  await accountMenu.click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(`projects-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const overview = page.getByRole("link", { name: /프로젝트 현황$/ }).first();
  if (await overview.count()) {
    await expect(page.getByRole("link", { name: "새 프로젝트" })).toBeVisible();
    await expect(page.getByRole("article").first().getByText(/장 남음/)).toHaveCount(0);
    await overview.click();
    await expect(page.getByRole("region", { name: "프로젝트 진행 현황" })).toBeVisible();
    await expect(page.getByRole("link", { name: "새 프로젝트" })).toHaveCount(0);
    await expect(page.getByText("올린 사진", { exact: true })).toBeVisible();
    await expect(page.getByText("최종 선택", { exact: true })).toBeVisible();
    await expect(page.getByText("추가 가능", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "보기·정리" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "함께 고르기" })).toBeVisible();
    await expect(page.getByText(/share_token=/)).toBeVisible();
    await expect(page.getByRole("link", { name: "사진 관리" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "초대 링크 관리" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "촬영 정보" })).toBeVisible();
    await expect(page.getByText(/미입력/)).toHaveCount(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("link", { name: "프로젝트 수정", exact: true }).click();
    await expect(page.getByRole("heading", { name: "프로젝트 설정" })).toBeVisible();
    await expect(page.getByText("담당 작가명", { exact: true })).toBeVisible();
    await expect(page.getByText("촬영 지역", { exact: true })).toBeVisible();
    await expect(page.getByText("촬영 장소", { exact: true })).toBeVisible();
    const deleteSection = page.locator("details").filter({ hasText: "프로젝트 삭제" });
    await expect(deleteSection).not.toHaveAttribute("open", "");
    await expect(deleteSection.getByRole("button", { name: "프로젝트 삭제", exact: true })).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings-mobile.png"), fullPage: true });
    await deleteSection.locator("summary").click();
    await expect(deleteSection.getByRole("button", { name: "프로젝트 삭제", exact: true })).toBeVisible();
  } else {
    testInfo.annotations.push({ type: "coverage", description: "No existing test-owner project: overview requires separate verification." });
  }

  // Isolate upload preflight: no photos or participant records are written.
  let uploadRequests = 0;
  await page.route("**/api/customer-select/upload/photos", async (route) => { uploadRequests++; await route.abort(); });
  await page.route("**/api/customer-select/usage", async (route) => {
    await route.fulfill({ json: { photoCount: 1999, limit: 2000, remaining: 1 } });
  });
  await page.route("**/api/customer-select/projects/*", async (route) => {
    await route.fulfill({ json: { isOwner: true, project: {
      id: "limit-check", name: "업로드 한도 확인", photoCount: 1999, target: 30,
      photos: [], selectedIds: [], photoStates: {}, participantOpinions: {}, participantDone: {}, participantNicknames: { red: "테스트" }, shareToken: "", shareEnabled: true, exported: false,
    } } });
  });
  await page.route("**/api/customer-select/projects/*/participants", async (route) => { await route.fulfill({ json: { ok: true } }); });
  await page.goto("/customer-select/limit-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 한도 확인" })).toBeVisible();
  await page.getByRole("button", { name: "AI 분석 시작" }).click();
  const aiDialog = page.getByRole("dialog", { name: "AI가 정리를 도와드릴까요?" });
  await expect(aiDialog).toBeVisible();
  for (const label of ["건너뛰기", "분석 시작"]) {
    expect(await aiDialog.getByRole("button", { name: label }).evaluate((button) => getComputedStyle(button).fontFamily)).toContain("Pretendard");
  }
  await aiDialog.getByRole("button", { name: "건너뛰기" }).click();
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
