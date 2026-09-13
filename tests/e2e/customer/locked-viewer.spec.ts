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
  await expect(selectedViewer.getByRole("button", { name: "이전 사진" })).toBeVisible();
  await expect(selectedViewer.getByRole("button", { name: "다음 사진" })).toBeVisible();

  await selectedViewer.locator(".locked-viewer-stage img").first().click();
  const focusOverlay = page.locator(".pfo-root");
  await expect(focusOverlay).toBeVisible();
  await expect(focusOverlay.getByRole("button", { name: /사진/ })).toHaveCount(0);
  await focusOverlay.click({ position: { x: 8, y: 8 } });
  await expect(focusOverlay).toHaveCount(0);

  await selectedViewer.getByRole("button", { name: "다음 사진" }).click();
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

test("확정 취소 모달을 열어도 배경 갤러리 카드와 썸네일 크기가 유지된다", async ({ page }) => {
  await prepareLockedPage(page);

  const card = page.getByRole("button", { name: "E2E_TEST_001.jpg 상세보기" });
  const thumbnail = card.locator(".lk-thumb");
  const before = {
    card: await card.boundingBox(),
    thumbnail: await thumbnail.boundingBox(),
  };

  expect(before.card).not.toBeNull();
  expect(before.thumbnail).not.toBeNull();
  await page.getByRole("button", { name: "확정 취소" }).click();
  await expect(page.getByRole("dialog", { name: "확정을 취소할까요?" })).toBeVisible();

  const after = {
    card: await card.boundingBox(),
    thumbnail: await thumbnail.boundingBox(),
  };
  expect(after.card).not.toBeNull();
  expect(after.thumbnail).not.toBeNull();
  expect(after.card!.height).toBeGreaterThan(before.card!.height * 0.9);
  expect(after.thumbnail!.height).toBeGreaterThan(before.thumbnail!.height * 0.9);
  expect(after.thumbnail!.height / after.thumbnail!.width).toBeCloseTo(1, 1);
});

test.describe("모바일", () => {
  test.use(mobileDevice);

  test("상세보기에서 좌우 스와이프로 같은 섹션의 사진을 이동한다", async ({ page }) => {
    await prepareLockedPage(page);
    await expect(page.getByRole("heading", { name: "셀렉 상세보기" })).toBeVisible();
    const statusBar = page.locator(".locked-mobile-status");
    await expect(page.getByText("사진 셀렉이 완료되어 작가가 보정 중이에요", { exact: true })).toBeVisible();
    await expect(statusBar).toHaveCSS("background-color", "rgba(255, 77, 0, 0.08)");
    await expect(statusBar.getByRole("button", { name: "원본 다운로드" })).toHaveCSS("color", "rgb(38, 40, 44)");
    await expect(page.getByRole("button", { name: /셀렉 3장/ })).toBeVisible();
    await expect(page.locator(".locked-mobile-grid")).toHaveCSS("grid-template-columns", /.+ .+/);
    await expect(page.getByRole("button", { name: "파일명 검색" })).toHaveCSS("width", "30px");

    await page.getByRole("button", { name: /셀렉 3장/ }).click();
    await page.getByRole("menuitem", { name: /원본 5장/ }).click();
    await expect(page.locator(".locked-mobile-selected-check")).toHaveCount(3);
    await page.getByRole("button", { name: /원본 5장/ }).click();
    await page.getByRole("menuitem", { name: /셀렉 3장/ }).click();

    await page.getByRole("button", { name: "E2E_TEST_001.jpg 상세보기" }).click();
    const viewer = page.getByRole("dialog", { name: "선택된 원본 상세보기" });

    await expect(viewer.locator("header")).toHaveCSS("min-height", "55px");
    await expect(viewer.locator(".locked-viewer-stage")).toHaveCSS("padding-top", "60px");
    await expect(viewer.getByText("선택됨", { exact: true })).toBeVisible();
    await expect(viewer.getByText("코멘트 없음", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "이전 사진" })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "다음 사진" })).toBeVisible();

    await viewer.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 320, clientY: 400 }],
    });
    await viewer.dispatchEvent("touchend", {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 405 }],
    });

    await expect(viewer.getByText("E2E_TEST_002.jpg", { exact: true })).toBeVisible();
    // Figma #55892 모바일 상세는 이미지 순번을 노출하지 않는다.
    await expect(viewer.getByText("2 / 3", { exact: true })).toBeHidden();
  });
});
