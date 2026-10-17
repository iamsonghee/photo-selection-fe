import { cellHTML, PH } from "./hero-cells";

/**
 * 통합 랜딩(/)의 움직임 — design/landing-preview/main 시안의 스크립트를 그대로 옮겼다.
 * 화면을 떠나면(언마운트) 반환된 함수가 타이머·관찰자·이벤트·애니메이션을 모두 정리한다.
 */
export function startMainLanding(root: HTMLElement): () => void {
  const ac = new AbortController(), timers = new Set<number>(), observers: IntersectionObserver[] = [], anims = new Set<Animation>();
  let alive = true;
  const $ = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  const on = (el: EventTarget, ev: string, fn: (e: Event) => void) => el.addEventListener(ev, fn, { signal: ac.signal });
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  const sleep = (ms: number) => new Promise<void>((r) => later(r, ms));
  const frame = (fn: () => void) => requestAnimationFrame(() => alive && fn());
  const watch = (el: Element, opts: IntersectionObserverInit, cb: (e: IntersectionObserverEntry) => void) => {
    const o = new IntersectionObserver((es) => es.forEach(cb), opts); o.observe(el); observers.push(o);
  };
  // 히어로는 화면에 있는 동안 계속 반복하므로, 끝난 애니메이션은 목록에서 뺀다(언마운트 때 진행 중인 것만 취소)
  const animate = (el: Element, kf: Keyframe[], opts: KeyframeAnimationOptions) => {
    const a = el.animate(kf, opts); anims.add(a);
    return a.finished.catch(() => undefined).finally(() => anims.delete(a));
  };

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;


  /* 1 히어로 — 가족이 찜하고, 나만 최종 선택, 고른 사진이 한곳에 모임 */
  const hero = $("top"), sheet = $("sheet"), tray = $("tray"), slots = $("slots"), trayN = $("trayN"), copy = root.querySelector<HTMLElement>(".copy")!;
  let cells: HTMLElement[] = [], run = 0;
  function build() {
    const w = hero.clientWidth, h = hero.clientHeight, cols = w < 600 ? 3 : w < 1000 ? 5 : 8;
    const cw = (w - 28 - (cols - 1) * 10) / cols, ch = cw * 1.25 + 10;
    const rows = Math.ceil(h / (ch + 10)) + 2;
    sheet.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    // 첫 HTML의 이미지를 보존하고 화면 크기에 필요한 장수만 조정한다.
    const count = cols * rows;
    while (sheet.children.length > count) sheet.lastElementChild!.remove();
    for (let i = sheet.children.length; i < count; i++) {
      const cell = document.createElement("figure");
      cell.className = "cell"; cell.innerHTML = cellHTML(PH(i)); sheet.appendChild(cell);
    }
    cells = [...sheet.children] as HTMLElement[];
  }
  const rel = (el: Element) => { const r = el.getBoundingClientRect(), b = hero.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; };
  let mob: { top: number; bottom: number } | null = null;
  // 덮개에 가리지 않고 통째로 보이는 칸만 고른다
  function visible(i: number) {
    const r = rel(cells[i]), H = hero.clientHeight, W = hero.clientWidth;
    if (W < 700) { // 휴대폰: 글 위·아래 줄(layoutMobile이 줄 경계에 맞춤) 중 메뉴 알약에 가리지 않고 화면 안에 통째로 있는 칸
      if (!mob || r.y < 30 || r.y + r.h > H - 10 || (r.y < 60 && r.x < W / 2 + 80 && r.x + r.w > W / 2 - 80)) return false;
      return r.y + r.h <= mob.top - 30 || r.y >= mob.bottom + 30;
    }
    if (r.y < 70 || r.y + r.h > H - 96 || r.x < 0 || r.x + r.w > W) return false;
    // 덮개(가운데 타원, 반지름 44%·40%)의 진한 부분(55%) 밖에 사진이 통째로 있어야 함
    const ox = W / 2, oy = H * .46, px = Math.max(r.x, Math.min(ox, r.x + r.w)), py = Math.max(r.y, Math.min(oy, r.y + r.h));
    return ((px - ox) / (W * .44)) ** 2 + ((py - oy) / (H * .40)) ** 2 > .55 ** 2;
  }
  let cycle = 0;
  function choose() {
    const cand = cells.map((_, i) => i).filter(visible);
    // 가운데 글을 피해 고르게 흩어지도록 순서를 섞되, 바퀴마다 다른 자리(시드 = 바퀴 수)
    let s = 11 + cycle * 7919; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let order = cand.map((v) => [rnd(), v]).sort((a, b) => a[0] - b[0]).map((v) => v[1]);
    // 한 곳에서 주르륵 고르지 않게 구역을 번갈아 가며 — 휴대폰은 줄, PC는 좌·가운데·우 × 위·아래
    const W = hero.clientWidth, H = hero.clientHeight;
    const key = (i: number) => { const r = rel(cells[i]); return W < 700 ? (mob && r.y < mob.top ? "T" : "B") : (r.x + r.w / 2 < W / 3 ? "L" : r.x + r.w / 2 > W * 2 / 3 ? "R" : "M") + (r.y + r.h / 2 < H * .46 ? "T" : "B"); };
    const groups: Record<string, number[]> = {}; order.forEach((i) => (groups[key(i)] ||= []).push(i));
    const g = Object.keys(groups).map((k) => [rnd(), groups[k]] as const).sort((a, b) => a[0] - b[0]).map((v) => v[1]); order = [];
    for (let k = 0; g.some((x) => x.length); k++) { const x = g[k % g.length]; if (x.length) order.push(x.shift()!); }
    return { liked: order.slice(0, Math.min(5, order.length)), picks: order.slice(0, Math.min(3, order.length)) };
  }
  const setLike = (i: number, n: number) => {
    const c = cells[i], hv = c.querySelector<HTMLElement>(".hv")!; const up = c.classList.contains("liked");
    c.classList.add("liked"); hv.querySelector("span")!.textContent = String(n);
    if (up && !REDUCED) {
      animate(hv.querySelector("span")!, [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  };
  function fill(picks: number[]) {
    slots.innerHTML = picks.map((i) => `<span class="slot"><img src="${cells[i].querySelector("img")!.src}" alt=""></span>`).join("");
    trayN.textContent = `최종 선택 ${picks.length}장`;
  }
  async function fly(i: number, k: number) {
    const slot = slots.children[k] as HTMLElement | undefined; if (!slot) return;
    const a = rel(cells[i].querySelector("img")!), s = rel(slot);
    const img = document.createElement("img"); img.className = "flyer"; img.src = cells[i].querySelector("img")!.src; img.alt = "";
    Object.assign(img.style, { left: a.x + "px", top: a.y + "px", width: a.w + "px", height: a.h + "px" });
    hero.appendChild(img); slot.style.opacity = "0";
    await animate(img, [{ transform: "none" }, { transform: `translate(${s.x - a.x}px,${s.y - a.y}px) scale(${s.w / a.w},${s.h / a.h})` }], { duration: 700, easing: "cubic-bezier(.5,0,.2,1)" });
    img.remove(); slot.style.opacity = "1";
  }
  function reset() {
    cells.forEach((c) => { c.classList.remove("liked", "pick", "rest", "fade", "hover"); c.querySelector(".hv span")!.textContent = ""; });
    tray.classList.remove("on");
  }
  function finalState() {
    const { liked, picks } = choose();
    liked.forEach((i, k) => setLike(i, picks.includes(i) ? 3 : 1 + (k % 2)));
    picks.forEach((i) => cells[i].classList.add("pick"));
    cells.forEach((c, i) => { if (!picks.includes(i)) c.classList.add("rest"); });
    fill(picks); tray.classList.add("on");
  }
  async function play() {
    const id = ++run, { liked, picks } = choose();
    const live = () => alive && id === run;
    reset();
    await sleep(500);
    // 세 사람이 각자 다른 사진에 동시에 찜 — 커서가 사진에 내려앉으면 ♥ 숫자가 오름
    const L = liked, BATCH = [[L[0], L[1], L[2]], [L[3], L[0], L[1]], [L[1], L[2], L[0]]];
    for (const batch of BATCH) {
      if (!live()) return;
      batch.forEach((i, who) => { if (i !== undefined) later(() => live() && tap(i, who), who * 380); }); // 세 사람이 조금씩 엇갈려 출발
      await sleep(2000);
    }
    await sleep(100);
    [0, 1, 2].forEach((k) => (cursors[k].style.transform = home(k))); // 가족은 빠지고
    await sleep(500);
    for (const i of picks) { if (!live()) return; await check(i); await sleep(250); } // 최종 선택은 나만
    cursors[3].style.transform = home(3);
    await sleep(200);
    cells.forEach((c, i) => { if (!picks.includes(i)) c.classList.add("rest"); });
    fill(picks); tray.classList.add("on"); await sleep(300);
    picks.forEach((i, k) => later(() => fly(i, k), k * 140));
    await sleep(1200 + 2500); if (!live()) return; // 모인 결과를 잠깐 보여 주고
    cells.forEach((c) => { c.classList.remove("pick", "rest"); c.classList.add("fade"); }); tray.classList.remove("on"); // 표시를 천천히 지우며
    await sleep(450); if (!live()) return;
    await nextRow(); if (!live()) return; // 사진판을 한 줄 올려 새 사진으로
    cycle++; play();
  }
  const PEOPLE = [["민서", "#3b82f6"], ["지훈", "#8b5cf6"], ["엄마", "#22c55e"], ["나", "#0f2a38"]]; // 제품 참여자 색(gallery-filter COLOR_OPTIONS) 파랑·보라·초록
  let cursors: HTMLElement[] = [];
  const home = (k: number) => { const W = hero.clientWidth, H = hero.clientHeight; return `translate(${k === 1 || k === 3 ? W + 30 : -80}px,${H * (.3 + (k % 3) * .22)}px)`; };
  function makeCursors() {
    cursors.forEach((c) => c.remove());
    cursors = PEOPLE.map(([name, color], k) => {
      const el = document.createElement("div"); el.className = k === 3 ? "cur me" : "cur";
      el.innerHTML = `<svg width="22" height="24" viewBox="0 0 18 20"><path d="M1 1l15 8-6.5 1.6L6 18z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${color}${k === 3 ? ";color:#fff" : ""}">${name}</span>`;
      el.style.transform = home(k); // 화면 밖에서 들어옴
      hero.appendChild(el); return el;
    });
  }
  const press = (c: HTMLElement) => animate(c.querySelector("svg")!, [{ transform: "scale(1)" }, { transform: "scale(.78)" }, { transform: "scale(1)" }], { duration: 220 });
  // 커서가 사진에 올라가면 흰 ♡가 보이고(제품 hover), ♡를 누르면 주황 ♥ — 숫자가 오름
  function tap(i: number, who: number) {
    const c = cursors[who], r = rel(cells[i].querySelector("img")!);
    c.style.transform = `translate(${r.x + 26}px,${r.y + r.h - 26}px)`; // ♡ 버튼 자리(사진 왼쪽 아래)
    later(() => cells[i]?.classList.add("hover"), 800);
    later(() => {
      if (!cells[i]) return;
      press(c);
      const n = cells[i].classList.contains("liked") ? +cells[i].querySelector(".hv span")!.textContent! + 1 : 1; setLike(i, n);
    }, 1250);
  }
  // 최종 선택은 나만 — 나의 커서가 체크 상자(사진 왼쪽 위)를 누름
  async function check(i: number) {
    const c = cursors[3], r = rel(cells[i].querySelector("img")!);
    c.style.transform = `translate(${r.x + 18}px,${r.y + 16}px)`;
    await sleep(1000);
    press(c);
    cells[i]?.classList.add("pick");
  }
  async function nextRow() {
    const cols = getComputedStyle(sheet).gridTemplateColumns.split(" ").length;
    const step = cells[cols].getBoundingClientRect().top - cells[0].getBoundingClientRect().top;
    await animate(sheet, [{ transform: "none" }, { transform: `translateY(${-step}px)` }], { duration: 800, easing: "cubic-bezier(.4,0,.2,1)" });
    if (!alive) return;
    cells.slice(0, cols).forEach((c) => sheet.appendChild(c)); // 맨 윗줄을 맨 아래로 — 자리는 그대로, 사진만 한 줄씩 밀림
    cells = [...sheet.children] as HTMLElement[];
    reset();
  }
  const setVeil = () => { const c = rel(copy); hero.style.setProperty("--vt", c.y + "px"); hero.style.setProperty("--vb", c.y + c.h + "px"); };
  // 휴대폰: 글 위에 사진 한 줄(통째로), 글, 글 아래 사진 줄 — 화면 높이와 상관없이 위·아래 모두 찜할 칸이 생기게 줄 경계에 맞춤
  function layoutMobile() {
    const W = hero.clientWidth;
    if (W >= 700) { mob = null; copy.style.top = copy.style.transform = hero.style.height = sheet.style.top = sheet.style.alignContent = ""; return; }
    const cols = W < 600 ? 3 : 5, cw = (W - 28 - (cols - 1) * 10) / cols, cellH = (cw - 10) * 1.25 + 10, P = cellH + 10, ch = copy.offsetHeight;
    const A = 60, gap = 64, k = Math.ceil((cellH + 2 * gap + ch) / P), B = A + k * P; // A: 윗줄 윗변, B: 글 아래 첫 줄 윗변
    const top = (A + cellH + B) / 2 - ch / 2; // 두 줄 사이 가운데에 글
    copy.style.top = top + "px"; copy.style.transform = "translateX(-50%)";
    sheet.style.top = (A - P - 14) + "px"; sheet.style.alignContent = "start";
    hero.style.height = Math.round(Math.max(innerHeight, B + cellH + 20)) + "px";
    mob = { top, bottom: top + ch };
  }
  layoutMobile(); build(); setVeil(); makeCursors();
  document.fonts?.ready.then(() => { if (alive) { layoutMobile(); setVeil(); } });
  let inView = false;
  if (REDUCED) frame(finalState);
  else watch(hero, { threshold: .3 }, (e) => { inView = e.isIntersecting; if (inView) play(); else { run++; reset(); } });
  // 열릴 때 창 높이가 조금 바뀌는 건 무시하고, 열 수가 바뀔 때만 다시 깔고 처음부터 재생
  let rt = 0, lastCols = sheet.style.gridTemplateColumns, lastH = hero.clientHeight;
  on(window, "resize", () => {
    clearTimeout(rt); rt = later(() => {
      layoutMobile(); setVeil();
      const cols = innerWidth < 600 ? 3 : innerWidth < 1000 ? 5 : 8;
      if (`repeat(${cols}, 1fr)` === lastCols && Math.abs(hero.clientHeight - lastH) < 120) return;
      run++; layoutMobile(); build(); setVeil(); makeCursors(); lastCols = sheet.style.gridTemplateColumns; lastH = hero.clientHeight;
      if (REDUCED) finalState(); else if (inView) play();
    }, 250);
  });

  /* 3 마무리 — 히어로 마지막 장면의 정지 화면 */
  const TILT: [string, string, number][] = [["-6deg", "6px", 1], ["0deg", "-4px", 2], ["5deg", "2px", 3]]; // 기울기 · 높이 · 겹침 순서
  const still = $("still");
  still.innerHTML = TILT.map(([r, y, z], k) => `<figure class="cell" style="--r:${r};--y:${y};z-index:${z};position:relative">${cellHTML(PH(k * 7 + 4))}</figure>`).join("");
  const stillCells = [...still.children] as HTMLElement[];
  // 펼치기 전에는 모두 가운데 한 묶음으로 (레이아웃 위치 기준이라 변형과 상관없이 잼)
  const gather = () => stillCells.forEach((c) => c.style.setProperty("--sx", (still.clientWidth / 2 - (c.offsetLeft + c.offsetWidth / 2)) + "px"));
  gather(); on(window, "resize", gather);
  // 펼치기 → 한 장씩 ✓ → 잠깐 보여 주고 → 다시 한 묶음으로, 화면에 보이는 동안 반복
  let fRun = 0, stillIn = false;
  const delays = (f: (k: number) => number) => stillCells.forEach((c, k) => (c.style.transitionDelay = f(k) + "ms"));
  async function loopStill() {
    const id = ++fRun, live = () => alive && id === fRun;
    if (still.classList.contains("on")) { stillCells.forEach((c) => c.classList.remove("pick")); delays(() => 0); still.classList.remove("on"); await sleep(900); }
    while (live()) {
      delays((k) => k * 90); still.classList.add("on");
      await sleep(900); if (!live()) return; delays(() => 0);
      for (const c of stillCells) { c.classList.add("pick"); await sleep(260); if (!live()) return; } // 한 장씩 ✓
      await sleep(2600); if (!live()) return; // 모인 결과를 잠깐
      stillCells.forEach((c) => c.classList.remove("pick")); await sleep(350); if (!live()) return;
      delays((k) => (stillCells.length - 1 - k) * 60); still.classList.remove("on"); // 다시 한 묶음으로
      await sleep(1200);
    }
  }
  if (REDUCED) { still.classList.add("on"); stillCells.forEach((c) => c.classList.add("pick")); }
  else watch(still, { rootMargin: "0px 0px -20% 0px", threshold: .8 }, (e) => { stillIn = e.isIntersecting; if (stillIn) later(() => stillIn && loopStill(), 350); else fRun++; });

  return () => {
    alive = false; ac.abort();
    timers.forEach(clearTimeout); observers.forEach((o) => o.disconnect()); anims.forEach((a) => a.cancel());
    hero.querySelectorAll(".cur, .flyer").forEach((el) => el.remove()); // 스크립트가 히어로에 붙인 커서·날아가는 사진
  };
}
