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
    // 셀프 고객은 장면 구성이 다른 촬영 종류를 나눠 고른다(웨딩 본식/웨딩 촬영 등).
    await expect(page.getByRole("button", { name: "웨딩 본식" })).toBeVisible();
    await expect(page.getByRole("button", { name: "돌·백일잔치" })).toBeVisible();
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
    const padding = width >= 768 ? 32 : 20;
    const [logoBox, accountBox] = await Promise.all([
      page.getByRole("img", { name: "A-CUT" }).boundingBox(),
      accountMenu.boundingBox(),
    ]);
    expect(logoBox?.x).toBeCloseTo(padding, 0);
    expect((accountBox?.x ?? 0) + (accountBox?.width ?? 0)).toBeCloseTo(width - padding, 0);
    await page.screenshot({ path: testInfo.outputPath(`projects-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const settingsLink = page.getByRole("link", { name: / 설정$/ }).first();
  if (await settingsLink.count()) {
    await expect(page.getByRole("link", { name: "새 프로젝트" })).toBeVisible();
    await expect(page.getByRole("article").first().getByText(/장 남음/)).toHaveCount(0);
    const settingsHref = (await settingsLink.getAttribute("href"))!;
    const projectPath = settingsHref.replace(/\/settings$/, "");
    // 카드는 별도 현황 화면 없이 현재 단계로 바로 간다.
    const cardHref = await page.getByRole("article").first().locator("> a").last().getAttribute("href");
    expect(cardHref).toMatch(/\/(upload|select|done)$/);
    // 예전 현황 주소는 현재 단계로 리다이렉트된다.
    await page.goto(projectPath);
    await expect(page).toHaveURL(/\/(upload|select|done)$/);
    await page.goto(`${projectPath}/upload`);
    await expect(page.locator("[data-compact-project-title]")).toBeVisible();
    await expect(page.getByRole("button", { name: "고르러 가기 →", exact: true })).toBeVisible();
    for (const [width, galleryPadding] of [[1792, 32], [390, 12]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const gallery = page.locator('[data-photo-gallery-variant="original"]');
      await expect(gallery).toBeVisible();
      expect(await gallery.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBe(galleryPadding);
      const addBox = await page.getByRole("button", { name: "사진 추가하기" }).boundingBox();
      const photoBox = await page.locator("[data-original-photo-media]").first().boundingBox();
      await expect(page.getByRole("button", { name: "프로젝트 현황으로" })).toHaveCount(0);
      await expect(page.locator("[data-compact-project-title]")).toBeVisible();
      if (width >= 768) expect((await page.getByRole("button", { name: "AI 분석 시작" }).boundingBox())?.height).toBe(36);
      if (width < 768) await expect(page.locator("[data-mobile-selection-checkbox]").first()).toBeVisible();
      expect(addBox?.width).toBeCloseTo(photoBox?.width ?? 0, 0);
      expect(addBox?.height).toBeCloseTo(photoBox?.height ?? 0, 0);
      await page.screenshot({ path: testInfo.outputPath(`upload-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "검색 및 정렬 설정" }).click();
    const mobileTools = page.getByRole("dialog", { name: "사진 찾기" });
    await expect(mobileTools.getByRole("textbox", { name: "파일명으로 필터링" })).toBeVisible();
    await expect(mobileTools.getByRole("button", { name: "업로드 순" })).toHaveAttribute("aria-pressed", "true");
    await mobileTools.getByRole("button", { name: "완료" }).click();
    await expect(page.locator("[data-mobile-selection-checkbox]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "삭제할 사진 선택" })).toHaveCount(0);
    const firstCheckbox = page.locator("[data-mobile-selection-checkbox]").first();
    await firstCheckbox.click();
    await expect(firstCheckbox).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "선택 삭제 (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "고르러 가기 →", exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 400 });
    const uploadGallery = page.getByRole("main", { name: "업로드 사진 갤러리" });
    const shellHeader = page.locator('[data-customer-shell-header-mode="compact"]');
    await expect(shellHeader).toBeVisible();
    await expect(shellHeader.locator("[data-brand-wordmark]")).toBeHidden();
    await expect(page.locator("[data-compact-project-title]")).toBeVisible();
    await expect(page.locator("[data-upload-project-context]")).toHaveCount(0);
    await expect.poll(() => shellHeader.locator(":scope > div").evaluate((element) => element.getBoundingClientRect().height)).toBe(48);
    await page.setViewportSize({ width: 800, height: 300 });
    // 올리기·고르기·보내기 단계 간 헤더 높이를 맞추기 위해 PC도 항상 얇은 헤더다.
    await expect(page.locator('[data-customer-shell-header-mode="compact"]')).toBeVisible();
    await uploadGallery.evaluate((element) => {
      const spacer = document.createElement("div");
      spacer.style.height = "1000px";
      element.appendChild(spacer);
      element.scrollTop = 100;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator("[data-compact-project-title]")).toBeVisible();
    await expect(page.locator('[data-customer-shell-header-mode="compact"] [data-brand-wordmark]')).toHaveCount(0);
    await expect(page.locator("[data-upload-project-context]")).toHaveCount(0);
    await uploadGallery.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
    await page.goto(settingsHref);
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
    testInfo.annotations.push({ type: "coverage", description: "No existing test-owner project: card routing and upload layout require separate verification." });
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/customer-select/limit-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 한도 확인" })).toBeVisible();
  await page.getByRole("button", { name: "AI 분석 시작" }).click();
  // AI 정리는 사용자가 시작할 때만 열리고, 장면 나누기는 항상 켜진 채 세부 항목을 고를 수 있다.
  const aiDialog = page.getByRole("dialog", { name: "AI로 사진 정리" });
  await expect(aiDialog).toBeVisible();
  await expect(aiDialog.getByRole("checkbox").first()).toBeDisabled();
  expect(await aiDialog.getByRole("button", { name: "정리 시작" }).evaluate((button) => getComputedStyle(button).fontFamily)).toContain("Pretendard");
  await aiDialog.getByRole("button", { name: "닫기" }).click();
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
