import { expect, test } from "@playwright/test";
import path from "path";

test("업로드 확인을 취소하면 사진을 추가하지 않고 같은 파일을 다시 고를 수 있다", async ({ page }) => {
  await page.goto("/customer-select/upload");
  const input = page.locator('input[type="file"]');
  const fixture = path.resolve("tests/fixtures/sample.jpg");
  await input.setInputFiles(fixture);
  await expect(page.getByRole("dialog", { name: "사진 1장을 업로드할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("0장 준비됨");
  await input.setInputFiles(fixture);
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByRole("dialog", { name: "사진을 정리할까요?" })).toHaveCount(0);
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("1장 준비됨");
  await expect(page.getByRole("button", { name: "사진 고르기 시작" })).toBeVisible();
});

test("사진을 확인한 뒤 분석 없이 고르거나 분석 항목을 선택한다", async ({ page }) => {
  await page.goto("/customer-select/upload");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/sample.jpg"));
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByRole("button", { name: "sample.jpg 크게 보기" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "사진을 정리할까요?" })).toHaveCount(0);
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await expect(page.getByRole("dialog", { name: "사진을 정리할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "분석 없이 사진 고르기" }).click();
  await expect(page).toHaveURL(/\/customer-select\/select\?scene=0&scenes=0&similar=0&quality=0&from=upload/);
  await page.getByRole("link", { name: "업로드 화면으로" }).click();
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await expect(page.getByRole("dialog", { name: "사진을 정리할까요?" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /유사컷 묶기/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /장면별 정리/ }).check();
  await page.getByRole("button", { name: "AI 이미지 분석" }).click();
  await expect(page).toHaveURL(/\/customer-select\/select\?scene=0&scenes=1&similar=1&quality=0&from=upload/);
});

test("사진을 이어서 추가하고 드래그 선택해 부분 삭제한다", async ({ page }) => {
  await page.goto("/customer-select/upload");
  const input = page.locator('input[type="file"]');

  await input.setInputFiles(path.resolve("tests/fixtures/sample.jpg"));
  await expect(page.getByRole("dialog", { name: "사진 1장을 업로드할까요?" })).toBeVisible();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("0장 준비됨");
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("1장 준비됨");
  await expect.poll(() => page.getByRole("img", { name: "sample.jpg" }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await input.setInputFiles(path.resolve("tests/fixtures/sample.png"));
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("2장 준비됨");
  await expect(page.getByRole("button", { name: "사진 추가" })).toHaveCount(1);
  await expect(page.getByLabel("업로드한 사진 2장").locator("button").first()).toHaveText("사진 추가");
  await expect(page.getByRole("button", { name: "전체 삭제" })).toBeVisible();

  await page.getByRole("button", { name: "sample.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "sample.jpg 크게 보기" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "sample.png 크게 보기" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "sample.png 크게 보기" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "sample.jpg 크게 보기" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "사진 선택" })).toHaveCount(0);
  const first = await page.locator("[data-preview-id]").nth(0).boundingBox();
  const second = await page.locator("[data-preview-id]").nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();

  await page.getByRole("button", { name: "sample.jpg 선택" }).click();
  await expect(page.locator("[data-preview-id]").first().locator("[data-photo-thumbnail-selection-ring]")).toBeVisible();
  await expect(page.locator("[data-preview-id]").first().locator("[data-upload-selected-shade]")).toHaveClass(/opacity-100/);
  await page.getByRole("button", { name: "sample.jpg 선택 해제" }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("2장 준비됨");
  await page.getByRole("button", { name: "sample.jpg 선택" }).click();
  await page.getByRole("button", { name: "sample.png 선택" }).click({ modifiers: ["Shift"] });
  await expect(page.getByRole("button", { name: "선택 삭제 (2)" })).toBeVisible();
  await page.getByRole("button", { name: "sample.png 선택 해제" }).click();
  await expect(page.getByRole("button", { name: "선택 삭제 (1)" })).toBeVisible();
  await page.getByRole("button", { name: "sample.png 선택" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByRole("button", { name: "선택 삭제 (2)" })).toBeVisible();
  await page.getByRole("button", { name: "선택 해제", exact: true }).click();
  await page.getByLabel("업로드한 사진 2장").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await expect(page.getByRole("button", { name: "선택 삭제 (2)" })).toBeVisible();
  await page.getByRole("button", { name: "선택 해제", exact: true }).click();

  const gridBox = await page.getByLabel("업로드한 사진 2장").boundingBox();
  expect(gridBox).not.toBeNull();
  await page.mouse.move(gridBox!.x + 5, gridBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "선택 삭제 (1)" })).toBeVisible();
  await page.getByRole("button", { name: "선택 해제", exact: true }).click();

  const rowCenter = first!.y + first!.height / 2;
  await page.mouse.move(first!.x + 2, rowCenter);
  await page.mouse.down();
  await page.mouse.move(second!.x + second!.width - 2, rowCenter, { steps: 5 });
  await page.mouse.up();

  const remove = page.getByRole("button", { name: "선택 삭제 (2)" });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.getByRole("dialog", { name: "선택한 사진 2장을 삭제할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "삭제하기" }).click();
  await expect(page.getByText("사진이나 폴더를 선택해 주세요.")).toBeVisible();

  await page.getByRole("button", { name: "검수용 5,000장 예시 보기" }).click();
  await expect.poll(() => page.getByRole("img", { name: "ACUT_0001.jpg" }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("5,000장 준비됨");
  const desktopGrid = page.getByLabel("업로드한 사진 5000장");
  await expect(desktopGrid.locator("[data-upload-add]")).toHaveCount(0);
  await expect.poll(() => desktopGrid.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await expect.poll(() => page.locator("[data-preview-id]").count()).toBeGreaterThan(0);
  await expect(page.locator('[data-preview-id="sample-0"]')).toHaveCount(0);
  await page.getByRole("button", { name: "전체 삭제" }).click();
  await expect(page.getByRole("dialog", { name: "사진 5,000장을 모두 삭제할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "전체 삭제하기" }).click();
  await expect(page.getByText("사진이나 폴더를 선택해 주세요.")).toBeVisible();
});

test("모바일은 페이지를 스크롤하고 선택 작업을 하단에 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer-select/upload");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/sample.jpg"));
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByLabel("업로드한 사진 1장").locator("[data-upload-add]")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 삭제" })).toBeVisible();
  await page.getByRole("button", { name: "전체 삭제" }).click();
  await page.getByRole("button", { name: "전체 삭제하기" }).click();
  await page.getByRole("button", { name: "검수용 5,000장 예시 보기" }).click();

  const grid = page.getByLabel("업로드한 사진 5000장");
  await expect(grid).toBeVisible();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("5,000장 준비됨");
  await expect(page.getByRole("button", { name: "사진 고르기 시작", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 5,000장 보기" })).toHaveCount(0);
  await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  expect(await page.locator("[data-preview-id]").count()).toBeLessThan(100);

  const firstPhoto = page.getByRole("button", { name: "ACUT_0001.jpg 크게 보기" }).first();
  await firstPhoto.click();
  await expect(page.getByLabel("사진 선택 작업")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const box = await firstPhoto.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByLabel("사진 선택 작업")).toContainText("1장 선택됨");
  await expect(page.getByLabel("업로드 다음 단계")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await expect.poll(() => page.locator("[data-preview-id]").count()).toBeGreaterThan(0);
  await expect(page.locator('[data-preview-id="sample-0"]')).toHaveCount(0);
  await expect(page.getByLabel("사진 선택 작업")).toContainText("1장 선택됨");
});
