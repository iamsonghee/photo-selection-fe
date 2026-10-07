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
    // 2026-10 개편 기준: 제목 '셀렉 결과', 범위 '선택한 사진/원본 N장', 상세 창 이름 '(구역) 상세보기'. 픽셀 값은 보지 않는다.
    await expect(page.getByRole("heading", { name: "셀렉 결과" })).toBeVisible();
    await expect(page.getByText("사진 셀렉이 완료되어 작가가 보정 중이에요", { exact: true })).toBeVisible();
    const scopeTrigger = page.locator(".locked-mobile-scope > button");
    await expect(scopeTrigger).toContainText("선택한 사진");
    await expect(scopeTrigger).toContainText("3장");

    await scopeTrigger.click();
    await page.getByRole("menuitem", { name: /원본\s*5장/ }).click();
    await expect(page.locator(".locked-mobile-selected-check")).toHaveCount(3);
    await scopeTrigger.click();
    await page.getByRole("menuitem", { name: /선택한 사진\s*3장/ }).click();

    await page.getByRole("button", { name: "E2E_TEST_001.jpg 상세보기" }).click();
    const viewer = page.getByRole("dialog", { name: /상세보기$/ });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText("선택됨", { exact: true })).toBeVisible();

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
