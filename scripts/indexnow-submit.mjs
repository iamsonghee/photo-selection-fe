#!/usr/bin/env node
/**
 * 운영 사이트맵의 URL을 IndexNow로 검색 엔진에 알린다(네이버·Bing 등, Google은 미지원).
 * 계정 없이 `public/<KEY>.txt` 키 파일로 사이트 소유를 증명한다 — 키 파일이 배포된 뒤에만 실행한다.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs            # 보낼 URL만 출력(기본, 전송하지 않음)
 *   node scripts/indexnow-submit.mjs --submit   # 실제 전송
 *
 * 키를 바꾸면 public/의 키 파일 이름·내용도 같이 바꾼다.
 */

const SITE_URL = "https://www.acut.kr";
const KEY = "6b450f64221525ea4daabc787f24e635";
// 참여 엔진끼리 제출을 공유하지만, 네이버 반영이 목적이라 네이버에도 직접 보낸다.
const ENDPOINTS = ["https://searchadvisor.naver.com/indexnow", "https://api.indexnow.org/indexnow"];

const submit = process.argv.includes("--submit");

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

const keyLocation = `${SITE_URL}/${KEY}.txt`;
const deployedKey = (await fetchText(keyLocation)).trim();
if (deployedKey !== KEY) throw new Error(`키 파일 내용이 KEY와 다릅니다: ${keyLocation}`);

const sitemap = await fetchText(`${SITE_URL}/sitemap.xml`);
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
if (urlList.length === 0) throw new Error("sitemap.xml에서 URL을 찾지 못했습니다.");

console.log(`URL ${urlList.length}개:\n${urlList.map((url) => `  ${url}`).join("\n")}`);
if (!submit) {
  console.log("\n전송하지 않았습니다. 실제로 보내려면 --submit을 붙여 실행해 주세요.");
  process.exit(0);
}

const body = JSON.stringify({ host: new URL(SITE_URL).host, key: KEY, keyLocation, urlList });
for (const endpoint of ENDPOINTS) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  // 200·202 = 접수. 403 = 키 확인 실패, 422 = URL이 host와 다름, 429 = 너무 잦은 제출.
  console.log(`${endpoint} → HTTP ${response.status}`);
}
