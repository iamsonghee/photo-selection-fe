import { chromium, devices, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const origin = process.env.DEMO_ORIGIN || "http://127.0.0.1:3001";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = path.join(tmpdir(), "acut-hero-verification");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = {};
try {
  for (const scenario of ["desktop", "mobile", "reduced", "autoplay-denied", "media-error", "mobile-reduced", "mobile-autoplay-denied", "mobile-media-error"]) {
    const context = await browser.newContext({ viewport: scenario.startsWith("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      reducedMotion: scenario.endsWith("reduced") ? "reduce" : "no-preference" });
    const page = await context.newPage();
    const apis = [], media = [];
    await page.route("**/*", route => {
      const url = route.request().url();
      if (/\/api\/|supabase/.test(url)) { apis.push(url); return route.abort(); }
      if (/\/landing\/hero\/.*\.(webm|mp4)/.test(url)) {
        media.push(url);
        if (scenario.endsWith("media-error")) return route.abort();
      }
      return route.continue();
    });
    if (scenario.endsWith("autoplay-denied")) await page.addInitScript(() => {
      // 브라우저의 자동 재생 거절을 재현한다. 네이티브 autoplay도 즉시 정지한다.
      const stopNativeAutoplay = () => document.querySelectorAll("video").forEach(video => {
        video.removeAttribute("autoplay");
        video.pause();
      });
      new MutationObserver(stopNativeAutoplay).observe(document, { childList: true, subtree: true });
      HTMLMediaElement.prototype.play = function () {
        this.removeAttribute("autoplay");
        this.pause();
        return Promise.reject(new DOMException("Autoplay denied for verification", "NotAllowedError"));
      };
    });
    await page.goto(`${origin}/landing?videoDebug=1`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const film = page.locator(".ac-hero-film");
    await film.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".ac-hero-poster")?.naturalWidth > 0);
    if (["desktop", "mobile"].includes(scenario)) {
      await page.waitForFunction(() => { const video = document.querySelector(".ac-hero-film video"); return video && !video.paused && video.readyState >= 2; });
      const initialTime = await page.locator(".ac-hero-film video").evaluate(video => video.currentTime);
      await page.waitForFunction(start => document.querySelector(".ac-hero-film video").currentTime > start + .3, initialTime);
      assert.equal(await page.getByRole("button", { name: "제품 시연 영상 재생" }).count(), 0);
      // 재생 도중 남은 오류 UI는 새 playing 이벤트 없이 시간 진행만으로 복구한다.
      await page.locator(".ac-hero-film video").evaluate(video => video.dispatchEvent(new Event("error")));
      await page.getByRole("button", { name: "제품 시연 영상 재생" }).waitFor({ state: "hidden" });
      for (let loop = 0; loop < 2; loop++) {
        await page.evaluate(() => { document.querySelector("video").currentTime = 19.65; });
        await page.waitForFunction(() => {
          const v = document.querySelector("video");
          return v.currentTime < 1 && !v.seeking && !v.paused;
        });
      }
      await page.evaluate(() => document.querySelector("video").dispatchEvent(new Event("waiting")));
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".ac-hero-film video").evaluate(video => getComputedStyle(video).opacity), "1");
      await page.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 14; });
      await page.waitForFunction(() => !document.querySelector("video").seeking);
    } else {
      await page.waitForTimeout(scenario.endsWith("autoplay-denied") ? 5200 : 1200);
      assert.equal(await film.getAttribute("data-playing"), "false", scenario);
    }
    const state = await page.evaluate(() => {
      const f = document.querySelector(".ac-hero-film"), v = document.querySelector("video");
      const { width, height } = f.getBoundingClientRect();
      return { width, height, overflow: document.documentElement.scrollWidth > innerWidth,
        video: v ? { width: v.videoWidth, height: v.videoHeight, duration: v.duration, muted: v.muted,
          controls: v.controls, loop: v.loop, playsInline: v.playsInline, fit: getComputedStyle(v).objectFit,
          currentSrc: v.currentSrc, sourceOrder: [...v.querySelectorAll("source")].map(source => source.type) } : null };
    });
    assert(Math.abs(state.width / state.height - (scenario.startsWith("mobile") ? 4 / 5 : 1200 / 641)) < .001);
    assert.equal(state.overflow, false);
    assert.equal(apis.length, 0);
    if (scenario.endsWith("reduced")) {
      assert(state.video);
      assert.equal(await page.getByRole("button", { name: "제품 시연 영상 재생" }).isVisible(), true);
      await page.getByRole("button", { name: "제품 시연 영상 재생" }).click();
      await page.waitForFunction(() => { const video = document.querySelector(".ac-hero-film video"); return video && !video.paused && video.readyState >= 2; });
    }
    if (["desktop", "mobile"].includes(scenario)) {
      assert.equal(state.video.width, scenario.startsWith("mobile") ? 960 : 2400); assert.equal(state.video.height, scenario.startsWith("mobile") ? 1200 : 1282);
      assert(Math.abs(state.video.duration - 20) < .1);
      assert(state.video.currentSrc.includes(scenario === "mobile" ? "acut-demo-mobile.mp4" : "acut-demo.mp4"));
      if (scenario === "mobile") assert(media.every(url => url.includes("acut-demo-mobile")));
      assert.equal(state.video.controls, false); assert.equal(state.video.muted, true);
      assert.equal(state.video.loop, true); assert.equal(state.video.playsInline, true);
      assert.equal(state.video.fit, "contain");
      assert(state.video.currentSrc.endsWith(".mp4"));
      assert.deepEqual(state.video.sourceOrder, ["video/mp4"]);
    }
    if (scenario.endsWith("autoplay-denied") || scenario.endsWith("media-error")) {
      await page.getByRole("button", { name: "제품 시연 영상 재생" }).waitFor({ state: "visible", timeout: 6500 });
    }
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="영상 재생 진단 결과"]')?.value.includes('"version": "hero-progress-v1"'));
    if (scenario.endsWith("autoplay-denied")) {
      assert((await page.locator('textarea[aria-label="영상 재생 진단 결과"]').inputValue()).includes("NotAllowedError"));
    }
    await film.screenshot({ path: path.join(output, `${scenario}.png`) });
    if (["desktop", "mobile"].includes(scenario)) {
      await page.evaluate(() => { document.querySelector("video").currentTime = 18.6; });
      await page.waitForFunction(() => !document.querySelector("video").seeking);
      await film.screenshot({ path: path.join(output, `${scenario}-uploaded.png`) });
    }
    results[scenario] = { ...state, apiRequests: apis.length, mediaRequests: media.length };
    await context.close();
  }
  // MP4 대체 소스도 별도로 디코딩해 방향·해상도·길이를 확인한다.
  const page = await browser.newPage({ viewport: { width: 1200, height: 641 } });
  await page.setContent(`<style>body{margin:0}video{width:1200px;height:641px}</style><video muted src="${origin}/landing/hero/acut-demo.mp4"></video>`);
  await page.waitForFunction(() => document.querySelector("video").readyState >= 2);
  results.mp4 = await page.evaluate(() => { const v = document.querySelector("video"); return { width: v.videoWidth, height: v.videoHeight, duration: v.duration }; });
  assert.deepEqual(results.mp4, { width: 2400, height: 1282, duration: 20 });
  await page.evaluate(() => { document.querySelector("video").currentTime = 14; });
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.screenshot({ path: path.join(output, "mp4.png") });
  await page.setContent(`<video muted src="${origin}/landing/hero/acut-demo-mobile.mp4"></video>`);
  await page.waitForFunction(() => document.querySelector("video").readyState >= 2);
  results.mobileMp4 = await page.evaluate(() => { const v = document.querySelector("video"); return { width: v.videoWidth, height: v.videoHeight, duration: v.duration }; });
  assert.deepEqual(results.mobileMp4, { width: 960, height: 1200, duration: 20 });
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2), `\nScreenshots: ${output}`);
} finally { await browser.close(); }

// Chromium 에뮬레이션만으로는 Safari의 source 선택과 inline autoplay를 검증할 수 없다.
// 실제 iPhone과 같은 UA/viewport를 WebKit에 적용해 H.264 모바일 영상이 재생되는지 확인한다.
const safari = await webkit.launch();
try {
  const context = await safari.newContext({ ...devices["iPhone 13"], reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${origin}/landing`);
  const film = page.locator(".ac-hero-film");
  await film.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const video = document.querySelector(".ac-hero-film video"); return video && !video.paused && video.readyState >= 2; });
  const initialTime = await page.locator(".ac-hero-film video").evaluate(video => video.currentTime);
  await page.waitForFunction(start => document.querySelector(".ac-hero-film video").currentTime > start + .3, initialTime);
  assert.equal(await page.getByRole("button", { name: "제품 시연 영상 재생" }).count(), 0);
  const state = await page.locator(".ac-hero-film video").evaluate(video => ({
    currentSrc: video.currentSrc,
    paused: video.paused,
    muted: video.muted,
    playsInline: video.playsInline,
    width: video.videoWidth,
    height: video.videoHeight,
  }));
  assert(state.currentSrc.endsWith("acut-demo-mobile.mp4"));
  assert.equal(state.paused, false);
  assert.equal(state.muted, true);
  assert.equal(state.playsInline, true);
  assert.deepEqual([state.width, state.height], [960, 1200]);
  results.iphoneWebKit = state;
  await context.close();
} finally {
  await safari.close();
}
await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
console.log("iPhone WebKit:", JSON.stringify(results.iphoneWebKit, null, 2));
