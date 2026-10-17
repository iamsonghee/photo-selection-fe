import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`스튜디오 카드는 초기 로드 중 숨겨지지 않고 스크롤로 갤러리 전환 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        deviceMemory: { configurable: true, value: 8 },
        hardwareConcurrency: { configurable: true, value: 8 },
        connection: { configurable: true, value: { saveData: false, effectiveType: "4g" } },
      });
      const samples: { mode: string | undefined; opacity: string; visibility: string }[] = [];
      Object.assign(window, { cardSamples: samples });
      function sample() {
        const card = document.getElementById("pill");
        if (card && scrollY === 0) {
          const style = getComputedStyle(card);
          samples.push({ mode: card.closest<HTMLElement>("[data-landing-mode]")?.dataset.landingMode, opacity: style.opacity, visibility: style.visibility });
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.goto("/studio");
    await expect(page.locator('[data-landing-mode="animated"]')).toBeVisible();
    await page.waitForTimeout(2300);
    const samples = await page.evaluate(() => (window as unknown as { cardSamples: { mode: string; opacity: string; visibility: string }[] }).cardSamples);
    expect(samples.some(s => s.mode === "animated")).toBe(true);
    expect(samples.filter(s => Number(s.opacity) < .99 || s.visibility === "hidden")).toEqual([]);
    await page.evaluate(() => {
      const hero = document.getElementById("top")!;
      scrollTo(0, hero.offsetTop + (hero.offsetHeight - innerHeight) * .4);
    });
    await expect(page.locator("#gal")).toHaveCSS("opacity", "1");
    await expect(page.locator("#pill")).toHaveCSS("visibility", "hidden");
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.locator("#pill")).toHaveCSS("visibility", "visible");
    await expect(page.locator("#pill")).toHaveCSS("opacity", "1");
  });
}

for (const width of [360, 390]) {
  test(`모바일 메시지는 초기 로드와 버튼 줄바꿈 후에도 버튼 아래 유지 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: false, effectiveType: "4g" } });
      const gaps: number[] = [];
      Object.assign(window, { messageGaps: gaps });
      function sample() {
        const cta = document.querySelector("#lTop .ctas");
        const message = document.querySelector("#frags .s0");
        if (cta && message && scrollY === 0) gaps.push(message.getBoundingClientRect().top - cta.getBoundingClientRect().bottom);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.goto("/studio");
    await expect(page.locator('[data-landing-mode="animated"]')).toBeVisible();
    await page.waitForTimeout(2600);
    await page.locator("#lTop .ctas").evaluate(element => { element.style.maxWidth = "180px"; });
    await page.waitForTimeout(100);
    const gaps = await page.evaluate(() => (window as unknown as { messageGaps: number[] }).messageGaps);
    expect(gaps.length).toBeGreaterThan(0);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(13);
    await expect(page.locator("#frags")).toHaveCSS("position", "relative");
  });
}

test("모바일 메시지는 자바스크립트 없이도 버튼 아래 표시된다", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 850 } });
  try {
    const page = await context.newPage();
    await page.goto("http://localhost:3001/studio");
    await expect(page.locator("#frags .s0")).toBeVisible();
    const message = await page.locator("#frags .s0").boundingBox();
    const cta = await page.locator("#lTop .ctas").boundingBox();
    expect(message!.y - cta!.y - cta!.height).toBeGreaterThanOrEqual(27);
  } finally { await context.close(); }
});
