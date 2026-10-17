/**
 * 랜딩 시안(design/landing-preview/<select|studio>/index.html)의 <style>을 실제 랜딩 CSS로 옮긴다.
 *   node scripts/landing-preview-css.mjs select   → src/app/select/_landing/select-landing.css
 *   node scripts/landing-preview-css.mjs studio   → src/app/studio/_landing/studio-landing.css
 *   node scripts/landing-preview-css.mjs main     → src/app/_landing/main-landing.css
 * - 모든 선택자를 루트 클래스(.sl / .stl / .mnl) 안으로 한정해 다른 화면에 새지 않게 한다. 키프레임 이름도 앞에 붙인다.
 * - 시안에만 남은 안 쓰는 규칙(메모·예전 장면)을 지운다. 시안 마크업이 바뀌면 DEAD 목록도 확인할 것.
 * - 레이아웃을 다시 계산하는 애니메이션은 FIXES에서 grid 행 펼침으로 바꾼다.
 * - 튕기는 움직임은 부드러운 감속으로 바꾸고(사용자 결정 2026-10-16), 글꼴은 next/font 변수(src/lib/landing-fonts.ts)를 먼저 쓴다.
 * 시안 HTML·스크립트(마크업은 *Landing.tsx, 움직임은 motion.ts)는 손으로 옮긴다.
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const SPACES = {
  select: { pre: "sl", dead: "memo|chip|hero|bubble|board|t|slabel|counter|final40|replay|scene|glow|plate|arch|gphone|gs|cam|upl2|alb|gdots|chat", name: "내 사진 셀렉 랜딩" },
  studio: { pre: "stl", dead: "memo|chip|hero|scene|box", name: "작가·스튜디오 랜딩" },
  main: { pre: "mnl", dead: "memo|ph|logo|fine", name: "통합 랜딩(/)", out: "src/app/_landing/main-landing.css" },
};
const space = process.argv[2];
const cfg = SPACES[space];
if (!cfg) { console.error("사용법: node scripts/landing-preview-css.mjs <select|studio|main>"); process.exit(1); }

const root = path.join(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, `design/landing-preview/${space}/index.html`), "utf8");
const styles = [...html.matchAll(/^<style>\n([\s\S]*?)^<\/style>$/gm)];
if (styles.length !== 1) { console.error(`시안의 <style> 블록을 하나로 찾지 못했어요(${styles.length}개).`); process.exit(1); }

const css = postcss.parse(styles[0][1]);
const P = cfg.pre, DEAD = new RegExp(`(?:^|[\\s>+~])\\.(${cfg.dead})(?![\\w-])`);
const KF = {};
css.walkAtRules("keyframes", (a) => { KF[a.params] = `${P}-${a.params}`; a.params = KF[a.params]; });
css.walkRules((r) => {
  if (r.parent.type === "atrule" && /keyframes/.test(r.parent.name)) return;
  const keep = r.selectors.filter((s) => !DEAD.test(s));
  if (!keep.length) { const parent = r.parent; r.remove(); if (parent.type === "atrule" && !parent.nodes.length) parent.remove(); return; }
  r.selectors = keep.map((s) => (s === ":root" || s === "body" ? `.${P}` : s === "*" ? `.${P} *` : `.${P} ${s}`));
});
css.walkDecls(/^animation/, (d) => { for (const k in KF) d.value = d.value.replace(new RegExp(`\\b${k}\\b`), KF[k]); });

const out = `/* ${cfg.name} — design/landing-preview/${space} 시안에서 옮김(scripts/landing-preview-css.mjs로 생성, 직접 고치지 말 것). 모든 선택자는 .${P} 안으로 한정. */\n`
  + css.toString().replace(/^\/\* Layout:.*\n/, "")
    .replace(/cubic-bezier\(\.3,1\.6,\.5,1\)/g, "cubic-bezier(.22,1,.36,1)")
    .replace('--f-body:"IBM Plex Sans KR"', '--f-body:var(--sl-font-body),"IBM Plex Sans KR"')
    .replace('--f-mono:"IBM Plex Mono"', '--f-mono:var(--sl-font-mono),"IBM Plex Mono"')
  + `\n/* 시안은 브라우저 기본 제목 굵기에 기댄다 — 프로젝트의 Tailwind 기본 스타일이 지운 것을 되돌림 */\n.${P} h1,.${P} h2,.${P} h3{font-weight:700}\n`;
// 시안에서 고쳐 쓰는 규칙 — 찾는 문자열이 시안에서 사라지면 멈춘다(시안이 바뀌었으니 다시 확인할 것).
const FIXES = {
  select: [],
  main: [
    // 서버 HTML의 사진판도 hydration 전부터 같은 반응형 열 구성을 사용한다.
    [".sheet{position:absolute;inset:0;display:grid;gap:10px;padding:14px;align-content:center}", ".sheet{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);gap:10px;padding:14px;align-content:center}"],
    [".mnl .cell{position:relative;margin:0;", "@media (max-width:999px){.mnl .sheet{grid-template-columns:repeat(5,1fr)}}\n@media (max-width:599px){.mnl .sheet{grid-template-columns:repeat(3,1fr)}}\n.mnl .cell{position:relative;margin:0;"],
    [";filter:blur(8px);opacity:.3;transition:filter .9s,opacity .9s", ""],
    [".mnl .copy h1.in{filter:none;opacity:1}\n", ""],
  ],
  studio: [
    // 고객 셀렉 화면 항목 설명: max-height·margin 애니메이션(레이아웃 다시 계산) → grid 행 0fr→1fr과 row-gap으로 같은 펼침
    [".flist button{all:unset;cursor:pointer;display:block;", ".flist button{all:unset;cursor:pointer;display:grid;grid-template-rows:auto 0fr;row-gap:0;"],
    ["border:1px solid transparent;transition:background .25s,border-color .25s}", "border:1px solid transparent;transition:background .25s,border-color .25s,grid-template-rows .35s,row-gap .3s}"],
    ["max-height:0;overflow:hidden;opacity:0;transition:max-height .35s,opacity .3s,margin .3s}", "min-height:0;overflow:hidden;opacity:0;transition:opacity .3s}"],
    ['.flist button[aria-selected="true"]{background:#fff;', '.flist button[aria-selected="true"]{grid-template-rows:auto 1fr;row-gap:4px;background:#fff;'],
    ['.flist button[aria-selected="true"] span{max-height:5em;opacity:1;margin-top:4px}', '.flist button[aria-selected="true"] span{opacity:1}'],
    ["{.stl .flist button span,.stl .cs .c{transition:none}}", "{.stl .flist button,.stl .flist button span,.stl .cs .c{transition:none}}"],
  ],
};
let fixed = out;
for (const [from, to] of FIXES[space]) {
  if (!fixed.includes(from)) { console.error(`고칠 규칙을 시안에서 찾지 못했어요: ${from}`); process.exit(1); }
  fixed = fixed.replace(from, to);
}
const outPath = cfg.out ?? `src/app/${space}/_landing/${space}-landing.css`;
fs.writeFileSync(path.join(root, outPath), fixed);
console.log(`${outPath} 생성`);
