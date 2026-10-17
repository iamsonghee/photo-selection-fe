// 기존 랜딩 연출의 PC·모바일 시연 이미지를 다시 캡처한다. 로컬 개발 서버가 필요하다.
import { chromium } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
(async()=>{
 const out=root+'/public/landing/posters'; await fs.mkdir(out,{recursive:true});
 const meta={}; const browser=await chromium.launch();
 for(const [variant,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.addInitScript(() => {
    Object.defineProperties(navigator, {
      deviceMemory: { configurable: true, value: 8 },
      hardwareConcurrency: { configurable: true, value: 8 },
      connection: { configurable: true, value: { saveData: false, effectiveType: '4g', downlink: 10 } },
    });
  });
  const page=await context.newPage();
  async function shot(name,selector,style){
   const el=page.locator(selector); await el.scrollIntoViewIfNeeded();
   await page.locator(selector+' img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
   const png=await el.screenshot({animations:'disabled',style});
   const file=out+'/'+name+'-'+variant+'.webp';
   await sharp(png).resize({width:variant==='mobile'?780:1440,withoutEnlargement:true}).webp({quality:76}).toFile(file);
   const info=await sharp(file).metadata(); (meta[name]??={})[variant]={width:info.width,height:info.height};
   console.log(name,variant,(await fs.stat(file)).size);
  }
  await page.goto(baseURL+'/'); await page.waitForSelector('#top .cur',{state:'attached'});
  await shot('main-hero','#top', '.nav,.copy,.veil,.tray,.cur{visibility:hidden!important} #sheet .cell{opacity:1!important} #sheet img{filter:saturate(.88) brightness(1.03)!important;opacity:.9!important} #sheet .ck,#sheet .hv{display:none!important}');
  await shot('main-still','#still','#still{width:360px;max-width:100%}');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(baseURL+'/select'); await page.waitForSelector('#sTiles .tile');
  await shot('select-hero','#sStage','.nav,.heads,.sprog,.cnt,.sendp{visibility:hidden!important} .stage::before{display:none!important}');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.reload();
  await page.waitForFunction(()=>document.querySelector('#sGrid')?.children.length>0);
  await shot('select-checks','#chk');
  await shot('select-scenes','.sview');
  await shot('select-phone','.together .devwrap');
  await shot('select-send','#sendVis');
  await shot('select-tidy','#tidy');
  await page.goto(baseURL+'/studio'); await page.waitForSelector('#ggrid img');
  await shot('studio-hero','#lStage','.nav,.top,.gal,.gdim,.noti,.scrollcue{visibility:hidden!important} #frags{opacity:1!important} .frag{opacity:.5!important} @media(max-width:700px){#frags .frag:not(.s0){display:none!important} #frags .frag.s0{opacity:.7!important}}');
  await shot('studio-board','#bfit');
  for(const mode of ['rec','stack','quality','family']){
   await page.locator('#flist button[data-s="'+mode+'"]').click();
   await shot('studio-phone-'+mode,'.ease .devwrap');
  }
  await context.close();
 }
 await fs.writeFile(root+'/src/components/landing/posters.json',JSON.stringify(meta,null,2)+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
