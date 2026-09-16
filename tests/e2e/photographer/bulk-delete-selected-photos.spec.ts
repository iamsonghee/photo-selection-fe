import { expect, test } from "@playwright/test";
import path from "path";
import { loginAsPhotographer } from "../../helpers/auth";
import { deleteTestProject, setupTestProject, type TestProject } from "../../helpers/setup";

const FIXTURES = path.join(__dirname, "../../fixtures");
let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupTestProject(page);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test("선택한 여러 사진을 단일 bulk API로 삭제한다", async ({ page }) => {
  await loginAsPhotographer(page);
  await page.goto(project.uploadUrl);
  await page.waitForLoadState("networkidle");

  await page.locator('input[type="file"]').setInputFiles([
    path.join(FIXTURES, "sample.jpg"),
    path.join(FIXTURES, "sample.png"),
  ]);
  const startButton = page.getByRole("button", { name: "업로드 시작" });
  await expect(startButton).toBeVisible();
  await startButton.click();
  await expect(page.getByText("업로드 완료!", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "건너뛰기", exact: true }).click();

  const beforeResponse = await page.request.get(`/api/photographer/projects/${project.projectId}/photos`);
  expect(beforeResponse.ok()).toBeTruthy();
  const before = await beforeResponse.json() as { photos: Array<{ id: string }> };
  expect(before.photos).toHaveLength(2);

  const photoChecks = page.locator('[data-original-photo-card] button[aria-label$=" 선택"]:not([disabled])');
  await expect(photoChecks).toHaveCount(2);
  await page.locator("[data-original-photo-card]").first().hover();
  await photoChecks.nth(0).click();
  await photoChecks.first().click();
  await expect(page.getByText("2장 선택됨", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "선택한 사진 2장 삭제", exact: true }).click();
  const deleteDialog = page.getByRole("dialog").filter({ hasText: "원본 2장을 삭제할까요?" });
  await expect(deleteDialog.getByText("원본 2장을 삭제할까요?", { exact: true })).toBeVisible();

  const deleteResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/photographer/projects/${project.projectId}/photos/selected`) &&
    response.request().method() === "DELETE",
  );
  await deleteDialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  const deleteResponse = await deleteResponsePromise;
  const deleteBody = await deleteResponse.text();
  expect(deleteResponse.ok(), deleteBody).toBeTruthy();
  const result = JSON.parse(deleteBody) as { deletedCount: number; photoCount: number };
  expect(result.deletedCount).toBe(2);
  expect(result.photoCount).toBe(0);

  const afterResponse = await page.request.get(`/api/photographer/projects/${project.projectId}/photos`);
  expect(afterResponse.ok()).toBeTruthy();
  const after = await afterResponse.json() as { photos: Array<{ id: string }> };
  expect(after.photos).toHaveLength(0);
});
