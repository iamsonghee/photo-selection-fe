import { expect, test } from "@playwright/test";
import path from "path";

for (const width of [320, 390]) test(`모바일 ${width}px에서 사진 중앙 탭과 선택을 구분한다`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/customer-select/select?scenes=0&similar=0&quality=0");
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const selection = page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택", exact: true });
  await expect(selection).toHaveAttribute("aria-pressed", "false");
  await selection.click();
  await expect(selection).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
});

test("분석 옵션과 추천 제외를 이전·다음 화면에서 유지한다", async ({ page }) => {
  await page.goto("/customer-select/results?similar=1&scenes=1&quality=1");
  await page.getByRole("article").filter({ hasText: "2부·폐백·피로연" }).getByRole("checkbox").check();
  await expect(page.getByRole("article").filter({ hasText: "식전·신부대기실" })).toContainText("추천 13장");
  await page.getByRole("button", { name: "정리 방식 바꾸기" }).click();
  for (const label of [/유사한 사진끼리 묶기/, /촬영 구간별로 정리하기/, /눈 감음·흐림 의심/]) await expect(page.getByRole("checkbox", { name: label })).toBeChecked();
  await page.getByRole("button", { name: "선택한 항목으로 사진 정리" }).click();
  await page.getByRole("button", { name: "정리 결과 미리보기" }).click();
  await expect(page.getByRole("article").filter({ hasText: "2부·폐백·피로연" }).getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "첫 장면부터 고르기" }).click();
  const scenes = page.getByRole("complementary", { name: "전체 장면" });
  await expect(scenes.getByRole("button", { name: /1. 식전/ })).toContainText("추천 13장");
  await expect(scenes.getByRole("button", { name: /5. 2부/ })).toContainText("추천 제외");
  await scenes.getByRole("button", { name: /5. 2부/ }).click();
  await expect(page.locator("[data-photo-card]").first()).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("추천 0장");
  await scenes.getByRole("button", { name: /4. 원판/ }).click();
  await expect(page.getByRole("link", { name: /최종 검토/ })).toBeVisible();
  await page.getByRole("link", { name: "정리 결과로" }).click();
  await page.getByRole("article").filter({ hasText: "식전·신부대기실" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "첫 장면부터 고르기" }).click();
  await expect(page).toHaveURL(/scene=1/);
});

test("파일 준비 목록은 분석 설정에서 돌아와도 유지하고 빈 프로젝트 이름을 자동 지정한다", async ({ page }) => {
  await page.goto("/customer-select/new");
  const name = page.getByRole("textbox", { name: /프로젝트 이름/ });
  await name.fill("   ");
  await page.locator('select[name="shootType"]').selectOption("ceremony");
  await page.getByRole("spinbutton", { name: /최종 목표 장수/ }).fill("60");
  await page.getByRole("button", { name: "사진 올리기", exact: true }).click();
  await expect(page).toHaveURL(/\/upload$/);
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/sample.jpg"));
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await page.getByRole("checkbox", { name: /장면별 정리/ }).check();
  await page.getByRole("button", { name: "AI 이미지 분석" }).click();
  await expect(page).toHaveURL(/scenes=1&similar=1/);
  await page.getByRole("link", { name: "업로드 화면으로" }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("1장 준비됨");
  await expect.poll(() => page.getByRole("img", { name: "sample.jpg" }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await expect(page.getByRole("checkbox", { name: /장면별 정리/ })).toBeChecked();
});

test("이미지 실패를 알리고 재시도·다른 사진 이동을 허용한다", async ({ page }) => {
  let blocked = true;
  await page.route("**/_next/image?**", route => blocked ? route.abort("failed") : route.continue());
  await page.goto("/customer-select/select?scene=0&similar=0");
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "ACUT_1_0001.jpg 불러오기 실패" })).toBeVisible();
  blocked = false;
  await dialog.getByRole("button", { name: "다시 불러오기" }).click();
  await expect.poll(() => dialog.getByRole("img", { name: "ACUT_1_0001.jpg", exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("ACUT_1_0002.jpg", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /최종 검토/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "최종 검토" })).toBeVisible();
  await page.route("**/landing/sample-project/studio-v2/originals/**", route => blocked ? route.abort("failed") : route.continue());
  blocked = true;
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toBeVisible();
  blocked = false;
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect.poll(() => page.getByRole("dialog").getByRole("img", { name: "ACUT_1_0001.jpg", exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
});
