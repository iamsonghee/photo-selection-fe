import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`랜딩 모션은 정지한 내용의 DOM을 재생성하지 않는다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    for (const [route, selector] of [["/select", "#cnt"], ["/studio", "#gcount"]]) {
      await page.goto(route);
      await page.waitForFunction(() => document.querySelector("#sTiles .tile, #ggrid .g"));
      await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>("#top")!;
        window.scrollTo(0, hero.offsetTop + (hero.offsetHeight - innerHeight) * .75);
      });
      await expect(page.locator(selector)).toContainText("40");
      // 이전 프레임의 갱신이 끝난 뒤, 같은 내용이 유지되는지 확인한다.
      await page.waitForTimeout(200);
      const changes = await page.locator(selector).evaluate(async (element) => {
        let count = 0;
        const observer = new MutationObserver((records) => { count += records.length; });
        observer.observe(element, { childList: true, subtree: true, characterData: true });
        await new Promise((resolve) => setTimeout(resolve, 300));
        observer.disconnect();
        return count;
      });
      expect(changes).toBe(0);
    }
  });
}

test("움직임 축소에서는 셀렉 완료 장면을 정적으로 보여준다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/select");
  await expect(page.locator("#sStage .head.on")).toContainText("40장");
  const changes = await page.locator("#sTiles").evaluate(async (element) => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(element, { attributes: true, subtree: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    observer.disconnect();
    return count;
  });
  expect(changes).toBe(0);
});

test("통합 랜딩의 배경과 제목은 자바스크립트 없이 표시된다", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:3001/");
    await expect(page.locator("#top .landing-poster img")).toHaveCount(1);
    await expect(page.locator("#sheet img")).toHaveCount(0);
    await expect(page.locator("#h1")).toHaveCSS("filter", "none");
  } finally {
    await context.close();
  }
});

test("데이터 절약 모드에서는 세 랜딩이 이미지로 표시되고 로그인은 동작한다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true, effectiveType: "4g", downlink: 10 } });
  });
  for (const route of ["/", "/select", "/studio"]) {
    await page.goto(route);
    await expect(page.locator('[data-landing-mode="static"]')).toBeVisible();
    await expect(page.locator("#sheet, #sTiles .tile, #ggrid .g")).toHaveCount(0);
    await expect(page.locator("#top .landing-poster img")).toBeVisible();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-landing-mode="animated"]')).toHaveCount(0);
    const start = route === "/" ? page.getByRole("link", { name: "로그인", exact: true })
      : page.getByRole("link", { name: route === "/select" ? "내 사진 셀렉 시작하기" : "무료로 시작하기", exact: true }).first();
    await start.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
});

test("낮은 CPU·메모리에서는 정적 예시 전환과 원본 비교를 유지한다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      deviceMemory: { configurable: true, value: 2 },
      hardwareConcurrency: { configurable: true, value: 2 },
      connection: { configurable: true, value: { saveData: false, effectiveType: "4g", downlink: 10 } },
    });
  });
  await page.goto("/studio");
  await expect(page.locator('[data-landing-mode="static"]')).toBeVisible();
  await page.locator('#flist button[data-s="stack"]').click();
  await expect(page.locator('.ease .landing-poster img')).toHaveAttribute("src", /studio-phone-stack/);
  await expect(page.locator('#flist button[data-s="stack"]')).toHaveAttribute("aria-selected", "true");
  await page.goto("/select");
  await page.locator("#hold2").dispatchEvent("pointerdown");
  await expect(page.locator("#h2lab")).toHaveText("원본");
  await page.locator("#hold2").dispatchEvent("pointerup");
  await expect(page.locator("#h2lab")).toHaveText("보정본");
});
