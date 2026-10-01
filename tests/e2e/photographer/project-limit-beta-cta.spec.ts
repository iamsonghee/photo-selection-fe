import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("무료 체험 한도 화면에서 로그인 상태로 베타 신청을 시작한다", async ({ page }) => {
  await loginAsPhotographer(page);
  let betaApplicationStatus: null | "reviewing" = null;
  await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
    tier: "general",
    current: 1,
    max: 1,
    maxPhotosPerProject: 500,
    maxRevisionCount: 0,
    betaStatus: "not_invited",
    betaEndDate: null,
    betaApplicationStatus,
  } }));

  await page.goto("/photographer/projects/new");
  await expect(page.getByRole("heading", { name: "무료 체험 한도 도달" })).toBeVisible();
  await page.getByRole("button", { name: "베타 참여 신청하기" }).click();
  await expect(page).toHaveURL(/\/beta\/apply$/);
  await expect(page.getByRole("button", { name: "베타 신청하기" })).toBeVisible();

  betaApplicationStatus = "reviewing";
  await page.goto("/photographer/projects/new");
  await expect(page.getByText("베타 신청이 접수되었습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "베타 참여 신청하기" })).toHaveCount(0);
});
