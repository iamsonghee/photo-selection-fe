import { expect, test } from "@playwright/test";
import { SELECT_SCENES, SELECT_TIMELINE } from "../../../src/lib/customer-select-sample";

test("사진 중심 목록에서 연속 비교하고 위치와 선택을 유지한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/customer-select/results?scenes=1&similar=1");
  await page.getByRole("button", { name: "첫 장면부터 고르기" }).click();
  await expect(page.getByRole("complementary", { name: "전체 장면" })).toBeVisible();
  await expect(page.locator("[data-photo-card]").first()).toBeVisible();
  expect(await page.locator("[data-photo-card]").count()).toBeLessThan(100);
  await page.getByRole("button", { name: "ACUT_1_0004.jpg 크게 보기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택", exact: true }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await expect(page.getByText("최종 1 / 60장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "두 장 유사컷 보기" })).toHaveCount(0);
  await expect(dialog.getByLabel("묶음의 모든 사진")).toBeVisible();
  await dialog.getByRole("button", { name: "사진 2 보기", exact: true }).click();
  await dialog.getByRole("button", { name: "ACUT_1_0002.jpg 최종 선택", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /\.jpg 최종 선택$/ })).toHaveCount(1);
  await dialog.getByRole("region", { name: "사진", exact: true }).getByRole("button", { name: "확대", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "전체 구도", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/customer-select-comparison-desktop.png" });
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("heading")).toContainText("ACUT_1_0004.jpg");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("최종 2 / 60장", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1600);
  const visible = page.getByRole("button", { name: /\.jpg \d+장 유사컷 보기$/ });
  const opener = visible.first();
  await opener.click();
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "다음 대표컷" }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(3);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: /다음: 입장/ }).click();
  await expect(page.getByRole("heading", { name: "식전·신부대기실", exact: true })).toBeAttached();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /다음: 입장/ }).click();
  await expect(page.getByRole("heading", { name: "입장과 예식", exact: true })).toBeAttached();
  await page.getByRole("complementary", { name: "전체 장면" }).getByRole("button", { name: /1. 식전/ }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  expect(errors).toEqual([]);
});

test("모바일 첫 화면에 사진을 표시하고 5천 장 무분석 목록을 가상화한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer-select/select?scene=0");
  const first = page.locator("[data-photo-card]").first();
  await expect(first).toBeVisible();
  expect((await first.boundingBox())!.y).toBeLessThan(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/customer-select-scenes-mobile.png" });
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "사진 3 보기" }).click();
  await page.getByRole("button", { name: "ACUT_1_0003.jpg 최종 선택", exact: true }).click();
  await page.screenshot({ path: "test-results/customer-select-comparison-mobile.png" });
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await expect(page.getByText("최종 1 / 60장", { exact: true })).toBeVisible();

  await page.goto("/customer-select/results");
  await page.getByRole("button", { name: "촬영 순서대로 고르기" }).click();
  await expect(page.getByText("촬영 순서대로", { exact: true })).toBeVisible();
  await expect(page.getByLabel("현재 장면", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/유사컷 \d+장/)).toHaveCount(0);
  expect(await page.locator("[data-photo-card]").count()).toBeLessThan(100);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
  await expect(page.getByRole("button", { name: "ACUT_5_0450.jpg 크게 보기", exact: true })).toBeVisible();
  expect(await page.locator("[data-photo-card]").count()).toBeLessThan(100);
  await expect(page.getByRole("button", { name: "최종 검토", exact: true })).toBeVisible();
});

test("찜 보기에서 30장 묶음을 모두 비교하고 빈 필터를 확인한다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0");
  await page.getByRole("button", { name: "ACUT_1_0016.jpg 30장 유사컷 보기", exact: true }).click();
  await page.getByRole("button", { name: "사진 30 보기", exact: true }).click();
  await page.getByRole("button", { name: "ACUT_1_0045.jpg 최종 선택", exact: true }).click();
  await page.getByRole("button", { name: "ACUT_1_0045.jpg 찜", exact: true }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByRole("button", { name: /찜한 사진만/ }).click();
  await page.getByRole("button", { name: "ACUT_1_0045.jpg 30장 유사컷 보기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "ACUT_1_0045.jpg" })).toBeVisible();
  await expect(page.getByLabel("묶음의 모든 사진").getByRole("button")).toHaveCount(30);
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.locator("summary").click();
  await page.getByLabel("원본 파일명 검색").fill("does-not-exist");
  await expect(page.getByText("표시할 사진이 없어요.")).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.locator("[data-photo-card]").first()).toBeVisible();
});

test("장면만 이동하고 촬영 순서와 장면별 위치를 유지한다", async ({ page }) => {
  expect(SELECT_TIMELINE.map(groups => groups.reduce((count, group) => count + group.length, 0))).toEqual(SELECT_SCENES.map(scene => scene.count));
  await page.goto("/customer-select/select?scene=0");
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 사진 선택", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("소장면 이동")).toHaveCount(0);
  await expect(page.getByLabel("소장면 바로가기")).toHaveCount(0);
  await expect(page.locator("main h2")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 900));
  const before = await page.evaluate(() => scrollY);
  const scenes = page.getByRole("complementary", { name: "전체 장면" });
  await scenes.getByRole("button", { name: /4. 원판/ }).click();
  await expect(page).toHaveURL(/scene=3/);
  await scenes.getByRole("button", { name: /1. 식전/ }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await page.screenshot({ path: "test-results/customer-select-navigation-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "전체 장면 열기" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("button", { name: /5. 2부/ })).toBeVisible();
  await page.screenshot({ path: "test-results/customer-select-scene-picker-mobile.png" });
  await picker.getByRole("button", { name: /4. 원판/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "원판·가족사진", exact: true })).toBeAttached();
  await expect(page.getByLabel("소장면 이동")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("품질 표시는 분석한 사진에만 적용하고 체크로 여러 장을 선택한다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0&quality=1");
  await expect(page.getByLabel(/눈 감음 의심/).first()).toBeVisible();
  const group = page.getByRole("button", { name: "ACUT_1_0005.jpg 8장 유사컷 보기", exact: true });
  await group.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("region", { name: "사진", exact: true })).toBeVisible();
  await expect(dialog.getByText("눈 감음 의심", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "ACUT_1_0005.jpg 최종 선택", exact: true }).click();
  await dialog.getByRole("button", { name: "사진 2 보기", exact: true }).click();
  await dialog.getByRole("button", { name: "ACUT_1_0006.jpg 최종 선택", exact: true }).click();
  await expect(dialog.getByText(/전체 2 \/ 60장/)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "품질 의심 표시" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "사진 1 보기", exact: true }).click();
  await expect(dialog.getByText("눈 감음 의심", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "사진 2 보기", exact: true }).click();
  await expect(dialog.getByText("눈 감음 의심", { exact: false })).toHaveCount(0);
  await dialog.getByRole("button", { name: "ACUT_1_0006.jpg 확대", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("button", { name: "ACUT_1_0006.jpg 최종 선택", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await dialog.getByRole("button", { name: "상세보기 닫기" }).click();
  await expect(group).toBeVisible();
  await expect(group.locator("xpath=ancestor::article")).toContainText("8장 중 2장 선택");
  await expect(page.getByText("열어본 묶음")).toHaveCount(0);
  await page.goto("/customer-select/select?scene=0&similar=0&quality=1");
  await expect(page.getByLabel(/눈 감음 의심/).first()).toBeVisible();
  await page.locator("summary").click();
  await expect(page.getByRole("checkbox", { name: "품질 의심 표시" })).toHaveCount(0);
  await page.goto("/customer-select/select?scene=0");
  await group.click();
  await expect(page.getByRole("checkbox", { name: "품질 의심 표시" })).toHaveCount(0);
  await expect(page.getByText("눈 감음 의심", { exact: false })).toHaveCount(0);
});

test("필터 버튼은 실제 적용 조건만 세고 보기 범위는 초기화하지 않는다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0&quality=1");
  await page.locator("summary").click();
  await page.getByLabel("인물").selectOption("신부");
  await page.getByLabel("구도").selectOption("전신");
  await expect(page.getByLabel("적용된 필터 2개")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("summary.cs-filter-trigger")).toBeInViewport();
  await page.getByRole("button", { name: /찜한 사진만/ }).click();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByLabel("적용된 필터 2개")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /찜한 사진만/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: "품질 의심 표시" })).toHaveCount(0);
});

test("모바일 스와이프와 핀치 확대가 서로 간섭하지 않는다", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto((process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3011") + "/customer-select/select?scene=0");
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기", exact: true }).click();
  const session = await context.newCDPSession(page);
  const area = () => page.getByLabel(/터치 사진$/);
  await expect(area().locator("img")).toBeVisible();
  const rect = (await area().boundingBox())!;
  const y = Math.round(rect.y + rect.height / 2);
  async function touch(type: "touchStart" | "touchMove" | "touchEnd", points: number[]) {
    await session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((x, id) => ({ x, y, id })) });
  }
  await touch("touchStart", [300]);
  await touch("touchMove", [200]);
  await touch("touchMove", [100]);
  await touch("touchEnd", []);
  await expect(page.getByText(/대표컷 2 \//)).toBeVisible();
  await touch("touchStart", [165, 225]);
  await touch("touchMove", [120, 270]);
  await touch("touchEnd", []);
  await expect(page.getByRole("button", { name: "전체 구도", exact: true })).toBeVisible();
  const before = await area().locator("img").evaluate(img => img.parentElement!.style.transform);
  await touch("touchStart", [250]);
  await touch("touchMove", [120]);
  await touch("touchEnd", []);
  await expect(page.getByText(/대표컷 2 \//)).toBeVisible();
  expect(await area().locator("img").evaluate(img => img.parentElement!.style.transform)).not.toBe(before);
  await page.getByRole("button", { name: "전체 구도", exact: true }).click();
  await expect(page.getByRole("button", { name: "전체 구도", exact: true })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/customer-select-touch-comparison.png" });
  await page.getByRole("button", { name: "다음 대표컷" }).click();
  await expect(page.getByText(/대표컷 3 \//)).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 대표컷" })).toBeEnabled();
  await context.close();
});

test("사진 행과 문구가 화면 크기·선택 보기 변경 후에도 겹치지 않는다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0");
  await expect(page.locator("[data-photo-card]").first()).toBeVisible();
  async function checkLayout() {
    await expect.poll(() => page.evaluate(() => {
      const problems: string[] = [];
      const rows = [...document.querySelectorAll<HTMLElement>("[data-photo-row]")]
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      rows.forEach((row, index) => {
        const rect = row.getBoundingClientRect();
        const next = rows[index + 1]?.getBoundingClientRect();
        if (next && rect.bottom > next.top + .5) problems.push("행 겹침");
        row.querySelectorAll<HTMLElement>("[data-photo-card]").forEach(card => {
          const image = card.querySelector("button")!.getBoundingClientRect();
          const text = card.querySelector<HTMLElement>("[data-photo-status]")?.getBoundingClientRect();
          if (Math.abs(image.width - image.height) > 1) problems.push("사진 비율");
          if (text && (image.bottom > text.top + .5 || text.bottom > rect.bottom + .5)) problems.push("사진·문구 겹침");
        });
      });
      if (document.documentElement.scrollWidth > innerWidth) problems.push("가로 넘침");
      return problems;
    })).toEqual([]);
  }
  for (const width of [1280, 390, 768, 1024, 1600, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await checkLayout();
    await page.evaluate(() => window.scrollBy(0, 700));
    await checkLayout();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole("button", { name: "ACUT_1_0004.jpg 크게 보기", exact: true }).click();
  await page.getByRole("button", { name: "ACUT_1_0004.jpg 찜", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택", exact: true }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByRole("button", { name: /찜한 사진만/ }).click();
  await checkLayout();
  await page.getByRole("button", { name: /찜한 사진만/ }).click();
  await checkLayout();
  await page.screenshot({ path: "test-results/customer-select-layout-desktop-fixed.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout();
  await page.screenshot({ path: "test-results/customer-select-layout-mobile-fixed.png" });
});
