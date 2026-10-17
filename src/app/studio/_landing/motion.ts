/**
 * 작가·스튜디오 랜딩의 움직임 — design/landing-preview/studio 시안의 스크립트를 그대로 옮겼다.
 * 화면을 떠나면(언마운트) 반환된 함수가 타이머·관찰자·이벤트·애니메이션 루프를 모두 정리한다.
 */
export function startStudioLanding(root: HTMLElement): () => void {
  const ac = new AbortController(), timers: number[] = [], observers: IntersectionObserver[] = [];
  let alive = true, raf = 0, fragTimer = 0;
  const $ = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  const on = (el: EventTarget, ev: string, fn: (e: Event) => void) => el.addEventListener(ev, fn, { signal: ac.signal });
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => alive && fn(), ms); timers.push(t); return t; };
  const sleep = (ms: number) => new Promise<void>((r) => later(r, ms));
  const frame = (fn: FrameRequestCallback) => requestAnimationFrame((t) => alive && fn(t));
  const watch = (el: Element, opts: IntersectionObserverInit, cb: (e: IntersectionObserverEntry, o: IntersectionObserver) => void) => {
    const o = new IntersectionObserver((es) => cb(es[0], o), opts); o.observe(el); observers.push(o);
  };

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PH = (i: number) => `/landing/studio/p${String((i % 12) + 1).padStart(2, "0")}.jpg`;

  /* 1 히어로 — 링크 하나가 열린다 */
  frame(() => $("h1").classList.add("in"));
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const heroL = $("top"), lStage = $("lStage"), gal = $("gal"), pill = $("pill"), lTop = $("lTop"), ggrid = $("ggrid"), gcount = $("gcount"), cue = $("cue"), gcard = $("gcard"), frags = $("frags");
  let gCells: HTMLElement[] = [], galleryColumns = 0;
  function buildG() {
    const W = innerWidth, cols = W < 700 ? 3 : W < 1000 ? 4 : 6;
    if (cols === galleryColumns) return;
    galleryColumns = cols;
    ggrid.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    ggrid.innerHTML = Array.from({ length: cols * 5 }, (_, i) => `<div class="g"><img src="${i ? PH(i + Math.floor(i / 12) * 5) : "/landing/studio/p05.jpg"}" alt="" loading="lazy"><span class="ck">✓</span><span class="hv">♥ ${1 + (i % 3)}</span></div>`).join("");
    gCells = [...ggrid.children] as HTMLElement[];
  }
  async function intro() {
    if (REDUCED) { frags.classList.add("faded"); $("strike").classList.add("on"); return; }
    await sleep(900); $("strike").classList.add("on"); frags.classList.add("faded");
    cardR = null; lastProgress = -1; scheduleScroll();
  }
  function target(mobile: boolean) {
    const H0 = lStage.clientHeight;
    if (mobile) return { l: 0, t: 64, w: innerWidth, h: H0 - 64, r: 0 };
    const w = Math.min(1080, innerWidth - 80); return { l: (innerWidth - w) / 2, t: 84, w, h: H0 - 84 - 24, r: 18 };
  }
  let lastProgress = -1, lastCount = "";
  let cardR: { l: number; t: number; w: number; h: number } | null = null;
  function renderL(p: number) {
    if (p === lastProgress) return;
    lastProgress = p;
    const mobile = innerWidth < 700;
    const m = ease(clamp((p - .02) / .22));
    const T = target(mobile), sr = lStage.getBoundingClientRect();
    if (m < .001 || !cardR) { const r = pill.getBoundingClientRect(); cardR = { l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height }; }
    const L = (a: number, b: number) => a + (b - a) * m, s0 = cardR.w / T.w, s = L(s0, 1), hs = L(cardR.h, T.h);
    Object.assign(gal.style, {
      left: T.l + "px", top: T.t + "px", width: T.w + "px", height: T.h + "px", opacity: m > .001 ? "1" : "0",
      transform: `translate(${L(cardR.l, T.l) - T.l}px,${L(cardR.t, T.t) - T.t}px) scale(${s})`,
      clipPath: `inset(0 0 ${Math.max(0, T.h - hs / s)}px 0 round ${L(16, T.r) / s}px)`,
    });
    pill.style.visibility = m > .001 ? "hidden" : "visible";
    Object.assign(gcard.style, { width: cardR.w + "px", transform: `scale(${1 / s0})`, opacity: String(1 - clamp(m / .18)) });
    gcount.style.opacity = String(clamp((m - .85) / .15));
    lTop.style.opacity = frags.style.opacity = String(1 - clamp((p - .01) / .06)); cue.style.opacity = String(1 - clamp(p / .04));
    const likeP = clamp((p - .26) / .14), pickP = clamp((p - .3) / .25);
    gCells.forEach((g, i) => { g.classList.toggle("liked", i / gCells.length < likeP && i % 3 !== 2); g.classList.toggle("pick", (i * 7 % gCells.length) / gCells.length < pickP && i % 2 === 0); });
    const total = Math.round(40 * clamp((p - .3) / .25));
    const count = p > .55 ? "셀렉 완료 · <b>40</b> / 40장" : `고객이 고르는 중 · <b>${total}</b> / 40장`;
    if (count !== lastCount) { lastCount = count; gcount.innerHTML = count; }
    const done = p > .6; $("gdim").classList.toggle("on", done); $("noti").classList.toggle("on", done);
  }
  buildG(); intro();
  if (REDUCED) { heroL.style.height = "auto"; lStage.style.position = "relative"; frame(() => renderL(1)); }
  let rtL = 0; on(window, "resize", () => { clearTimeout(rtL); rtL = later(() => { buildG(); cardR = null; lastProgress = -1; scheduleScroll(); }, 250); });

  // 배경 업무 조각 — 평소엔 흐리게, 2.2초마다 차례로 선명하게(PC는 왼쪽·오른쪽 한 장씩, 휴대폰은 한 장씩)
  const fragEls = [...frags.children] as HTMLElement[];
  let fragK = 0;
  function litNext() {
    if (innerWidth <= 700) {   // 위치는 버튼 아래 레이아웃이 정하고, 여기서는 메시지 순서만 바꾼다.
      const n = fragEls.length;
      fragEls.forEach((f, i) => { const d = (fragK - i + n * 9) % n; f.classList.toggle("s0", d === 0); f.classList.toggle("s1", d === 1); f.classList.toggle("s2", d === 2); f.classList.remove("lit"); });
      fragK++; return;
    }
    fragEls.forEach((f) => f.classList.remove("s0", "s1", "s2"));
    const vis = fragEls.filter((f) => getComputedStyle(f).display !== "none");
    if (!vis.length) return;
    let lit: HTMLElement[];
    if (vis.length <= 2) lit = [vis[fragK % vis.length]];
    else {
      const L = vis.filter((f) => { const r = f.getBoundingClientRect(); return r.left + r.width / 2 < innerWidth / 2; }), R = vis.filter((f) => !L.includes(f));
      lit = [L[fragK % (L.length || 1)], R[(fragK + 1) % (R.length || 1)]].filter(Boolean);
    }
    fragEls.forEach((f) => f.classList.toggle("lit", lit.includes(f)));
    fragK++;
  }
  if (REDUCED || innerWidth <= 700) litNext();
  if (!REDUCED) { if (innerWidth > 700) later(litNext, 400); fragTimer = window.setInterval(() => { if (alive && !document.hidden && parseFloat(frags.style.opacity || "1") > .05) litNext(); }, 2200); }

  /* 2 모든 촬영의 진행과 기한 — 오늘(10월 20일 월 → 24일 금)이 스크롤로 넘어가며 6칸 막대와 기한 표시가 바뀜 */
  const board2 = $("board2"), bStage = $("bStage"), bfit = $("bfit"), bRows = $("bRows");
  const TODAY = [20, 21, 22, 23, 24];   // 화면에 날짜는 보이지 않고 기한 표시로만 드러남
  // 상태 → 6칸 중 위치·차례(getSixStepPosition·getProjectActor), 표시 이름(getDisplayStatusLabel)
  const ST: Record<string, [number, "p" | "c" | "d", string]> = { selecting: [2, "c", "셀렉 중"], confirmed: [3, "p", "셀렉 완료"], editing: [3, "p", "보정 중"], reviewing_v1: [3, "c", "보정본 검토 중"], editing_v2: [4, "p", "1차 재보정 중"], delivered: [6, "d", "납품 완료"] };
  type Day = [string, string?, number?];   // [상태, 기한 이름, 기한 날(10월)]
  const B2: { nm: string; img: string; meta: string; d: Day[]; el?: HTMLElement }[] = [
    { nm: "1011 민서·지훈 야외스냅", img: "p05", meta: "김민서 · 서울숲", d: Array(5).fill(["selecting", "셀렉 마감일", 24]) },
    { nm: "수아♥준호 본식", img: "flower2", meta: "이수아 · 청담 웨딩홀", d: Array(5).fill(["selecting", "셀렉 마감일", 22]) },
    { nm: "제주 웨딩스냅 (지아&현우)", img: "cer03", meta: "박지아 · 제주 협재", d: [["selecting", "셀렉 마감일", 27], ["selecting", "셀렉 마감일", 27], ["confirmed"], ["confirmed"], ["confirmed"]] },
    { nm: "하린 님 리허설 촬영", img: "stair1", meta: "정하린 · 스튜디오", d: [["editing"], ["editing"], ["editing"], ["reviewing_v1", "검토 마감일", 30], ["reviewing_v1", "검토 마감일", 30]] },
    { nm: "0920 북촌 한옥스냅", img: "window0", meta: "한서윤 · 북촌", d: Array(5).fill(["editing_v2"]) },
    { nm: "예린·민재 2부 스냅", img: "table1", meta: "오예린 · 성수", d: Array(5).fill(["delivered"]) },
  ];
  const ddayT = (diff: number): [string, string] => diff > 3 ? ["", "ok"] : diff > 0 ? [`D-${diff} 임박`, "warn"] : diff === 0 ? ["D-day", "danger"] : [`D+${-diff}`, "danger"];   // 제품 dday()와 같은 규칙
  bRows.innerHTML = "";   // 다시 마운트될 때(개발 모드 StrictMode 등) 줄이 두 번 생기지 않게
  B2.forEach((b) => {
    const el = document.createElement("div"); el.className = "brow";
    el.innerHTML = `<div class="id"><img src="/landing/studio/${b.img}.jpg" alt=""><div><b>${b.nm}</b><small>${b.meta}</small></div></div><div class="seg">${"<i></i>".repeat(6)}</div><div class="bst"><i></i><span></span><small></small></div><div class="dl"></div>`;
    bRows.appendChild(el); b.el = el;
  });
  let bDay = -1;
  const bump = (el: HTMLElement, v: number) => { if (el.textContent !== String(v)) { el.textContent = String(v); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); } };
  function setB(day: number) {
    if (day === bDay) return; bDay = day;
    let warn = 0, late = 0;
    B2.forEach((b) => {
      const [st, dlName, dlDay] = b.d[day], [step, a, label] = ST[st], el = b.el!;
      el.dataset.a = a;
      el.querySelectorAll(".seg i").forEach((sg, k) => { sg.className = k + 1 < step || a === "d" ? "dn" : k + 1 === step ? "cur" : ""; });
      if (a === "d") el.querySelectorAll(".seg i")[5].className = "cur";
      el.querySelector(".bst span")!.textContent = label; el.querySelector(".bst small")!.textContent = `${step}/6`;
      const dl = el.querySelector<HTMLElement>(".dl")!;
      if (dlName && dlDay) {
        const [txt, lv] = ddayT(dlDay - TODAY[day]), prevTxt = dl.querySelector("strong")?.textContent || "";
        dl.innerHTML = `<small>${dlName}</small>10.${dlDay}${txt ? `<strong data-l="${lv}">${txt}</strong>` : ""}`;
        if (txt && txt !== prevTxt) dl.querySelector("strong")!.classList.add("bump");
        el.classList.toggle("hot", lv === "warn"); el.classList.toggle("late", lv === "danger");
        if (lv === "warn") warn++; if (lv === "danger") late++;
      } else { dl.innerHTML = a === "d" ? "<small>완료일</small>10.12" : '<span style="color:var(--muted)">—</span>'; el.classList.remove("hot", "late"); }
    });
    bump($("sW"), warn); bump($("sD"), late);
    $("bNote").classList.toggle("on", day === 4);
  }
  // 화면이 낮으면 보드 전체를 줄여 아래가 잘리지 않게
  const fitB = () => { bfit.style.setProperty("--bs", "1"); const room = bStage.clientHeight - (bfit.getBoundingClientRect().top - bStage.getBoundingClientRect().top) - 12; bfit.style.setProperty("--bs", Math.min(1, room / bfit.offsetHeight).toFixed(3)); };
  setB(0); fitB(); on(window, "resize", fitB); document.fonts?.ready.then(() => alive && fitB());
  if (REDUCED) { board2.style.height = "auto"; bStage.style.position = "relative"; setB(4); }
  // 스크롤이 바뀐 프레임에만 읽고, 멈춰 있는 동안에는 다시 그리지 않는다.
  function updateScroll() {
    raf = 0;
    if (document.hidden) return;
    const heroRect = heroL.getBoundingClientRect(), boardRect = board2.getBoundingClientRect();
    if (heroRect.bottom > 0 && heroRect.top < innerHeight) {
      renderL(REDUCED ? 1 : clamp(-heroRect.top / (heroRect.height - innerHeight)));
    }
    if (!REDUCED && boardRect.bottom > 0 && boardRect.top < innerHeight) {
      const p = clamp(-boardRect.top / (boardRect.height - innerHeight));
      setB(p < .14 ? 0 : p < .34 ? 1 : p < .54 ? 2 : p < .74 ? 3 : 4);
    }
  }
  function scheduleScroll() { if (!raf) raf = frame(updateScroll); }
  window.addEventListener("scroll", scheduleScroll, { passive: true, signal: ac.signal });
  on(window, "resize", scheduleScroll); on(document, "visibilitychange", scheduleScroll);
  document.fonts?.ready.then(() => { if (alive) { cardR = null; lastProgress = -1; scheduleScroll(); } });
  scheduleScroll();

  /* 3 고객 셀렉 화면 — 항목을 누르면 화면이 바뀜 */
  const AMARK = '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M2 21 9 3h6l3.1 8-2.8.8.7 2 2.9-.8L22 21h-5l-1.5-4h-7L7 21H2Zm8-8h4l-2-6-2 6Z"/></svg>';
  const BLUR = '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>';
  const EYE = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 3M6.6 7.6C4.3 9.2 3 12 3 12s4 6 9 6a9 9 0 0 0 4-1"/></svg>';
  const HEART = [["var(--p1)", "민"], ["var(--p2)", "지"], ["var(--p3)", "엄"]];
  $("cg").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const rec = [0, 3, 4, 7, 8, 10].includes(i), sk = [1, 5, 9].includes(i), q = i === 2 ? "blur" : i === 6 ? "eyes" : i === 11 ? "blur" : "";
    const hs = [[0, 1], [], [2], [0, 2], [1], [0, 1, 2], [], [1], [0], [], [2, 1], []][i];
    return `<div class="c${rec ? " r" : ""}${sk ? " sk" : ""}${q ? " q" : ""}" style="background-image:url(${PH(i * 3 + 2)})"><span class="rec">${AMARK}작가 추천</span><span class="stk">⧉ ${3 + (i % 3)}</span>${q ? `<span class="qb ${q}">${q === "blur" ? BLUR : EYE}</span>` : ""}<span class="hs">${hs.map((k) => `<i style="background:${HEART[k][0]}">♥</i>`).join("")}</span></div>`;
  }).join("");
  const fbtns = [...root.querySelectorAll<HTMLElement>("#flist button")], cs = $("cs"), csChips = [...root.querySelectorAll<HTMLElement>("#csChips span")], fdesc = $("fdesc");
  function showF(btn: HTMLElement) {
    fbtns.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    cs.dataset.s = btn.dataset.s; csChips.forEach((c) => c.classList.toggle("on", c.dataset.s === btn.dataset.s));
    fdesc.textContent = (matchMedia("(max-width:880px)").matches && btn.dataset.m) || btn.querySelector("span")!.textContent; // 휴대폰은 한 줄짜리 설명
  }
  let fTimer = 0, fManual = false, fOn = false;
  function fNext() { clearTimeout(fTimer); if (fManual || !fOn) return; fTimer = later(() => { const i = fbtns.findIndex((b) => b.getAttribute("aria-selected") === "true"); showF(fbtns[(i + 1) % fbtns.length]); fNext(); }, 3600); }
  fbtns.forEach((b) => on(b, "click", () => { fManual = true; clearTimeout(fTimer); showF(b); }));
  showF(fbtns[0]);
  if (!REDUCED) watch(cs, { threshold: .45 }, (e) => { fOn = e.isIntersecting; if (fOn && !fManual) later(() => { if (fOn && !fManual) fNext(); }, 1000); else clearTimeout(fTimer); });

  return () => {
    alive = false; ac.abort(); cancelAnimationFrame(raf); clearInterval(fragTimer);
    timers.forEach(clearTimeout); observers.forEach((o) => o.disconnect());
  };
}
