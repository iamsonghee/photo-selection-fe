import { expect, test } from "@playwright/test";

test("분석을 모두 건너뛰거나 선택한 방식으로 정리 결과를 확인한다", async ({ page }) => {
  await page.goto("/customer-select/analysis");
  const similar = page.getByRole("checkbox", { name: /유사한 사진끼리 묶기/ });
  const scenes = page.getByRole("checkbox", { name: /촬영 구간별로 정리하기/ });
  await expect(similar).toBeChecked();
  await expect(scenes).not.toBeChecked();

  await similar.uncheck();
  await page.getByRole("button", { name: "AI 분석 없이 사진 확인" }).click();
  await expect(page).toHaveURL(/\/customer-select\/results$/);
  await expect(page.getByRole("heading", { name: /AI 분석 없이 준비했어요/ })).toBeVisible();

  await page.goto("/customer-select/analysis");
  await scenes.check();
  await page.getByRole("button", { name: "선택한 항목으로 사진 정리" }).click();
  await expect(page).toHaveURL(/organizing\?similar=1&scenes=1/);
  await expect(page.getByText("촬영 구간별로 정리", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "정리 결과 미리보기" }).click();
  await expect(page).toHaveURL(/results\?similar=1&scenes=1/);

  const firstScene = page.getByRole("article").filter({ hasText: "식전·신부대기실" });
  await firstScene.getByRole("checkbox").check();
  await expect(firstScene).toContainText("추천 제외");
  await expect(page.getByRole("button", { name: "첫 장면부터 고르기" })).toBeVisible();
});
