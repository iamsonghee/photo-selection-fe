/**
 * 내 사진 셀렉 랜딩의 움직임 — design/landing-preview/select 시안의 스크립트를 그대로 옮겼다.
 * 화면을 떠나면(언마운트) 반환된 함수가 타이머·관찰자·이벤트·애니메이션 루프를 모두 정리한다.
 */
export function startSelectLanding(root: HTMLElement): () => void {
  const ac = new AbortController(), timers: number[] = [], observers: IntersectionObserver[] = [];
  let alive = true, raf = 0;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const on = (el: EventTarget, ev: string, fn: (e: Event) => void) => el.addEventListener(ev, fn, { signal: ac.signal });
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => alive && fn(), ms)); };
  const sleep = (ms: number) => new Promise<void>((r) => later(r, ms));
  const frame = (fn: FrameRequestCallback) => requestAnimationFrame((t) => alive && fn(t));
  const watch = (el: Element, opts: IntersectionObserverInit, cb: (e: IntersectionObserverEntry) => void) => {
    const o = new IntersectionObserver((es) => es.forEach(cb), opts); o.observe(el); observers.push(o);
  };

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 사진 묶음(사용자가 만든 1차 샘플 사진): 장면별로 이름을 붙여 둠
  const R = (p: string, a: (string | number)[]) => a.map((x) => p + x);
  const CER = R("cer", ["02", "05", "00", "03", "06", "01", "04", "08", "01-0", "07"]), FLW = R("flower", [0, 3, 1, 4, 6, 2, 5, 8, 7]);
  const TBL = ["table1", "table3", "cake0", "table4", "table2", "table5"], STU = R("simple", [0, 9, 3, 12, 8, 6, 10, 1, 13, 2, 11, 4, 5, 7]), STW = R("stair", [0, 1, 2]).concat(R("window", [0, 1, 2]));
  const POOL = [...FLW, ...STW, "cake0", ...STU.slice(0, 6), ...CER.slice(0, 5), "table1", "table4"];
  const PF = (n: string) => `/landing/select/${n}.jpg`, PH = (i: number) => PF(POOL[i % POOL.length]);
  const HERO_D = [CER, FLW, TBL, STU, STW], HERO_M = [CER, FLW, TBL, ["simple3", "window0", "simple9", "stair1"]];

  /* 1 히어로 (스크롤) */
  const heroS = $("#top"), stage = $("#sStage"), tilesEl = $("#sTiles"), msgcard = $("#msgcard");
  const heads = $$(".heads .head"), sprog = $$(".sprog i"), cnt = $("#cnt"), sendp = $("#sendp");
  type Scene = [string, number, number];
  const SC_D: Scene[] = [["본식", 910, 12], ["플라워 포토월", 620, 9], ["캔들 테이블", 430, 6], ["스튜디오", 520, 8], ["계단·창가", 380, 5]];
  const SC_M: Scene[] = [["본식", 910, 12], ["플라워 포토월", 620, 9], ["캔들 테이블", 430, 6], ["스튜디오·창가", 900, 11]];
  type Tile = { el: HTMLElement; k: number; pick: boolean; pile: { x: number; y: number; r: number; d: number }; scene: { x: number; y: number } };
  let SC = SC_D, tiles: Tile[] = [], labs: HTMLElement[] = [], L: { s: number; kP: number; kS: number; cx: number; cy: number; rx: number; ry: number } | null = null, seedS = 9;
  const rndS = () => (seedS = (seedS * 16807) % 2147483647) / 2147483647;
  const tileHtml = (mobile: boolean, k: number, j: number) => { const set = (mobile ? HERO_M : HERO_D)[k]; return `<div class="in"><img src="${PF(set[(j + k * 2) % set.length])}" alt="" loading="lazy"></div><span class="ck">✓</span>`; };
  function buildS() {
    tilesEl.innerHTML = ""; stage.querySelectorAll(".slab").forEach((e) => e.remove()); tiles = []; labs = []; seedS = 9;
    const W = stage.clientWidth, H = stage.clientHeight, mobile = W < 700;
    SC = mobile ? SC_M : SC_D; stage.classList.toggle("mob", mobile);
    const rel = (el: Element) => el.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
    if (!mobile) {
      // 데스크톱: 장면 5줄 × 10장, 왼쪽에 장면 이름
      const per = 10, gap = 8, labelW = 130, top = H * .31, bottom = Math.min(H * .89, H * .94 - 60), rowH = (bottom - top) / SC.length;
      const availW = Math.min(W - 40 - labelW, 1200);
      const s = Math.max(24, Math.min((availW - gap * (per - 1)) / per, rowH - 6));
      const gridW = s * per + gap * (per - 1), left = (W - gridW - labelW) / 2 + labelW;
      const pileS = Math.min(W, 1000) * .09; // 더미는 작게, 정리된 장면은 크게
      for (let i = 0; i < per * SC.length; i++) {
        const k = Math.floor(i / per), j = i % per;
        const t = document.createElement("div"); t.className = "tile"; t.style.width = t.style.height = s + "px";
        t.innerHTML = tileHtml(mobile, k, j); tilesEl.appendChild(t);
        tiles.push({ el: t, k, pick: (j * 7 + k * 3) % per < Math.round(per * SC[k][2] / 12 * .35) + 1, pile: { x: rndS(), y: Math.min(1, Math.max(0, ((i % 5) + .5) / 5 + (rndS() - .5) * .18)), r: (rndS() - .5) * 44, d: rndS() }, scene: { x: left + j * (s + gap) + s / 2, y: top + k * rowH + s / 2 } });
      }
      SC.forEach((_, k) => { const l = document.createElement("div"); l.className = "slab"; l.style.left = (left - labelW) + "px"; l.style.top = (top + k * rowH + s / 2 - 18) + "px"; stage.appendChild(l); labs.push(l); });
      // 사진 더미 윗변을 버튼 바로 아래에 붙인다(화면이 높아도 여백이 벌어지지 않게)
      const pTop = rel($('.head[data-h="0"]')) + 16, ry = Math.max(40, (H * .9 - pTop - pileS / 2) / 2);
      L = { s, kP: pileS / s, kS: 1, cx: W / 2, cy: H * .9 - ry, rx: Math.min(W * .46, 620), ry };
      return;
    }
    // 휴대폰: 떠 있는 사진 16장(떠 있을 때 크기가 기준이라 테두리가 얇다) → 장면 4줄 × 4장
    const per = 4, gap = 6, labelH = 22;
    const hb0 = rel($('.head[data-h="0"]'));
    const hb1 = Math.max(rel($('.head[data-h="1"]')), rel($('.head[data-h="2"]')));
    const sTop = hb1 + 14, sBot = H - 98, rowH = (sBot - sTop) / SC.length;
    const s = Math.max(48, Math.min((W - 28 - gap * (per - 1)) / per, rowH - labelH - 6));
    const gridW = s * per + gap * (per - 1), left = (W - gridW) / 2;
    const pileS = Math.min(W * .24, 96);
    for (let i = 0; i < per * SC.length; i++) {
      const k = Math.floor(i / per), j = i % per;
      const t = document.createElement("div"); t.className = "tile"; t.style.width = t.style.height = pileS + "px";
      t.innerHTML = tileHtml(mobile, k, j); tilesEl.appendChild(t);
      tiles.push({ el: t, k, pick: (j + k) % 4 < 2 || (k === 1 && j === 3), pile: { x: Math.min(1, Math.max(0, ((i % 4) + .5) / 4 + (rndS() - .5) * .2)), y: Math.min(1, Math.max(0, (Math.floor(i / 4) + .5) / 4 + (rndS() - .5) * .16)), r: (rndS() - .5) * 26, d: rndS() }, scene: { x: left + j * (s + gap) + s / 2, y: sTop + k * rowH + labelH + s / 2 } });
    }
    SC.forEach((_, k) => { const l = document.createElement("div"); l.className = "slab"; l.style.left = left + "px"; l.style.top = (sTop + k * rowH) + "px"; stage.appendChild(l); labs.push(l); });
    const pTop = hb0 + 20, pBot = H - 84; // 바닥에서 띄움
    msgcard.style.top = (hb0 + 10) + "px"; msgcard.style.bottom = "auto";
    L = { s: pileS, kP: 1, kS: s / pileS, cx: W / 2, cy: (pTop + pBot) / 2, rx: Math.max(10, (W - pileS) / 2 - 12), ry: Math.max(8, (pBot - pTop - pileS) / 2 - 6) };
    msgcard.style.top = Math.round(L.cy - msgcard.offsetHeight / 2) + "px"; // 사진 더미의 위아래 가운데
  }
  const easeS = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clampS = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  let tNow = 0;
  function renderS(p: number) {
    if (!L) return; const { s, kP, kS, cx, cy, rx, ry } = L;
    tiles.forEach((t, i) => {
      const local = easeS(clampS((p - .12 - (i % 25) * .006) / .32));
      const breathe = REDUCED ? 0 : Math.sin(tNow / 900 + t.pile.d * 6) * 6 * (1 - local);
      const px = cx + (t.pile.x - .5) * 2 * rx, py = cy + (t.pile.y - .5) * 2 * ry + breathe;
      const x = px + (t.scene.x - px) * local, y = py + (t.scene.y - py) * local;
      t.el.style.transform = `translate(${x - s / 2}px,${y - s / 2}px) rotate(${t.pile.r * (1 - local)}deg) scale(${kP + (kS - kP) * local})`;
      t.el.style.zIndex = String(local > .5 ? 2 : 2 + Math.round(t.pile.d * 10));
      t.el.classList.toggle("pick", p > .66 && t.pick); t.el.classList.toggle("dim", p > .7 && !t.pick);
    });
    labs.forEach((l, k) => { l.style.opacity = p > .44 ? "1" : "0"; l.innerHTML = `${SC[k][0]}<small>${p > .66 ? `<b>${SC[k][2]}장</b> 골랐어요` : `${SC[k][1].toLocaleString()}장`}</small>`; });
    const h = p < .26 ? 0 : p < .64 ? 1 : 2;
    stage.classList.toggle("past", h > 0);
    heads.forEach((el, k) => el.classList.toggle("on", k === h)); sprog.forEach((el, k) => el.classList.toggle("on", k <= h));
    cnt.innerHTML = h === 0 ? "받은 사진 <b>2,860</b>장" : h === 1 ? `장면 <b>${SC.length}</b>개로 나눔` : "고른 사진 <b>40</b>장";
    sendp.classList.toggle("on", p > .84);
    msgcard.style.opacity = (1 - clampS((p - .06) / .12)).toFixed(3);
  }
  const progS = () => { const r = heroS.getBoundingClientRect(); return clampS(-r.top / (r.height - innerHeight)); };
  function loopS(t: number) { tNow = t; const r = heroS.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) renderS(REDUCED ? 0 : progS()); raf = frame(loopS); }
  if (REDUCED) { heroS.style.height = "auto"; stage.style.position = "relative"; }
  buildS(); raf = frame(loopS);
  document.fonts?.ready.then(() => alive && buildS());
  let rtS = 0; on(window, "resize", () => { clearTimeout(rtS); rtS = window.setTimeout(() => alive && buildS(), 250); });

  /* 2-1 올리자마자: 화면에 들어오면 재생, 섹션을 벗어나면 처음 상태로 — 돌아오면 다시 재생 */
  const upNum = $("#upNum"), upBar = $("#upBar"), upDone = $("#upDone");
  const upSt = $("#upSt"), chkLi = $$("#chk li"), aiBtn = $("#aiBtn");
  const cut = $("#cut"), cutN = $("#cutN");
  let upRun = 0, upPlaying = false;
  const chkSet = (li: HTMLElement, v: number) => { li.querySelector(".n")!.innerHTML = v.toLocaleString() + `<small>${li.dataset.u}</small>`; };
  // 재생마다 번호를 붙여, 이전 재생의 타이머·애니메이션은 스스로 멈춘다
  function tween(id: number, dur: number, step: (k: number) => void, done?: () => void) { const t0 = performance.now(); const g = (now: number) => { if (id !== upRun) return; const k = Math.min(1, (now - t0) / dur); step(k); if (k < 1) frame(g); else done?.(); }; frame(g); }
  const at = (id: number, ms: number, fn: () => void) => later(() => id === upRun && fn(), ms);
  const aiGo = () => { aiBtn.classList.add("on", "go"); aiBtn.textContent = "✓ 정리 시작"; };
  function upReset() {
    upNum.innerHTML = "0<small>장</small>"; upBar.style.width = "0%";
    upSt.textContent = "올리는 중…"; upSt.classList.remove("ok");
    aiBtn.className = "aibtn"; aiBtn.textContent = "AI로 정리하고 고르기 →";
    chkLi.forEach((li) => { li.classList.remove("run", "on"); chkSet(li, 0); li.querySelectorAll(".sc span").forEach((c) => c.classList.remove("on")); });
    cut.classList.remove("on"); cutN.textContent = "2,860"; upDone.classList.remove("on");
  }
  function chkFinal() {
    upNum.innerHTML = "2,860<small>장</small>"; upBar.style.width = "100%"; upSt.textContent = "2,860장 올렸어요"; upSt.classList.add("ok"); aiGo();
    chkLi.forEach((li) => { li.classList.add("on"); chkSet(li, +li.dataset.n!); li.querySelectorAll(".sc span").forEach((c) => c.classList.add("on")); });
    cut.classList.add("on"); cutN.textContent = "722"; upDone.classList.add("on");
  }
  function runChk(id: number, li: HTMLElement, start: number, dur: number) {
    at(id, start, () => li.classList.add("run"));
    at(id, start + 500, () => tween(id, dur, (k) => chkSet(li, Math.round(+li.dataset.n! * (1 - Math.pow(1 - k, 3)))), () => {
      li.classList.remove("run"); li.classList.add("on");
      if (li.contains(cut)) at(id, 150, () => { cut.classList.add("on"); tween(id, 900, (k) => { cutN.textContent = Math.round(2860 - (2860 - 722) * (1 - Math.pow(1 - k, 3))).toLocaleString(); }); });
      li.querySelectorAll(".sc span").forEach((c, i) => at(id, 120 * i, () => c.classList.add("on")));
    }));
  }
  function runUp() {
    const id = ++upRun; upReset();
    tween(id, 1600, (k) => { const e = 1 - Math.pow(1 - k, 2); upNum.innerHTML = Math.round(2860 * e).toLocaleString() + "<small>장</small>"; upBar.style.width = (e * 100) + "%"; },
      () => { upSt.textContent = "2,860장 올렸어요"; upSt.classList.add("ok"); aiBtn.classList.add("on"); });
    at(id, 2400, () => aiBtn.classList.add("press")); at(id, 2600, () => { aiBtn.classList.remove("press"); aiGo(); });
    runChk(id, chkLi[0], 2800, 1000); runChk(id, chkLi[1], 5200, 600);
    at(id, 7000, () => upDone.classList.add("on"));
  }
  if (REDUCED) chkFinal();
  else {
    // 숫자가 화면 가운데쯤 오면 시작
    watch(upNum, { rootMargin: "0px 0px -35% 0px", threshold: 1 }, (e) => { if (e.isIntersecting && !upPlaying) { upPlaying = true; const id = upRun; later(() => id === upRun && upPlaying && runUp(), 450); } });
    // 섹션이 화면에서 완전히 사라지면 처음 상태로
    watch($("section.upl"), { threshold: 0 }, (e) => { if (!e.isIntersecting) { upPlaying = false; upRun++; upReset(); } });
  }

  /* 2-2 한 장면 안에서: 칸 수 고정(데스크톱 5×3, 휴대폰 3×4) — 빠진 자리는 다음 사진이 채움 */
  const sGrid = $("#sGrid"), sBody = $("#sBody"), simiRow = $("#simiRow"), simiMsg = $("#simiMsg"), sCnt = $("#sCnt");
  const TRI = '<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  const EYEOFF = '<svg viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>';
  const blurSw = $("#blurSw"), swTxt = $("#swTxt");
  let gridMobile: boolean | null = null, filtered = false;
  const STU2 = R("simple", [0, 9, 12, 13, 10, 2, 5]).concat(STW, R("flower", [0, 3, 4, 6]));
  function buildGrid() {
    const mobile = matchMedia("(max-width:640px)").matches; if (mobile === gridMobile) return; gridMobile = mobile;
    const slots = mobile ? 12 : 15, FLAG: Record<number, "b" | "e"> = mobile ? { 2: "b", 5: "b", 8: "e", 10: "b" } : { 3: "b", 7: "b", 11: "b", 13: "e" };
    const picked = new Set([1, 4, 7, 8, 9]); const out: string[] = []; let n = 0, bi = 0;
    const clean = (i: number, extra: boolean) => i === 2 ? `<button type="button" class="grp" id="grpBtn" aria-expanded="false" aria-label="비슷한 사진 5장 묶음 펼치기" style="background-image:url(${PF("simple3")})"><span class="badge">⧉ 5</span><span class="hint">눌러서 펼치기</span></button>`
      : `<div class="c${extra ? " x" : ""}" style="background-image:url(${PF(STU2[i % STU2.length])})">${picked.has(i) ? '<span class="ck">✓</span>' : ""}</div>`;
    for (let k = 0; k < slots; k++) {
      if (FLAG[k] === "b") { out.push(`<div class="wrapb"><div class="c blurry" style="background-image:url(${PF(["simple1", "simple8", "simple11", "simple6"][bi])})"></div><span class="qb blur" title="흐림 의심" aria-label="흐림 의심">${TRI}</span></div>`); bi++; continue; }
      if (FLAG[k] === "e") { out.push(`<div class="wrapb"><div class="c" style="background-image:url(${PF("simple7")});background-position:50% 30%"></div><span class="qb eyes" title="눈 감음 의심" aria-label="눈 감음 의심">${EYEOFF}</span></div>`); continue; }
      out.push(clean(n++, false));
    }
    for (let k = 0; k < 4; k++) out.push(clean(n++, true));
    sGrid.innerHTML = out.join("");
    $("#grpBtn").addEventListener("click", () => setOpen(true)); // 버튼은 다시 그릴 때마다 새로 생긴다
    if (filtered) setBlur(true, true);
  }
  function setBlur(on: boolean, instant = false) {
    filtered = on; blurSw.setAttribute("aria-checked", String(on));
    swTxt.innerHTML = on ? "흔들린·눈 감은 사진 <b>4장</b> 빼고 보는 중" : "흔들린 사진·눈 감은 사진 빼고 보기";
    const flagged = sGrid.querySelectorAll(".wrapb"), extras = sGrid.querySelectorAll(".x");
    if (on) {
      flagged.forEach((w) => w.classList.add("out"));
      later(() => { if (!filtered) return; flagged.forEach((w) => w.classList.add("gone")); extras.forEach((x) => x.classList.add("in")); }, instant || REDUCED ? 0 : 340);
    } else { extras.forEach((x) => x.classList.remove("in")); flagged.forEach((w) => { w.classList.remove("gone"); frame(() => w.classList.remove("out")); }); }
  }
  on(blurSw, "click", () => setBlur(!filtered));
  const VAR = ["50% 40%", "42% 50%", "58% 46%", "50% 60%", "46% 34%"], SCALE = ["115%", "125%", "120%", "130%", "118%"];
  simiRow.innerHTML = VAR.map((v, i) => `<button type="button" aria-pressed="false" aria-label="비슷한 사진 ${i + 1}" style="background-image:url(${PF(i % 2 ? "simple4" : "simple3")});background-position:${v};background-size:${SCALE[i]}"><span class="ck">✓</span></button>`).join("");
  function setOpen(o: boolean) { if (o) sBody.style.minHeight = sBody.offsetHeight + "px"; sBody.classList.toggle("open", o); const g = root.querySelector<HTMLElement>("#grpBtn"); if (g) { g.setAttribute("aria-expanded", String(o)); g.querySelector<HTMLElement>(".hint")!.style.display = o ? "none" : ""; } if (!o) sBody.style.minHeight = ""; }
  on($("#simiClose"), "click", () => setOpen(false));
  on(simiRow, "click", (e) => {
    const b = (e.target as Element).closest("button"); if (!b) return;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    const k = simiRow.querySelectorAll('[aria-pressed="true"]').length;
    sCnt.textContent = `이 장면에서 ${5 + k}장 골랐어요`;
    simiMsg.textContent = k ? `이 묶음에서 ${k}장 골랐어요. 더 골라도 돼요.` : "마음에 드는 사진을 눌러 보세요. 여러 장 골라도 돼요.";
  });
  buildGrid(); on(window, "resize", buildGrid);
  let swAuto = false;
  watch(sGrid, { rootMargin: "0px 0px -30% 0px", threshold: .6 }, (e) => { if (e.isIntersecting && !swAuto) { swAuto = true; later(() => { if (!filtered) setBlur(true); }, REDUCED ? 0 : 1600); } });

  /* 3 함께 고르기 (휴대폰 화면) */
  type P3 = { i: number; likes: number; mine?: boolean; who?: string; pick?: boolean };
  const PHOTOS3: P3[] = [
    { i: 3, likes: 3, mine: true, who: "나·지·엄", pick: true }, { i: 8, likes: 3, mine: false, who: "지·엄", pick: true }, { i: 1, likes: 2, mine: true, who: "나·엄", pick: true },
    { i: 12, likes: 2, mine: false, who: "지·엄" }, { i: 6, likes: 2, mine: true, who: "나·지", pick: true }, { i: 10, likes: 1, mine: false, who: "엄" },
    { i: 4, likes: 1, mine: true, who: "나" }, { i: 13, likes: 1, mine: false, who: "지" }, { i: 7, likes: 1, mine: false, who: "엄" }, { i: 2, likes: 1, mine: true, who: "나" }, { i: 11, likes: 1, mine: false, who: "지" }, { i: 5, likes: 1, mine: false, who: "엄" },
    { i: 9, likes: 1, mine: true, who: "나" }, { i: 0, likes: 0 }, { i: 14, likes: 0 }];
  const pg = $("#pg");
  function render3(v: string) {
    let list = PHOTOS3.slice();
    if (v === "like") list = list.filter((p) => p.likes).sort((a, b) => b.likes - a.likes);
    else if (v === "pick") list = list.filter((p) => p.pick);
    else list = list.slice().sort((a, b) => a.i - b.i);
    pg.innerHTML = list.slice(0, 15).map((p) => `<div style="background-image:url(${PH(p.i)})">${p.pick ? '<span class="ok">✓</span>' : ""}${p.likes ? `<span class="hv${p.mine ? " mine" : ""}">♥ ${p.likes}</span>` : ""}${v === "like" && p.likes ? `<span class="who">${p.who}</span>` : ""}</div>`).join("");
  }
  on($("#tabs3"), "click", (e) => { const b = (e.target as Element).closest<HTMLElement>("button"); if (!b) return; $$("#tabs3 button").forEach((x) => x.setAttribute("aria-selected", String(x === b))); render3(b.dataset.v!); });
  render3("like");
  const talkb = $("#talkb");
  watch($("#scr"), { rootMargin: "0px 0px -30% 0px", threshold: .5 }, async (e) => { if (!e.isIntersecting || REDUCED) return; await sleep(900); talkb.classList.add("on"); await sleep(8000); talkb.classList.remove("on"); });

  /* 4 작가님께 보내고, 보정본 비교 */
  const sendVis = $("#sendVis"), inpT = $("#inpT"), stA = $("#stA"), cnt3 = $("#cnt3"), ptA = $("#ptA"), ptB = $("#ptB");
  const FN = "2041, 2043, 2051, 2058, 2063, 2070, 2074, 2088, 2091, 2105, 2117, 2120, 21";
  let sendRun = 0;
  function toB() { sendVis.classList.add("b"); ptA.classList.remove("on"); ptB.classList.add("on"); }
  async function runSend() {
    const id = ++sendRun;
    sendVis.classList.remove("b", "closing"); stA.classList.remove("strike"); ptA.classList.add("on"); ptB.classList.remove("on"); inpT.textContent = ""; cnt3.textContent = "0 / 40개 입력 중…";
    if (REDUCED) { inpT.textContent = FN; toB(); return; }
    await sleep(500);
    for (let i = 1; i <= FN.length; i++) { if (id !== sendRun) return; inpT.textContent = FN.slice(0, i); cnt3.textContent = `${FN.slice(0, i).split(",").filter((x) => x.trim().length >= 4).length} / 40개 입력 중…`; await sleep(FN[i - 1] === "," ? 70 : 28); }
    await sleep(500); if (id !== sendRun) return; stA.classList.add("strike");
    await sleep(1100); if (id !== sendRun) return; sendVis.classList.add("closing");
    await sleep(260); toB(); await sleep(120); sendVis.classList.remove("closing");
  }
  let sendSeen = false;
  watch(sendVis, { rootMargin: "0px 0px -30% 0px", threshold: .5 }, (e) => { if (e.isIntersecting && !sendSeen) { sendSeen = true; runSend(); } });
  on($("#replay2"), "click", runSend);
  const hold2 = $("#hold2"), h2lab = $("#h2lab");
  const on2 = () => { hold2.classList.add("press"); h2lab.textContent = "원본"; }, off2 = () => { hold2.classList.remove("press"); h2lab.textContent = "보정본"; };
  on(hold2, "pointerdown", on2); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => on(hold2, ev, off2));
  on(hold2, "keydown", (e) => { const k = (e as KeyboardEvent).key; if (k === " " || k === "Enter") { e.preventDefault(); on2(); } }); on(hold2, "keyup", off2);
  on(hold2, "contextmenu", (e) => e.preventDefault());

  /* 7 마무리: 사진 더미 → 정리 */
  const tidy = $("#tidy");
  function buildTidy() {
    const W = tidy.clientWidth, mob = W < 500, sz = mob ? 60 : 92, gap = mob ? 8 : 12, cols = 5;
    const pile = [[-150, -30, -14], [-60, 10, 9], [40, -40, -6], [130, 20, 12], [200, -20, -10], [-210, 30, 7], [-100, -60, 16], [10, 40, -12], [100, -70, 5], [170, 50, -8]].map(([x, y, r]) => [x * (mob ? .55 : 1), y * (mob ? .7 : 1), r]);
    tidy.innerHTML = pile.map((p, i) => {
      const c = i % cols, rI = Math.floor(i / cols); const gx = (c - 2) * (sz + gap), gy = (rI - .5) * (sz + gap);
      return `<div class="tt${[1, 4, 7].includes(i) ? " pick" : ""}" data-g="translate(${gx}px,${gy}px)" style="transform:translate(${p[0]}px,${p[1]}px) rotate(${p[2]}deg)"><div style="background-image:url(${PH(i * 2 + 3)})"></div><span class="ck">✓</span></div>`;
    }).join("");
  }
  function settle() { tidy.querySelectorAll<HTMLElement>(".tt").forEach((t, i) => { t.style.transitionDelay = (i * 50) + "ms"; t.style.transform = t.dataset.g!; }); later(() => tidy.classList.add("done"), REDUCED ? 0 : 1500); }
  buildTidy();
  if (REDUCED) settle();
  else watch(tidy, { rootMargin: "0px 0px -25% 0px", threshold: .6 }, (e) => { if (e.isIntersecting && !tidy.classList.contains("done")) later(settle, 500); });

  return () => {
    alive = false; ac.abort(); cancelAnimationFrame(raf); clearTimeout(rtS);
    timers.forEach(clearTimeout); observers.forEach((o) => o.disconnect());
  };
}
