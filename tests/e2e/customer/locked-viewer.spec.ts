import { devices, expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import {
  createEditingProject,
  deleteTestProject,
  mockCustomerThumbPresigning,
  setProjectStatus,
  type TestProject,
} from "../../helpers/setup";

let project: TestProject;
const mobileDevice = { ...devices["iPhone 13"] };
Reflect.deleteProperty(mobileDevice, "defaultBrowserType");

async function prepareLockedPage(page: Page) {
  await mockCustomerThumbPresigning(page);
  await page.route("**/api/c/presign-preview?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const photoIds = (requestUrl.searchParams.get("photoIds") ?? "").split(",").filter(Boolean);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        presignedUrls: Object.fromEntries(photoIds.map((id) => [id, {
          url: `https://picsum.photos/seed/locked-${id}/1200/900`,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }])),
      }),
    });
  });
  await page.route("https://picsum.photos/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
  }));
  await page.goto(`/c/${project.accessToken}/locked`);
}

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

test("확정 후 선택·미선택 원본을 섹션별 읽기 전용 상세보기로 탐색한다", async ({ page }) => {
  await prepareLockedPage(page);

  await page.getByRole("button", { name: "E2E_TEST_001.jpg 상세보기" }).click();
  const selectedViewer = page.getByRole("dialog", { name: "선택된 원본 상세보기" });
  await expect(selectedViewer).toBeVisible();
  await expect(selectedViewer.getByText("선택됨", { exact: true })).toBeVisible();
  await expect(selectedViewer.getByText("1 / 3", { exact: true })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(selectedViewer.getByText("E2E_TEST_002.jpg", { exact: true })).toBeVisible();
  await expect(selectedViewer.getByText("2 / 3", { exact: true })).toBeVisible();
  await selectedViewer.getByRole("button", { name: "상세보기 닫기" }).click();
  await expect(selectedViewer).toHaveCount(0);

  await page.getByRole("button", { name: "E2E_TEST_004.jpg 상세보기" }).click();
  const unselectedViewer = page.getByRole("dialog", { name: "선택하지 않은 원본 상세보기" });
  await expect(unselectedViewer.getByText("미선택", { exact: true })).toBeVisible();
  await expect(unselectedViewer.getByText("1 / 2", { exact: true })).toBeVisible();
  await unselectedViewer.getByRole("button", { name: "다음 사진" }).click();
  await expect(unselectedViewer.getByText("E2E_TEST_005.jpg", { exact: true })).toBeVisible();
  await expect(unselectedViewer.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(unselectedViewer).toHaveCount(0);
});

test.describe("모바일", () => {
  test.use(mobileDevice);

  test("상세보기에서 좌우 스와이프로 같은 섹션의 사진을 이동한다", async ({ page }) => {
    await prepareLockedPage(page);
    await page.getByRole("button", { name: "E2E_TEST_001.jpg 상세보기" }).click();
    const viewer = page.getByRole("dialog", { name: "선택된 원본 상세보기" });

    await viewer.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 320, clientY: 400 }],
    });
    await viewer.dispatchEvent("touchend", {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 405 }],
    });

    await expect(viewer.getByText("E2E_TEST_002.jpg", { exact: true })).toBeVisible();
    await expect(viewer.getByText("2 / 3", { exact: true })).toBeVisible();
  });
});
