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
  const defaultScopeBackground = await scopeSelect.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(page.locator("[data-recommendation-guide]:visible")).toBeVisible();
  await scopeSelect.click();
  await page.getByRole("menuitemradio", { name: /추천한 사진 0장/ }).click();
  await expect(page.getByText("아직 추천한 사진이 없어요", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전체 사진에서 선택하기" }).click();
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
  await page.getByRole("button", { name: "고객에게 추천", exact: true }).click();
  expect((await addResponse).ok()).toBe(true);
  await expect(card.getByLabel("작가 추천")).toBeVisible();
  await expect(page.getByText("1장을 고객에게 추천했습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "셀렉 요청하기", exact: true }).click();
  const requestDialog = page.getByRole("dialog", { name: "고객에게 셀렉 요청하기" });
  await expect(requestDialog.getByText("작가 추천 사진 · 1장", { exact: true })).toBeVisible();
  await expect(requestDialog.locator("[data-recommendation-preview] img")).toHaveCount(1);
  const deadlineInputRow = requestDialog.locator("[data-selection-deadline-input-row]");
  const [deadlineRowBox, dateBox, quickBox] = await Promise.all([
    deadlineInputRow.boundingBox(),
    requestDialog.locator("#selection-deadline-desktop").boundingBox(),
    requestDialog.getByRole("button", { name: "3일 후", exact: true }).boundingBox(),
  ]);
  expect(deadlineRowBox!.height).toBeLessThanOrEqual(44);
  expect(dateBox!.width).toBeGreaterThan(220);
  expect(Math.abs((dateBox!.y + dateBox!.height / 2) - (quickBox!.y + quickBox!.height / 2))).toBeLessThanOrEqual(2);
  await requestDialog.getByRole("button", { name: "확인·수정" }).click();
  const recommendedScopeSelect = page.getByRole("button", { name: "보기 범위: 추천한 사진" });
  await expect(recommendedScopeSelect).toBeVisible();
  expect(await recommendedScopeSelect.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(defaultScopeBackground);
  await expect(page.locator("[data-original-photo-card]")).toHaveCount(1);

  await card.hover();
  await card.getByRole("button", { name: / 선택$/ }).click();
  await expect(page.getByRole("button", { name: "추천 해제", exact: true })).toBeVisible();
  const removeResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/photographer/projects/${project.projectId}/recommendations`)
      && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "추천 해제", exact: true }).click();
  expect((await removeResponse).ok()).toBe(true);
  await expect(card.getByLabel("작가 추천")).toHaveCount(0);
});

test("모바일에서 사진을 길게 눌러 추천으로 지정한다", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.uploadUrl);
  const scopeSelect = page.getByRole("button", { name: "보기 범위: 전체 사진" });
  await expect(scopeSelect).toBeVisible();
  await page.getByRole("button", { name: "작가 추천 안내 닫기" }).click();
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
  await expect(page.getByRole("button", { name: "고객에게 추천", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();

  const hitArea = card.getByRole("button", { name: /상세 보기$/ });
  await hitArea.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, clientX: 80, clientY: 240 });
  await page.waitForTimeout(500);

  await expect(page.getByRole("button", { name: "고객에게 추천", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "고객에게 추천", exact: true }).click();
  await expect(card.getByLabel("작가 추천")).toBeVisible();
});

test("추천이 없는 셀렉 요청에서는 사진 추천 진입점을 보여준다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.uploadUrl);
  await page.getByRole("button", { name: "작가 추천 안내 닫기" }).click();
  await page.getByRole("button", { name: "셀렉 요청하기", exact: true }).click();

  const requestDialog = page.getByRole("dialog", { name: "셀렉 요청" });
  await expect(requestDialog.getByText("작가 추천 사진 · 없음", { exact: true })).toBeVisible();
  await expect(requestDialog.locator("[data-recommendation-preview]")).toHaveCount(0);
  await requestDialog.getByRole("button", { name: "추천 사진 추가" }).click();

  await expect(requestDialog).toBeHidden();
  await expect(page.getByText("사진 선택", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "보기 범위: 전체 사진" })).toBeVisible();
});

test("좁은 화면에서는 추천 사진 세 장과 나머지 개수만 보여준다", async ({ page }) => {
  const response = await page.request.patch(
    `/api/photographer/projects/${project.projectId}/recommendations`,
    { data: { photo_ids: project.photoIds } },
  );
  expect(response.ok(), await response.text()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.uploadUrl);
  await page.getByRole("button", { name: "셀렉 요청하기", exact: true }).click();

  const requestDialog = page.getByRole("dialog", { name: "셀렉 요청" });
  await expect(requestDialog.getByText("작가 추천 사진 · 5장", { exact: true })).toBeVisible();
  await expect(requestDialog.getByRole("button", { name: "3일 후", exact: true })).toBeHidden();
  await expect(requestDialog.locator("[data-recommendation-preview] img:visible")).toHaveCount(3);
  await expect(requestDialog.getByText("+2", { exact: true })).toBeVisible();
  await expect(requestDialog.getByText(`셀렉 요청 수보다 ${5 - project.requiredCount!}장 많아요.`, { exact: true })).toBeVisible();
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
  await page.getByRole("menuitemradio", { name: /추천한 사진 1장/ }).click();
  await expect(page.locator("[data-original-photo-card]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "보기 범위: 추천한 사진" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "보기 범위: 추천한 사진" })).toBeVisible();
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

for (const width of [1440, 390]) {
  test(`작가 추천 편집을 자동 저장하고 실패한 변경을 복구한다 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(project.uploadUrl);
    const tray = page.getByRole("region", { name: "작가 추천" });
    const footer = page.locator("[data-photographer-page-action-bar]");
    await expect(tray).toHaveCSS("position", "fixed");
    await tray.getByRole("button", { name: "작가 추천 편집", exact: true }).click();
    if (width === 390) {
      await expect(tray.getByRole("button", { name: "작가 추천 펼치기" })).toBeVisible();
      await expect(footer).toBeVisible();
      await tray.getByRole("button", { name: "작가 추천 펼치기" }).click();
      await expect(footer).toBeHidden();
    } else {
      await expect(footer).toBeHidden();
      await tray.getByRole("button", { name: "작가 추천 최소화" }).click();
      await expect(tray).toHaveCSS("position", "fixed");
      await expect(footer).toBeVisible();
      await expect(tray.getByRole("button", { name: "작가 추천 최소화", exact: true })).toBeHidden();
      await tray.getByRole("button", { name: "작가 추천 펼치기" }).click();
      await expect(footer).toBeHidden();
    }
    await expect(tray).not.toHaveCSS("animation-name", "none");
    await page.locator("[data-photo-gallery-variant]").dispatchEvent("click");
    await expect(tray.getByRole("button", { name: "작가 추천 펼치기" })).toBeVisible();
    await expect(page.locator("[data-selection-recommendation-mark]")).toHaveCount(0);
    if (width === 1440) {
      const card = page.locator("[data-original-photo-card]").first();
      await card.hover();
      await card.getByRole("button", { name: / 선택$/ }).click();
      await expect(page.getByRole("button", { name: "고객에게 추천", exact: true })).toBeHidden();
      await expect(page.getByLabel("선택 사진 작업 더보기")).toBeHidden();
      await expect(page.getByRole("button", { name: "선택한 사진 1장 삭제", exact: true })).toBeVisible();
      await card.getByRole("button", { name: / 선택 해제$/ }).click();
    }
    await tray.getByRole("button", { name: "작가 추천 펼치기" }).click();
    let writes = 0;
    await page.route(`**/api/photographer/projects/${project.projectId}/recommendations`, async route => {
      writes++;
      await route.fulfill({ status: writes === 1 ? 500 : 200, json: writes === 1 ? { error: "테스트 저장 실패" } : { ok: true } });
    });
    await page.locator("[data-original-photo-card]").first().locator("[data-original-photo-media] > button").first().click();
    await expect(tray).toContainText("작가 추천 편집 · 1장");
    await expect(page.locator("[data-selection-recommendation-mark]")).toHaveCount(1);
    if (width === 1440) {
      const recommendationThumb = tray.getByRole("button", { name: /추천 해제$/ });
      await expect(recommendationThumb).toBeVisible();
      await expect(recommendationThumb).toHaveCSS("background-image", /picsum\.photos/);
      const expandedTrayHeight = (await tray.boundingBox())!.height;
      expect(expandedTrayHeight).toBeGreaterThanOrEqual(120);
      expect(expandedTrayHeight).toBeLessThanOrEqual(170);
    }
    await expect(page.getByText("테스트 저장 실패", { exact: true })).toBeVisible();
    await expect(tray.getByRole("button", { name: "다시 저장", exact: true })).toBeVisible();
    expect(writes).toBe(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), `acut:recommendation-draft:${project.projectId}`)).not.toBeNull();
    await page.reload();
    await expect(tray.getByRole("button", { name: "작가 추천 펼치기" })).toBeVisible();
    await expect.poll(() => writes).toBe(2);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), `acut:recommendation-draft:${project.projectId}`)).toBeNull();
    await page.getByRole("button", { name: "셀렉 요청하기", exact: true }).click();
    const requestDialog = page.getByRole("dialog", { name: /셀렉 요청/ });
    const recommendationSummary = requestDialog.locator("[data-recommendation-delivery-summary]");
    await expect(recommendationSummary.getByText("작가 추천 사진 · 1장", { exact: true })).toBeVisible();
    await requestDialog.getByRole("button", { name: "닫기" }).click();
    await tray.getByRole("button", { name: "작가 추천 펼치기" }).click();
    await expect(tray).toContainText("작가 추천 편집 · 1장");
    const trayBox = await tray.boundingBox();
    expect(trayBox!.x).toBeGreaterThanOrEqual(0);
    expect(trayBox!.x + trayBox!.width).toBeLessThanOrEqual(width);
    expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(1000);
    await page.screenshot({ path: `/tmp/recommendation-tray-${width}.png` });
    await tray.getByRole("button", { name: width === 1440 ? "작가 추천만 보기" : "추천만", exact: true }).click();
    await expect(tray.getByRole("button", { name: width === 1440 ? "전체 보기" : "전체", exact: true })).toBeVisible();
    await expect(page.locator("[data-original-photo-card]")).toHaveCount(1);
    await tray.getByRole("button", { name: "작가 추천 최소화", exact: true }).click();
    await expect(tray.getByRole("button", { name: "작가 추천 펼치기", exact: true })).toBeVisible();
    expect(writes).toBe(2);
  });
}
