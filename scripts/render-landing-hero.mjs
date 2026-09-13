import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.DEMO_ORIGIN || "http://127.0.0.1:3001";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("로컬 개발 서버만 녹화할 수 있습니다.");
// 기존 히어로 실측 1200×641의 비율을 유지하고 2배 해상도로 캡처한다.
const review = process.argv.includes("--review");
const mobile = process.argv.includes("--mobile");
const stem = review ? "acut-review" : mobile ? "acut-demo-mobile" : "acut-demo";
const width = mobile ? 640 : 1200, height = mobile ? 800 : review ? 720 : 641, scale = mobile ? 1.5 : 2, fps = 30, seconds = review ? 12 : 20, count = fps * seconds;
const frames = process.env.DEMO_FRAMES || path.join(tmpdir(), review ? "acut-review-frames" : mobile ? "acut-hero-mobile-frames" : "acut-hero-frames");
const output = path.join(root, review ? "public/landing/review" : "public/landing/hero");
await mkdir(frames, { recursive: true });
await mkdir(output, { recursive: true });
if (!process.argv.includes("--encode-only")) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    const forbidden = [];
    // 캡처 경로/정적 파일 이외의 서비스 라우트와 API는 녹화 중 접근할 수 없다.
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(origin).origin &&
          (url.pathname === "/landing/demo-capture" || url.pathname.startsWith("/_next/") ||
           url.pathname.startsWith("/landing/sample-project/") || url.pathname.startsWith("/fonts/") ||
           /\.(woff2?|ico)$/.test(url.pathname))) return route.continue();
      if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/gh/orioncactus/pretendard@v1.3.9/")) return route.continue();
      forbidden.push(url.origin + url.pathname);
      return route.abort();
    });
    await page.goto(`${origin}/landing/demo-capture${review ? "?reviewStoryboard=1" : ""}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.renderDemoFrame === "function");
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll("img").length > 0 && [...document.querySelectorAll("img")].every(img => img.complete && img.naturalWidth > 0));
    const film = page.locator("#demo-film");
    for (let frame = 0; frame < count; frame++) {
      await page.evaluate(time => window.renderDemoFrame(time), frame / fps);
      await page.waitForFunction(time => Number(document.querySelector("#demo-film").dataset.time) === time, frame / fps);
      await film.screenshot({ path: path.join(frames, `frame-${String(frame).padStart(5, "0")}.png`) });
      if (frame % 90 === 0) console.log(`Rendered ${frame}/${count}`);
    }
    const serviceRequests = forbidden.filter(url => /\/api\/|supabase|\/c\/|\/photographer\//.test(url));
    if (serviceRequests.length) throw new Error(`서비스 요청 시도 발견: ${serviceRequests.join(", ")}`);
    await writeFile(path.join(frames, "network.json"), JSON.stringify({ blockedNonAssetRequests: forbidden, serviceRequests }, null, 2));
  } finally { await browser.close(); }
}
await sharp(path.join(frames, "frame-00000.png")).webp({ quality: 85 }).toFile(path.join(output, `${stem}-poster.webp`));
let ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) {
  const cache = path.join(homedir(), "Library/Caches/ms-playwright");
  const folder = (await readdir(cache)).filter(name => name.startsWith("ffmpeg-")).sort().at(-1);
  if (!folder) throw new Error("Playwright 번들 FFmpeg 경로를 FFMPEG_PATH로 지정하세요.");
  ffmpeg = path.join(cache, folder, "ffmpeg-mac");
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error || ""}`);
}
// Playwright의 최소 FFmpeg 빌드는 PNG 입력 대신 MJPEG pipe 입력을 지원한다.
const encoder = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-r", String(fps), "-c:v", "mjpeg", "-i", "pipe:0",
  "-c:v", "libvpx", "-b:v", "2600k", "-crf", "10", "-qmax", "30", "-deadline", "good", "-cpu-used", "4", "-threads", "4", "-pix_fmt", "yuv420p", "-an",
  path.join(output, `${stem}.webm`)], { stdio: ["pipe", "inherit", "inherit"] });
const encoded = once(encoder, "close");
for (let frame = 0; frame < count; frame++) {
  const jpeg = await sharp(path.join(frames, `frame-${String(frame).padStart(5, "0")}.png`))
    .jpeg({ quality: 97, chromaSubsampling: "4:4:4" }).toBuffer();
  if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");
}
encoder.stdin.end();
if ((await encoded)[0] !== 0) throw new Error("WebM encoding failed");
run("swift", ["-module-cache-path", process.env.SWIFT_MODULE_CACHE || "/tmp/acut-swift-module-cache",
  path.join(root, "scripts/encode-landing-mp4.swift"), frames, path.join(output, `${stem}.mp4`),
  String(width * scale), String(height * scale), String(fps), String(count)]);
// macOS 인코더가 남긴 이번 출력의 임시 복사본을 배포 자산에 포함하지 않는다.
for (const name of await readdir(output)) {
  if (name.startsWith(`${stem}.mp4.sb-`)) await unlink(path.join(output, name));
}
const files = {};
for (const name of [`${stem}.webm`, `${stem}.mp4`, `${stem}-poster.webp`]) files[name] = (await stat(path.join(output, name))).size;
const manifest = { seconds, fps, width: width * scale, height: height * scale, files,
  gallery: ["01", "02", "05", "06", "10", "03", "04", "07", "08", "09"], selected: ["01", "06", "10"],
  retouched: { photoId: "01", filename: "ACUT_0001-보정.jpg" },
  comment: "얼굴 주변 잔머리만 자연스럽게 정리해주세요." };
if (review) {
  manifest.gallery = ["10"];
  manifest.selected = ["10"];
  manifest.retouched = {photoId:"10", filename:"ACUT_0010-보정.jpg"};
  manifest.comment = "피부 톤을 조금 더 자연스럽게 조정해주세요.";
}
await writeFile(path.join(output, mobile ? "manifest-mobile.json" : "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(manifest);
