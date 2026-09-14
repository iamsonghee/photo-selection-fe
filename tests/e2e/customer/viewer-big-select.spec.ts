import { test, expect } from "@playwright/test";
import { setupFullProject, deleteTestProject, mockCustomerThumbPresigning, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5); // 사진 5장, 필수 3장
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

async function openViewer(page: import("@playwright/test").Page, index = 0) {
  await mockCustomerThumbPresigning(page);
  await page.goto(`/c/${project.accessToken}/viewer/${project.photoIds![index]}`);
  await page.waitForLoadState("networkidle");
}

test("PC 패널의 큰 선택 버튼: 선택 ↔ 해제가 개수와 무관하게 늘 동작한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openViewer(page);

  const big = page.locator(".fs-select-big");
  await expect(big).toBeVisible({ timeout: 10_000 });
  await expect(big).toContainText("이 사진 선택하기");

  await big.click();
  await expect(big).toHaveClass(/is-selected/);
  await expect(big).toContainText("선택됨");
  // 사진 위 작은 체크박스와 같은 상태를 가리킨다
  await expect(page.locator(".fv-photo-checkbox:visible")).toHaveAttribute("aria-label", "사진 선택 해제");

  await big.click();
  await expect(big).not.toHaveClass(/is-selected/);
  await expect(big).toContainText("이 사진 선택하기");
});

test("필수 장수를 다 채워도 선택 해제는 이 버튼으로 가능하다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openViewer(page);

  const big = page.locator(".fs-select-big");
  await expect(big).toBeVisible({ timeout: 10_000 });
  // 화살표로 넘기며 3장(필수)을 채운다
  for (let i = 0; i < 3; i++) {
    await big.click();
    await expect(big).toHaveClass(/is-selected/);
    if (i < 2) await page.keyboard.press("ArrowRight");
  }
  await expect(page.locator(".fs-completion:visible span")).toContainText("3 / 3장 선택 완료");

  // 개수를 채운 상태에서도 이 버튼으로 해제된다 — 하단이 `셀렉 확정하기`로 바뀌어도 막히지 않는다
  await big.click();
  await expect(big).not.toHaveClass(/is-selected/);
  await expect(page.locator(".fs-completion:visible span")).toContainText("2 / 3장 선택");

  // 한도까지 채운 뒤 다른 미선택 사진에서는 먼저 할 일을 문구로 알려준다
  await big.click();
  await page.keyboard.press("ArrowRight");
  await expect(big).not.toHaveClass(/is-selected/);
  await expect(big).toContainText("3장을 모두 골랐어요");
});

test("모바일에는 이 버튼이 없다 (우측 패널 자체가 없음)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openViewer(page);
  await expect(page.locator(".fv-bottom-overlay")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".fs-select-big:visible")).toHaveCount(0);
});
