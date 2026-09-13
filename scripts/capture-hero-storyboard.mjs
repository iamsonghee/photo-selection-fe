import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = process.env.DEMO_ORIGIN || 'http://127.0.0.1:3001';
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('로컬 시안만 캡처합니다.');
const review = process.argv.includes("--review");
const upload = process.argv.includes('--upload');
const output = path.resolve(review ? 'docs/assets/review-storyboard' : upload ? 'docs/assets/hero-upload-storyboard' : 'docs/assets/hero-storyboard');
await mkdir(output,{recursive:true});
const browser = await chromium.launch();
const scenes = review ? [["01-retouched",1200,720,0],["02-original",1200,720,3],["03-request",1200,720,6],["04-saved",1200,720,8],["05-mobile",640,800,8]] : upload ? [['01-selected',1200,641,13],['02-drop-file',1200,641,15.5],['03-uploading',1200,641,16.5],['04-uploaded',1200,641,18.2],['05-mobile-uploaded',640,800,18.2]] : [['01-gallery',1200,641,0],['02-comment-writing',640,800,5.95],['03-comment-saved',640,800,6.5],['04-photographer',1200,641,11]];
const apiRequests=[];
try {
 for(const [name,width,height,time] of scenes){
  if(process.env.STORYBOARD_SCENE && name !== process.env.STORYBOARD_SCENE) continue;
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/api/') || /supabase/.test(url.hostname)){apiRequests.push(url.href);return route.abort();}if(![new URL(origin).hostname,"cdn.jsdelivr.net"].includes(url.hostname)) return route.abort();return route.continue();});
  await page.goto(`${origin}/landing/demo-capture?${review ? "reviewStoryboard=1" : upload ? "uploadStoryboard=1" : "storyboard=1"}`, {waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof window.renderDemoFrame==='function');
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  await page.evaluate(t=>window.renderDemoFrame(t),time);
  await page.waitForFunction(t=>Number(document.querySelector('#demo-film').dataset.time)===t,time);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.locator('#demo-film').screenshot({path:path.join(output,`${name}.png`)});
  console.log(name);
  await page.close();
 }
 if(apiRequests.length)throw new Error(`API 요청 발견: ${apiRequests.join(',')}`);
 await writeFile(path.join(output,'manifest.json'),JSON.stringify({scenes,apiRequests},null,2));
}finally{await browser.close();}
