import { expect, test } from "@playwright/test";

test("고객 디자인 토큰과 모바일·PC 화면 경계를 유지한다", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["new", "upload", "analysis", "organizing?similar=1", "results?scenes=1&similar=1", "review", "delivery"]) {
      await page.goto(`/customer-select/${route}`);
      const title = page.getByRole("heading", { level: 1 });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", width < 768 ? "24px" : "32px");
      await expect(page.locator(".customer-select-app")).toHaveCSS("color", "rgb(25, 25, 24)");
      const headerLabel = page.locator(".cs-brand-header > span");
      if (await headerLabel.count()) expect(await headerLabel.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
      })).toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      const primary = page.locator(".cs-primary").first();
      if (await primary.count()) {
        await page.mouse.move(0, 0);
        await expect(primary).toHaveCSS("background-color", "rgb(38, 40, 44)");
        await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
      }
      await page.screenshot({ path: testInfo.outputPath(`select-${route.split("?")[0]}-${width}.png`), fullPage: true });
    }
    await page.goto("/customer-select/select?scenes=0&similar=0&quality=0");
    const card = page.locator("[data-photo-card]").first();
    await expect(card.locator(".cs-photo-card")).toHaveCSS("border-radius", "4px");
    await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(21, 22, 26)");
    await expect(page.locator(".cs-photo-stage")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath(`select-viewer-${width}.png`) });
    await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: /최종 검토/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "최종 검토" })).toBeVisible();
    await expect.poll(() => page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기", exact: true }).locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 선택 해제", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`select-review-filled-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "결과 만들기", exact: true }).click();
    await page.getByRole("button", { name: "결과 만들고 확인하기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "작가에게 전달해 주세요." })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`select-delivery-filled-${width}.png`), fullPage: true });
  }
});
