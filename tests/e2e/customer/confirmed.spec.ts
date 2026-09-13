import { devices, expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import {
  createEditingProject,
  deleteTestProject,
  setProjectStatus,
  type TestProject,
} from "../../helpers/setup";

let project: TestProject;
const mobileDevice = { ...devices["iPhone 13"] };
Reflect.deleteProperty(mobileDevice, "defaultBrowserType");

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  project = await createEditingProject(page, 5);
  await setProjectStatus(page, project.projectId, "confirmed");
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 — 셀렉 확정 완료", () => {
  test.use(mobileDevice);

  test("완료 결과와 후속 액션을 우선순위대로 표시한다", async ({ page }) => {
    await page.goto(`/c/${project.accessToken}/confirmed`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "사진 셀렉이 완료되었어요" })).toBeVisible();
    await expect(page.getByText(`선택 완료 · ${project.requiredCount}장`, { exact: true })).toBeVisible();

    const success = page.locator(".confirmed-success");
    await expect(success).toHaveCSS("color", "rgb(255, 77, 0)");

    const detailLink = page.getByRole("link", { name: "선택한 사진 보기" });
    await expect(detailLink).toHaveAttribute("href", `/c/${project.accessToken}/locked`);
    await expect(detailLink).toHaveCSS("background-color", "rgb(38, 40, 44)");

    const resultBox = await page.locator(".confirmed-result").boundingBox();
    const summaryBox = await page.locator(".confirmed-selection-summary").boundingBox();
    const detailBox = await detailLink.boundingBox();
    const downloadBox = await page.locator(".confirmed-download").boundingBox();
    const cancelBox = await page.getByRole("button", { name: "확정 취소하기" }).boundingBox();

    expect(resultBox && summaryBox && detailBox && downloadBox && cancelBox).toBeTruthy();
    expect(resultBox!.y).toBeLessThan(summaryBox!.y);
    expect(summaryBox!.y).toBeLessThan(detailBox!.y);
    expect(detailBox!.y).toBeLessThan(downloadBox!.y);
    expect(downloadBox!.y).toBeLessThan(cancelBox!.y);

    await page.getByRole("button", { name: "확정 취소하기" }).click();
    const cancelDialog = page.getByRole("dialog", { name: "확정을 취소할까요?" });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "유지하기" }).click();
    await expect(cancelDialog).toBeHidden();
  });
});
