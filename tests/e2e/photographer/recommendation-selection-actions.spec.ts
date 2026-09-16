import { expect, test } from "@playwright/test";
import { deleteTestProject, setupFullProject, type TestProject } from "../../helpers/setup";

let project: TestProject;

test.beforeEach(async ({ page }, testInfo) => {
  project = await setupFullProject(page, testInfo.title.includes("모바일") ? 40 : 5);
  const response = await page.request.post("/api/auth/test-setup", {
    data: { action: "set_project_status", projectId: project.projectId, status: "preparing" },
  });
  expect(response.ok(), await response.text()).toBe(true);
});

test.afterEach(async ({ page }) => {
  if (project?.projectId) await deleteTestProject(page, project.projectId);
});

test("선택한 사진을 같은 작업 바에서 추천으로 지정하고 제외한다", async ({ page }) => {
  await page.goto(project.uploadUrl);
  await expect(page.getByRole("heading", { name: "원본 업로드" })).toBeVisible();
  await expect(page.getByRole("button", { name: /추천 사진 (고르기|수정)/ })).toHaveCount(0);
  const scopeSelect = page.getByRole("button", { name: "보기 범위: 전체 사진" });
  await expect(scopeSelect).toBeVisible();
  const desktopToolbar = page.locator(".prj-desktop-toolbar");
  const [toolbarBox, scopeBox, searchBox] = await Promise.all([
    desktopToolbar.boundingBox(),
    scopeSelect.boundingBox(),
    page.getByRole("textbox", { name: "파일명으로 필터링" }).boundingBox(),
  ]);
  expect(toolbarBox!.height).toBeLessThanOrEqual(76);
  expect(Math.abs((scopeBox!.y + scopeBox!.height / 2) - (searchBox!.y + searchBox!.height / 2))).toBeLessThanOrEqual(2);
  await expect(page.locator(".prj-gallery-view-switch")).toHaveCount(0);
  await expect(page.locator("[data-project-asset-view-toggle]:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "목록으로 보기" }).click();
  await expect(page.locator("[data-original-photo-list]")).toBeVisible();
  await page.getByRole("button", { name: "갤러리로 보기" }).click();
  await expect(page.locator('[data-photo-gallery-variant="original"]')).toBeVisible();
  await expect(page.locator("[data-photo-sort-select]:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "사진 정렬: 파일명순" }).click();
  await expect(page.getByRole("menuitemradio", { name: "원본 용량 큰 순" })).toHaveCount(0);
  await expect(page.getByRole("menuitemradio", { name: "해상도 높은 순" })).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: "최근 업로드순" }).click();
  await expect(page.getByRole("button", { name: "사진 정렬: 최근 업로드순" })).toBeVisible();
  await page.keyboard.press("Tab");
  await scopeSelect.focus();
  const focusOutline = await scopeSelect.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  expect(focusOutline).toMatchObject({ style: "solid", width: "2px" });
  expect(focusOutline.color).not.toBe("rgb(0, 95, 204)");
  const galleryBottom = await page.locator('[data-photo-gallery-variant="original"]').evaluate((element) => element.getBoundingClientRect().bottom);
  const scrollBottom = await page.getByLabel("원본 사진 갤러리").evaluate((element) => element.getBoundingClientRect().bottom);
  expect(galleryBottom).toBeGreaterThanOrEqual(scrollBottom - 1);

  const card = page.locator("[data-original-photo-card]").first();
  await card.hover();
  await card.getByRole("button", { name: / 선택$/ }).click();
  await expect(page.getByText("1장 선택됨", { exact: true })).toBeVisible();

  const addResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/photographer/projects/${project.projectId}/recommendations`)
      && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "작가 추천으로 지정", exact: true }).click();
  expect((await addResponse).ok()).toBe(true);
  await expect(card.getByLabel("작가 추천")).toBeVisible();
  await expect(page.getByText("1장을 작가 추천으로 지정했습니다.", { exact: true })).toBeVisible();
  await scopeSelect.click();
  await page.getByRole("menuitemradio", { name: /작가 추천 1장/ }).click();
  await expect(page.getByRole("button", { name: "보기 범위: 작가 추천" })).toBeVisible();
  await expect(page.locator("[data-original-photo-card]")).toHaveCount(1);

  await card.hover();
  await card.getByRole("button", { name: / 선택$/ }).click();
  await expect(page.getByRole("button", { name: "작가 추천에서 제외", exact: true })).toBeVisible();
  const removeResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/photographer/projects/${project.projectId}/recommendations`)
      && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "작가 추천에서 제외", exact: true }).click();
  expect((await removeResponse).ok()).toBe(true);
  await expect(card.getByLabel("작가 추천")).toHaveCount(0);
});

test("모바일에서 사진을 길게 눌러 추천으로 지정한다", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.uploadUrl);
  const scopeSelect = page.getByRole("button", { name: "보기 범위: 전체 사진" });
  await expect(scopeSelect).toBeVisible();
  await expect(scopeSelect.locator("strong")).toBeHidden();
  const scopeBox = await scopeSelect.boundingBox();
  expect(scopeBox).not.toBeNull();
  expect(scopeBox!.x + scopeBox!.width).toBeLessThanOrEqual(390);

  const listToggle = page.getByRole("button", { name: "목록으로 보기" });
  await expect(listToggle).toBeVisible();
  await listToggle.click();
  await expect(page.locator("[data-original-photo-list-row]").first()).toBeVisible();
  await expect(page.locator("[data-original-photo-list-thumbnail]").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "파일명" })).toBeVisible();
  const scrollArea = page.getByLabel("원본 사진 갤러리");
  const scrollSize = await scrollArea.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(scrollSize.scrollHeight).toBeGreaterThan(scrollSize.clientHeight);
  const scrollBox = await scrollArea.boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = scrollBox!.x + scrollBox!.width / 2;
  const startY = scrollBox!.y + scrollBox!.height * 0.78;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: startY - 180 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: startY - 360 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "갤러리로 보기" }).click();
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(0);

  const card = page.locator("[data-original-photo-card]").first();
  await expect(card).toBeVisible();
  const checkbox = card.locator("[data-mobile-selection-checkbox]");
  await expect(checkbox).toBeVisible();
  await checkbox.click();
  await expect(page.getByRole("button", { name: "작가 추천으로 지정", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();

  const hitArea = card.getByRole("button", { name: /상세 보기$/ });
  await hitArea.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, clientX: 80, clientY: 240 });
  await page.waitForTimeout(500);

  await expect(page.getByRole("button", { name: "작가 추천으로 지정", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "작가 추천으로 지정", exact: true }).click();
  await expect(card.getByLabel("작가 추천")).toBeVisible();
});

test("원본 탭에서 저장된 작가 추천을 표시하고 필터링한다", async ({ page }) => {
  const recommendationResponse = await page.request.patch(
    `/api/photographer/projects/${project.projectId}/recommendations`,
    { data: { photo_ids: [project.photoIds![0]] } },
  );
  expect(recommendationResponse.ok(), await recommendationResponse.text()).toBe(true);

  await page.goto(`/photographer/projects/${project.projectId}/assets/original`);
  await expect(page.locator("[data-photo-sort-select]:visible")).toHaveCount(1);
  const scopeSelect = page.getByRole("button", { name: "보기 범위: 전체 사진" });
  await expect(scopeSelect).toBeVisible();
  await expect(page.getByLabel("작가 추천")).toHaveCount(1);

  await scopeSelect.click();
  await page.getByRole("menuitemradio", { name: /작가 추천 1장/ }).click();
  await expect(page.locator("[data-original-photo-card]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "보기 범위: 작가 추천" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "보기 범위: 작가 추천" })).toBeVisible();
  expect(await page.locator("[data-project-asset-toolbar]").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("PC 셀렉 결과는 파일명 복사를 내보내기 메뉴 안에 표시한다", async ({ page }) => {
  const statusResponse = await page.request.post("/api/auth/test-setup", {
    data: { action: "set_project_status", projectId: project.projectId, status: "confirmed" },
  });
  expect(statusResponse.ok(), await statusResponse.text()).toBe(true);

  await page.goto(`/photographer/projects/${project.projectId}/assets/selected`);
  const copyButton = page.getByRole("button", { name: "파일명 복사" });
  await expect(copyButton).toBeHidden();

  const exportTrigger = page.getByRole("region", { name: "셀렉 결과 도구" }).locator("summary");
  await expect(exportTrigger).toHaveCSS("border-top-width", "0px");
  await exportTrigger.click();
  await expect(copyButton).toBeVisible();
});
