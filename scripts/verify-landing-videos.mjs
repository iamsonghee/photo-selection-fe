import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
const origin = process.env.DEMO_ORIGIN || "http://127.0.0.1:3001";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
// 두 영상 모두 같은 자동재생 및 실패 복구 정책인지 검증한다.
for (const engine of [chromium, webkit]) {
 const browser = await engine.launch();
 try {
  for (const mode of ["reduce", "no-preference", "error", "denied"]) {
   const context = await browser.newContext({...devices["iPhone 13"], reducedMotion: mode === "reduce" ? "reduce" : "no-preference"});
   const page = await context.newPage();
   if (mode === "error") await page.route("**/landing/**/*.mp4", route => route.abort());
   if (mode === "denied") await page.addInitScript(() => {
    new MutationObserver(() => document.querySelectorAll('video').forEach(v => {v.removeAttribute('autoplay');v.pause();})).observe(document,{childList:true,subtree:true});
    HTMLMediaElement.prototype.play = function(){this.pause();return Promise.reject(new DOMException('test','NotAllowedError'));};
   });
   await page.goto(`${origin}/landing`);
   assert.equal(await page.locator('video').count(),2);
   for (const selector of [".ac-hero-film", ".as-review-film"]) {
    const film = page.locator(selector), video = film.locator('video');
    await film.scrollIntoViewIfNeeded();
    if (["error","denied"].includes(mode)) {
     await film.getByRole('button',{name:'제품 시연 영상 재생'}).waitFor({state:'visible',timeout:15000});
     assert(await film.locator('img').evaluate(img=>img.complete && img.naturalWidth>0));
    } else {
     await page.waitForFunction(sel=>{const v=document.querySelector(`${sel} video`);return !v.paused && v.readyState>=2;},selector);
     const start = await video.evaluate(v=>v.currentTime);
     await page.waitForFunction(({sel,start})=>document.querySelector(`${sel} video`).currentTime>start+.3,{sel:selector,start});
     assert.equal(await film.getByRole('button').count(),0);
     assert.deepEqual(await video.evaluate(v=>[v.muted,v.playsInline,v.loop,v.autoplay,v.controls,getComputedStyle(v).opacity,getComputedStyle(v).display]),[true,true,true,true,false,'1','block']);
     await video.evaluate(v=>{v.currentTime=v.duration-.25;});
     await page.waitForFunction(sel=>{const v=document.querySelector(`${sel} video`);return v.currentTime<1 && !v.paused;},selector);
     assert.equal(await video.evaluate(v=>getComputedStyle(v).opacity),'1');
    }
   }
   console.log(`${engine.name()} ${mode}: both videos passed`);
   await context.close();
  }
 } finally {await browser.close();}
}
