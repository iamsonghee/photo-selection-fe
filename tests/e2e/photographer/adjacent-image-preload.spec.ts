import { expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { deleteTestProject, setupFullProject, type TestProject } from "../../helpers/setup";

declare global {
  interface Window {
    __adjacentPreloadUrls?: string[];
  }
}

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

async function trackProgrammaticImagePreloads(page: Page) {
  await page.addInitScript(() => {
    const NativeImage = window.Image;
    window.__adjacentPreloadUrls = [];

    function TrackingImage(width?: number, height?: number) {
      const image = new NativeImage(width, height);
      Object.defineProperty(image, "src", {
        configurable: true,
        get: () => image.getAttribute("src") ?? "",
        set: (value: string) => {
          window.__adjacentPreloadUrls?.push(String(value));
          image.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
        },
      });
      Object.defineProperty(image, "decode", {
        configurable: true,
        value: async () => undefined,
      });
      return image;
    }

    Object.setPrototypeOf(TrackingImage, NativeImage);
    TrackingImage.prototype = NativeImage.prototype;
    window.Image = TrackingImage as unknown as typeof Image;
  });
}

async function openFirstUploadLightbox(page: Page) {
  await loginAsPhotographer(page);
  await page.goto(project.uploadUrl);
  await page.waitForLoadState("networkidle");
  await page.locator(".prj-data-cell").first().click();
  await expect(page.getByRole("button", { name: "다음 사진" })).toBeVisible();
}

test("PC 업로드 라이트박스는 현재·이전 1장·다음 2장만 선로딩한다", async ({ page }) => {
  await trackProgrammaticImagePreloads(page);
  await openFirstUploadLightbox(page);

  await expect.poll(() => page.evaluate(() => window.__adjacentPreloadUrls?.length ?? 0)).toBe(4);
  const initialUrls = await page.evaluate(() => window.__adjacentPreloadUrls ?? []);
  expect(initialUrls.every((url) => url.includes("/1200/900"))).toBeTruthy();

  await page.getByRole("button", { name: "다음 사진" }).click();
  await expect.poll(() => page.evaluate(() => window.__adjacentPreloadUrls?.length ?? 0)).toBe(5);
});

test("모바일 업로드 라이트박스는 현재와 양옆 1장만 선로딩한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await trackProgrammaticImagePreloads(page);
  await openFirstUploadLightbox(page);

  await expect.poll(() => page.evaluate(() => window.__adjacentPreloadUrls?.length ?? 0)).toBe(3);
});
