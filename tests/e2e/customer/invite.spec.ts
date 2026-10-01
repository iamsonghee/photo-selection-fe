import { test, expect, devices } from "@playwright/test";
import {
  setupFullProject,
  deleteTestProject,
  mockCustomerThumbPresigning,
  type TestProject,
} from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;
let reviewProject: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 3);
  reviewProject = await setupFullProject(page, 1);
  const statusResponse = await page.request.post("/api/auth/test-setup", {
    data: {
      action: "set_project_status",
      projectId: reviewProject.projectId,
      status: "reviewing_v1",
    },
  });
  if (!statusResponse.ok()) {
    throw new Error(`review project status setup failed (${statusResponse.status()}): ${await statusResponse.text()}`);
  }
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  if (reviewProject?.projectId) await deleteTestProject(page, reviewProject.projectId);
  await page.close();
});

test.describe("고객 — 초대 링크", () => {
  test("I1: 유효한 초대 링크 → 안내 화면에서 갤러리 진입", async ({ page }) => {
    await mockCustomerThumbPresigning(page);
    await page.goto(`/c/${project.accessToken}`);
    await page.waitForLoadState("networkidle");
    const introCanvas = page.locator('[data-customer-entry-layout="responsive"]');
    await expect(introCanvas).toBeVisible();
    const heroBox = await introCanvas.locator("[data-entry-hero]").boundingBox();
    const copyBox = await introCanvas.locator("[data-entry-copy]").boundingBox();
    const actionsBox = await introCanvas.locator("[data-entry-actions]").boundingBox();
    const viewport = page.viewportSize();
    expect(heroBox).not.toBeNull();
    expect(copyBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    const canvasBox = await introCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.x).toBe(0);
    expect(canvasBox!.width).toBe(viewport!.width);
    expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(copyBox!.x + 1);
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(viewport!.height);
    const canvasFitsViewport = await introCanvas.evaluate((element) =>
      element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth
    );
    expect(canvasFitsViewport).toBe(true);
    await page.mouse.wheel(0, 800);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const startLink = page.getByRole("link", { name: "사진 선택하기" });
    await expect(startLink).toBeVisible();
    await startLink.click();
    await expect(page).toHaveURL(/\/gallery/, { timeout: 20_000 });
  });

  test("작가 프로필에서 소개와 등록된 외부 링크를 확인한다", async ({ page }) => {
    await page.route("**/api/c/photographer?*", (route) => route.fulfill({ json: {
      name: "에이컷 스튜디오",
      profile_image_url: null,
      bio: "자연스러운 순간을 기록합니다.",
      instagram_url: "https://instagram.com/acut",
      portfolio_url: "example.com/portfolio",
    } }));
    await page.goto(`/c/${project.accessToken}`);

    await page.getByRole("button", { name: "에이컷 스튜디오 작가 소개 보기" }).click();
    const dialog = page.getByRole("dialog", { name: "에이컷 스튜디오 작가" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("자연스러운 순간을 기록합니다.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/acut");
    await expect(dialog.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "https://example.com/portfolio");
  });

  test("I2: 잘못된 토큰 → 에러 화면", async ({ page }) => {
    await page.goto("/c/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "이 링크는 사용할 수 없어요" })).toBeVisible({ timeout: 8000 });
  });

  test("I3: 갤러리 직접 접근 → 사진 목록", async ({ page }) => {
    await mockCustomerThumbPresigning(page);
    await page.goto(`/c/${project.accessToken}/gallery`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/gallery/);
    const photos = page.locator("[data-photo-id] img");
    await expect(photos.first()).toBeVisible({ timeout: 10_000 });
  });

  test("I4: 보정본 검토 초대 링크도 라이트 진입 화면을 사용한다", async ({ page }) => {
    await page.route("**/api/c/presign-preview?*", async (route) => {
      await route.fulfill({ json: { url: "/customer/entry/missing-cover.jpg" } });
    });
    await page.goto(`/c/${reviewProject.accessToken}`);
    await page.waitForLoadState("networkidle");

    const entryCanvas = page.locator('[data-customer-entry-layout="responsive"]');
    const hero = entryCanvas.locator("[data-entry-hero]");
    await expect(entryCanvas).toBeVisible();
    await expect(page.getByRole("heading", { name: /보정본이 도착했어요/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "보정본 검토하기" })).toBeVisible();
    await expect(page.getByText("CMD :: SYS.REVIEW_INVITE", { exact: true })).toHaveCount(0);
    await expect(entryCanvas).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(hero.locator("[data-entry-hero-placeholder]")).toBeVisible();
    await expect(hero.locator(":scope > img")).toHaveCount(0);
    const entryFitsViewport = await entryCanvas.evaluate((element) =>
      element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth
    );
    expect(entryFitsViewport).toBe(true);
    expect(await entryCanvas.locator("[data-entry-panel], [data-entry-copy], [data-entry-actions]").evaluateAll((elements) =>
      elements.every((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)
    )).toBe(true);
    await page.mouse.wheel(600, 800);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
  });

  test("I5: 보정본 검토 화면의 로고로 초대 기본 화면에 돌아간다", async ({ page }) => {
    await page.goto(`/c/${reviewProject.accessToken}`);
    await page.getByRole("link", { name: "보정본 검토하기" }).click();
    await expect(page).toHaveURL(`/c/${reviewProject.accessToken}/review`);

    const homeLogo = page.getByRole("link", { name: "처음 화면으로" });
    await expect(homeLogo).toHaveAttribute("href", `/c/${reviewProject.accessToken}`);
    await homeLogo.click();

    await expect(page).toHaveURL(`/c/${reviewProject.accessToken}`);
    await expect(page.getByRole("heading", { name: /보정본이 도착했어요/ })).toBeVisible();
  });
});

test.describe("고객 — 초대 링크 모바일", () => {
  const mobileDevice = { ...devices["iPhone 13"] };
  Reflect.deleteProperty(mobileDevice, "defaultBrowserType");
  test.use(mobileDevice);

  test("작가 소개를 화면 하단 시트로 연다", async ({ page }) => {
    await page.route("**/api/c/photographer?*", (route) => route.fulfill({ json: {
      name: "에이컷 스튜디오",
      profile_image_url: null,
      bio: "자연스러운 순간을 기록합니다.",
      instagram_url: null,
      portfolio_url: null,
    } }));
    await page.goto(`/c/${project.accessToken}`);

    await page.getByRole("button", { name: "에이컷 스튜디오 작가 소개 보기" }).click();
    const dialog = page.getByRole("dialog", { name: "에이컷 스튜디오 작가" });
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThanOrEqual(1);
  });

  test("핵심 선택 정보와 CTA가 첫 화면에 노출된다", async ({ page }) => {
    await page.goto(`/c/${project.accessToken}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/총 .*장 중 마음에 드는 .*장을 골라주세요/)).toBeVisible();
    const startLink = page.getByRole("link", { name: "사진 선택하기" });
    await expect(startLink).toBeVisible();
    const box = await startLink.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    const entryCanvas = page.locator('[data-customer-entry-layout="responsive"]');
    const heroBox = await page.locator("[data-entry-hero]").boundingBox();
    expect(heroBox).not.toBeNull();
    expect(heroBox!.height).toBeGreaterThanOrEqual(220);
    expect(heroBox!.height).toBeLessThanOrEqual(340);
    const canvasBox = await entryCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.x).toBe(0);
    expect(canvasBox!.width).toBe(viewport!.width);
    expect(await entryCanvas.evaluate((element) =>
      element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth
    )).toBe(true);
    expect(await entryCanvas.locator("[data-entry-panel], [data-entry-copy], [data-entry-actions]").evaluateAll((elements) =>
      elements.every((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)
    )).toBe(true);
    expect(await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))).toEqual({ documentWidth: viewport!.width, viewportWidth: viewport!.width });
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
  });

  test("보정본 검토 진입 화면이 모바일에서도 라이트로 표시된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(`/c/${reviewProject.accessToken}`);
    await page.waitForLoadState("networkidle");

    const entryCanvas = page.locator('[data-customer-entry-layout="responsive"]');
    await expect(entryCanvas).toBeVisible();
    await expect(page.getByRole("heading", { name: /보정본이 도착했어요/ })).toBeVisible();
    await expect(entryCanvas).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const reviewLink = page.getByRole("link", { name: "보정본 검토하기" });
    await expect(reviewLink).toBeVisible();
    const reviewLinkBox = await reviewLink.boundingBox();
    const viewport = page.viewportSize();
    expect(reviewLinkBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(reviewLinkBox!.y + reviewLinkBox!.height).toBeLessThanOrEqual(viewport!.height);
    const canvasBox = await entryCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.x).toBe(0);
    expect(canvasBox!.width).toBe(viewport!.width);
    expect(await entryCanvas.evaluate((element) =>
      element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth
    )).toBe(true);
    expect(await entryCanvas.locator("[data-entry-panel], [data-entry-copy], [data-entry-actions]").evaluateAll((elements) =>
      elements.every((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)
    )).toBe(true);
    expect(await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))).toEqual({ documentWidth: viewport!.width, viewportWidth: viewport!.width });
    await page.mouse.wheel(500, 700);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
  });
});
