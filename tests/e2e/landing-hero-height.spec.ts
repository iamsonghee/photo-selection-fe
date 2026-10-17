import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`통합 히어로는 높이만 바뀌면 유지하고 가로폭 변경 때 재배치한다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        deviceMemory: { configurable: true, value: 8 },
        hardwareConcurrency: { configurable: true, value: 8 },
        connection: { configurable: true, value: { saveData: false, effectiveType: "4g" } },
      });
    });
    await page.goto("/");
    await expect(page.locator('[data-landing-mode="animated"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const hero = page.locator("#top");
    await expect(hero).toHaveCSS("height", /px$/);
    const initial = await hero.evaluate((e) => ({ height: e.getBoundingClientRect().height, nextTop: e.nextElementSibling!.getBoundingClientRect().top + scrollY }));
    await page.evaluate(() => scrollTo(0, 200));
    for (const height of [1000, 650, 850]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      expect(await hero.evaluate((e) => e.getBoundingClientRect().height)).toBe(initial.height);
      expect(await hero.evaluate((e) => e.nextElementSibling!.getBoundingClientRect().top + scrollY)).toBeCloseTo(initial.nextTop, 0);
    }
    const newWidth = width === 390 ? 844 : 390;
    await page.setViewportSize({ width: newWidth, height: 650 });
    await expect.poll(() => hero.evaluate((e) => e.getBoundingClientRect().height)).not.toBe(initial.height);
    await expect(page.locator("#sheet")).toHaveCSS("grid-template-columns", newWidth === 390 ? /^(\S+\s){2}\S+$/ : /^(\S+\s){4}\S+$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
