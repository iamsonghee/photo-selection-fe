"use client";

import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/AuthModal";

// ─── Shared utilities ────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setVisible(true); }),
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, className = "", delayMs = 0 }: { children: React.ReactNode; className?: string; delayMs?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`landing-reveal${visible ? " is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// ─── Clock ───────────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState("00:00:00");
  useEffect(() => {
    const update = () => {
      const n = new Date();
      setTime(
        `${n.getHours().toString().padStart(2, "0")}:${n.getMinutes().toString().padStart(2, "0")}:${n.getSeconds().toString().padStart(2, "0")}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="landing-mono text-[10px] text-white">{time}</span>;
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ onAuthOpen }: { onAuthOpen: () => void }) {
  return (
    <>
      <header className="fixed landing-header-left z-50 hidden lg:flex items-center gap-6 lg:gap-12">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#FF4D00] flex items-center justify-center text-black font-black text-xs">A</div>
          <span className="landing-display font-bold tracking-tighter text-2xl uppercase">
            A-Cut<span className="text-[#FF4D00]">.</span>
          </span>
        </div>
        <nav className="hidden lg:flex items-center gap-8 landing-mono text-[11px] tracking-widest text-gray-500 uppercase">
          <a href="#services" className="hover:text-white transition">Services</a>
          <a href="#testimonials" className="hover:text-white transition">Reviews</a>
          <button type="button" onClick={onAuthOpen} className="hover:text-white transition">Login</button>
        </nav>
      </header>
      <div className="fixed landing-header-right z-50 hidden lg:flex items-center gap-4">
        <span className="landing-mono text-[10px] text-gray-500">SYS_TIME</span>
        <Clock />
      </div>
    </>
  );
}

// ─── Hero Section ────────────────────────────────────────────────────────────

const PHOTOS = [
  { src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop", filename: "IMG_8421.RAW" },
  { src: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=800&auto=format&fit=crop", filename: "IMG_8422.RAW" },
  { src: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?q=80&w=800&auto=format&fit=crop", filename: "IMG_8423.RAW" },
  { src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=800&auto=format&fit=crop", filename: "IMG_8424.RAW" },
];

const PHASES = [
  { active: [false, true, false, false], counter: "SELECTED: 01", sync: "40%" },
  { active: [true,  true, false, false], counter: "SELECTED: 02", sync: "75%" },
  { active: [true,  true, true,  false], counter: "SELECTED: 03", sync: "92%" },
  { active: [false, true, false, false], counter: "SELECTED: 01", sync: "25%" },
];

function HeroSection({ onAuthOpen }: { onAuthOpen: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 4), 2500);
    return () => clearInterval(id);
  }, []);
  const { active, counter, sync } = PHASES[phase];

  return (
    <section className="relative z-10 w-full min-h-screen overflow-hidden">
      <div className="max-w-[1400px] mx-auto w-full min-h-screen flex flex-col lg:flex-row items-center px-6 sm:px-12 lg:px-24 pt-24 lg:pt-0">
      {/* ── Left ── */}
      <div className="flex-1 flex flex-col justify-center lg:pr-12 max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="landing-mono text-[10px] tracking-[0.2em] text-[#FF4D00] border border-[#FF4D00]/30 px-2 py-1">
            ACTIVE_PROTOCOL_V1.0.2
          </span>
          <div className="h-[1px] w-12 bg-[#FF4D00]/30" />
        </div>

        <h1 className="landing-display text-4xl sm:text-5xl lg:text-7xl font-black leading-[1.1] mb-8 uppercase landing-break">
          사진 셀렉, 이제<br />
          <span className="text-[#FF4D00] landing-glitch">링크 하나</span>로<br />
          끝냅니다.
        </h1>

        <div className="space-y-6 mb-12 border-l-2 border-[#222] pl-8">
          <p className="landing-strikethrough text-lg leading-relaxed max-w-md landing-break">
            구글드라이브 링크 보내고, 고객 답장 기다리고, 파일명 받아서 대조하는 그 과정.
          </p>
          <p className="text-xl leading-relaxed text-gray-300 max-w-lg landing-break">
            A컷은 그 모든 걸 하나의 링크로 대체합니다.<br />
            <span className="text-white font-bold">작가는 업로드만, 고객은 클릭만.</span>
          </p>
        </div>

        <div className="flex flex-col gap-4 items-start">
          <button
            type="button"
            onClick={onAuthOpen}
            className="landing-btn-primary gap-4 px-10 py-5 text-black font-bold text-xl uppercase tracking-tight"
          >
            무료로 시작하기
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-3 text-[12px] landing-mono text-gray-500">
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 bg-[#FF4D00]" /> 베타 기간 무료
            </span>
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 bg-[#FF4D00]" /> 신용카드 불필요
            </span>
          </div>
        </div>
      </div>

      {/* ── Right: Mockup ── */}
      <div className="landing-hero-mockup flex-1 relative w-full h-full flex items-center justify-center">
        <div className="relative w-full max-w-[500px] border border-[#222] bg-[#050505] shadow-2xl p-6">
          {/* Mockup header bar */}
          <div className="flex justify-between items-center mb-6 landing-mono text-[10px] text-gray-500 tracking-widest border-b border-[#222] pb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>CLIENT_VIEW :: SELECTION_GRID</span>
            </div>
            <div className="flex gap-4">
              <span>4 ITEMS PENDING</span>
              <span className="text-white">{counter}</span>
            </div>
          </div>

          {/* Photo grid */}
          <div className="relative grid grid-cols-2 gap-3">
            {PHOTOS.map((p, i) => (
              <div key={i} className={`landing-photo-card${active[i] ? " is-active" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={`Portrait ${i + 1}`} />
                <div
                  className={`absolute bottom-2 left-2 landing-mono text-[8px] bg-black/50 px-1 ${active[i] ? "text-[#FF4D00]" : "text-gray-400"}`}
                >
                  {p.filename}
                </div>
                <div className="landing-selection-badge">A-CUT</div>
              </div>
            ))}
            {/* Fake cursor */}
            <svg className="landing-fake-cursor" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.5 3L20 11.5L12.5 13.5L10 21L4.5 3Z" fill="white" stroke="black" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Sync bar */}
          <div className="mt-6 flex items-center justify-between landing-mono text-[9px]">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">SYNC_STATUS</span>
              <div className="w-32 h-1 bg-[#222]">
                <div
                  className="h-full bg-[#FF4D00] transition-all duration-500"
                  style={{ width: sync }}
                />
              </div>
            </div>
            <span className="text-[#FF4D00]">REAL_TIME_SYNCING...</span>
          </div>

          {/* Stats panel */}
          <div className="landing-stats-panel absolute -bottom-16 -right-16 w-60 z-20">
            <div>_OPTIMIZATION_REPORT</div>
            <div className="h-[1px] bg-[#222] my-2" />
            <div>TIME_SAVED: <span className="text-[#FF4D00]">94.8%</span></div>
            <div>ERROR_RATE: <span className="text-[#FF4D00]">0.00%</span></div>
            <div>PROCESS: <span className="text-[#FF4D00]">AUTO_MATCH</span></div>
            <div>LATENCY: <span className="text-[#FF4D00]">14MS</span></div>
          </div>
        </div>

        {/* Background watermark */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 landing-display font-black text-white/[0.02] pointer-events-none select-none -z-10 uppercase"
          style={{ fontSize: "clamp(80px, 15vw, 200px)" }}
        >
          ACUT
        </div>
      </div>
      </div>
    </section>
  );
}

// ─── Mobile Hero Section ─────────────────────────────────────────────────────

const MOBILE_PHASES = [
  { active: [false, true, false, false], counter: "SELECTED: 01", sync: "40%" },
  { active: [true,  true, false, false], counter: "SELECTED: 02", sync: "75%" },
  { active: [true,  true, true,  false], counter: "SELECTED: 03", sync: "92%" },
  { active: [false, true, false, false], counter: "SELECTED: 01", sync: "25%" },
] as const;

function MobileHeroSection({ onAuthOpen }: { onAuthOpen: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 4), 3000);
    return () => clearInterval(id);
  }, []);
  const { active, counter, sync } = MOBILE_PHASES[phase];

  return (
    <div className="relative z-10">
      {/* Mobile Header */}
      <header
        className="relative z-50 flex justify-between items-center px-6"
        style={{ paddingTop: "max(24px, env(safe-area-inset-top, 24px))", paddingBottom: "16px" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#FF4D00] flex items-center justify-center text-black font-black text-[10px]">A</div>
          <span className="landing-display font-bold tracking-tighter text-lg uppercase">
            A-Cut<span className="text-[#FF4D00]">.</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="landing-mono text-[8px] text-gray-500 leading-none">SYS_TIME</span>
          <Clock />
        </div>
      </header>

      {/* Content */}
      <div className="w-full px-6 pt-2 pb-20" style={{ display: "flex", flexDirection: "column", gap: "48px" }}>

        {/* Hero text + CTA */}
        <div className="flex flex-col">
          <div className="mb-4">
            <span className="landing-mono text-[8px] tracking-[0.2em] text-[#FF4D00] border border-[#FF4D00]/30 px-1.5 py-0.5">
              ACTIVE_PROTOCOL_V1.0.2
            </span>
          </div>
          <h1 className="landing-display text-4xl font-black leading-tight mb-6 uppercase landing-break">
            사진 셀렉, 이제<br />
            <span className="text-[#FF4D00] landing-glitch">링크 하나</span>로<br />
            끝냅니다.
          </h1>
          <div className="space-y-4 mb-8 border-l border-[#222] pl-4">
            <p className="landing-strikethrough text-sm leading-relaxed text-gray-400 landing-break">
              구글드라이브 링크 보내고, 고객 답장 기다리고, 파일명 대조하는 번거로운 과정.
            </p>
            <p className="text-base leading-relaxed text-gray-300 font-medium landing-break">
              작가는 업로드만, 고객은 클릭만.<br />
              <span className="text-white">모든 워크플로우를 자동화하세요.</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onAuthOpen}
            className="landing-btn-primary flex items-center justify-center gap-3 text-black font-bold text-base uppercase tracking-tight mb-4"
            style={{ padding: "16px 24px", width: "100%" }}
          >
            무료로 시작하기
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-4 text-[9px] landing-mono text-gray-500 justify-center">
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 bg-[#FF4D00]" /> BETA FREE
            </span>
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 bg-[#FF4D00]" /> NO CREDIT CARD
            </span>
          </div>
        </div>

        {/* Mockup + Stats */}
        <div className="relative w-full">
          {/* Mockup box */}
          <div className="relative w-full border border-[#222] bg-[#050505] shadow-2xl p-4">
            <div className="flex justify-between items-center mb-4 landing-mono text-[8px] text-gray-500 tracking-wider border-b border-[#222] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>CLIENT_LIVE_VIEW</span>
              </div>
              <span className="text-white">{counter}</span>
            </div>
            <div className="relative grid grid-cols-2 gap-2">
              {PHOTOS.map((p, i) => (
                <div key={i} className={`landing-photo-card${active[i] ? " is-active" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={`Portrait ${i + 1}`} />
                  <div className={`absolute bottom-1.5 left-1.5 landing-mono text-[6px] bg-black/50 px-1 ${active[i] ? "text-[#FF4D00]" : "text-gray-400"}`}>
                    {p.filename}
                  </div>
                  <div className="landing-selection-badge">A-CUT</div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between landing-mono text-[7px]">
                <span className="text-gray-500">SYNC_STATUS</span>
                <span className="text-[#FF4D00] animate-pulse">REAL_TIME_ACTIVE</span>
              </div>
              <div className="w-full h-[1px] bg-[#222]">
                <div className="h-full bg-[#FF4D00] transition-all duration-700" style={{ width: sync }} />
              </div>
            </div>
          </div>

          {/* Stats panel — full-width below mockup */}
          <div className="landing-stats-panel mt-4 w-full">
            <div className="flex justify-between">
              <span className="text-white">_OPTIMIZATION_REPORT</span>
              <span>V.1.0</span>
            </div>
            <div className="h-[1px] bg-[#222] my-1.5" />
            <div className="grid grid-cols-2 gap-x-4">
              <div>TIME_SAVED: <span className="text-[#FF4D00]">94.8%</span></div>
              <div>ERROR_RATE: <span className="text-[#FF4D00]">0.00%</span></div>
              <div>PROCESS: <span className="text-[#FF4D00]">AUTO_MATCH</span></div>
              <div>LATENCY: <span className="text-[#FF4D00]">14MS</span></div>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="pt-8 border-t border-[#222] flex flex-wrap gap-x-8 gap-y-4 landing-mono text-[10px] tracking-widest text-gray-500 uppercase justify-center">
          <a href="#services" className="hover:text-white transition">Selection</a>
          <a href="#testimonials" className="hover:text-white transition">Reviews</a>
          <button type="button" onClick={onAuthOpen} className="hover:text-white transition">Login</button>
        </nav>
      </div>
    </div>
  );
}

// ─── Problem Section ─────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    code: "ERROR_CODE_01",
    watermark: "ERR_01",
    quote: '"구글드라이브 링크 보내드렸어요.\n마음에 드시는 번호 적어서 보내주세요."',
    body: "300장의 사진을 드라이브에 올리고, 고객이 파일명을 일일이 적어서 카톡으로 보내주길 기다립니다.\n그리고 그 목록을 다시 보정 파일과 대조합니다.",
    emphasis: "매 촬영마다 반복되는 이 과정.",
  },
  {
    code: "ERROR_CODE_02",
    watermark: "ERR_02",
    quote: '"두 번째 사진이요, 배경을 좀 더 밝게 해주시고요,\n아 그리고 세 번째는 피부톤이..."',
    body: "재보정 요청은 항상 텍스트로 옵니다. 어떤 사진인지, 어느 부분인지, 얼마나 수정해야 하는지.\n설명을 이해하다 보면 오히려 오해가 생기고, 재보정이 재재보정이 됩니다.",
    emphasis: null,
  },
  {
    code: "ERROR_CODE_03",
    watermark: "ERR_03",
    quote: '"아이폰으로 찍었는데 고객한테 어떻게 보내지?\n일단 집에 가서 PC로..."',
    body: "현장에서 아이폰으로 감성 스냅을 찍고, 고객과 헤어지고 나서야 사진을 전달할 수 있습니다.\nPC로 옮기고, 폴더 정리하고, 드라이브에 올리고.",
    emphasis: "촬영 당일의 감동이 식을 때까지 기다리는 고객.",
  },
];

function ProblemSection({ onAuthOpen }: { onAuthOpen: () => void }) {
  return (
    <section className="relative z-10 w-full" style={{ background: "#000" }}>
      {/* Intro */}
      <div className="h-screen flex flex-col items-center justify-center text-center px-5 sm:px-8 lg:px-24">
        <Reveal>
          <div className="landing-mono text-[10px] tracking-[0.2em] text-[#FF4D00] mb-6 uppercase">
            SURVEY_RESULTS :: PAIN_POINTS
          </div>
          <h2 className="landing-display text-4xl sm:text-5xl lg:text-7xl font-black uppercase leading-tight mb-8 landing-break">
            혹시 지금 이렇게<br />
            <span className="text-[#FF4D00]">하고 계신가요?</span>
          </h2>
          <div className="h-16 w-[1px] bg-[#FF4D00] mt-12 mx-auto" />
        </Reveal>
      </div>

      {/* Problems */}
      {PROBLEMS.map((p, i) => (
        <div key={i}>
          <div
            className="relative min-h-[80vh] flex flex-col justify-center items-center px-5 sm:px-8 lg:px-24 py-16 sm:py-24"
            style={{ position: "relative" }}
          >
            {/* Watermark */}
            <div className="landing-watermark">{p.watermark}</div>
            <Reveal className="text-center max-w-4xl mx-auto w-full">
              <div className="landing-mono text-[10px] tracking-[0.2em] text-[#FF4D00] uppercase mb-12">
                {p.code}
              </div>
              <blockquote className="text-lg sm:text-2xl lg:text-3xl font-light italic text-gray-300 mb-10 sm:mb-16 leading-relaxed landing-break whitespace-pre-line">
                {p.quote}
              </blockquote>
              <div className="space-y-6 text-xl text-gray-400">
                <p className="landing-break whitespace-pre-line">{p.body}</p>
                {p.emphasis && (
                  <p className="text-white font-bold text-2xl landing-break">{p.emphasis}</p>
                )}
                {!p.emphasis && i === 1 && (
                  <p className="text-gray-500 italic landing-break">
                    보정 1회로 끝날 작업이 평균 2.3회로 늘어납니다.
                  </p>
                )}
              </div>
            </Reveal>
          </div>

          {/* Divider */}
          {i < PROBLEMS.length - 1 && (
            <div
              style={{
                width: 200,
                height: 2,
                backgroundColor: "#FF4D00",
                margin: "0 auto",
              }}
            />
          )}
        </div>
      ))}

      {/* CTA transition */}
      <div className="py-24 sm:py-48 flex flex-col items-center justify-center text-center bg-[#050505]">
        <Reveal>
          <p className="landing-mono text-xs text-gray-500 uppercase tracking-[0.3em] mb-4">
            System Upgrade Recommended
          </p>
          <h3 className="text-3xl sm:text-5xl font-bold mb-10 sm:mb-16 landing-break">이 모든 비효율, A-CUT으로 즉시 해결하세요.</h3>
          <button
            type="button"
            onClick={onAuthOpen}
            className="landing-btn-primary gap-4 px-16 py-6 text-black font-bold text-xl uppercase"
          >
            지금 바로 효율 높이기
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Services Section ────────────────────────────────────────────────────────

function ServicesSection() {
  return (
    <section id="services" className="relative z-10 w-full py-24 bg-[#030303]" style={{ minHeight: "100vh" }}>
      {/* Grid overlay */}
      <div className="landing-services-grid-bg" />

      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-6 sm:px-12 flex flex-col h-full">
        {/* Header */}
        <div className="mb-10 sm:mb-16 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 border-b border-[#262626] pb-6 sm:pb-8">
          <div className="landing-jb text-[10px] text-[#737373] uppercase flex flex-col gap-1">
            <span className="before:content-['>'] before:text-[#FF4D00] before:mr-2">OP_MODE: SOLUTIONS</span>
            <span className="before:content-['>'] before:text-[#FF4D00] before:mr-2">STATUS: HIGH_EFFICIENCY</span>
            <span className="before:content-['>'] before:text-[#FF4D00] before:mr-2">DATA_STREAM: ACTIVE</span>
          </div>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-5xl font-bold uppercase leading-[1.1] sm:text-right">
            A컷이 바꾸는<br /><span className="text-[#FF4D00]">3가지</span>
          </h2>
        </div>

        {/* Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel 01 */}
          <Reveal delayMs={0}>
            <article className="landing-panel">
              <div className="flex justify-between items-center px-5 py-4 border-b border-[#262626] landing-jb text-xs font-bold">
                <span className="landing-panel-num">01</span>
                <span className="text-[#737373] tracking-[0.05em]">SYS.LINK.GEN</span>
              </div>
              <div className="relative overflow-hidden bg-black" style={{ height: 240 }}>
                <svg className="w-full h-full" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
                  <rect x="60" y="40" width="80" height="60" fill="#262626" />
                  <rect x="160" y="40" width="80" height="60" fill="#262626" />
                  <rect x="260" y="40" width="80" height="60" fill="#262626" />
                  <rect x="60" y="120" width="80" height="60" fill="#262626" />
                  <rect x="160" y="120" width="80" height="60" fill="#262626" />
                  <rect x="260" y="120" width="80" height="60" fill="#262626" />
                  <circle cx="130" cy="90" r="8" fill="#FF4D00" />
                  <polyline points="126,90 129,93 134,87" stroke="#fff" fill="none" strokeWidth="1.5" />
                  <circle cx="230" cy="90" r="8" fill="#FF4D00" />
                  <polyline points="226,90 229,93 234,87" stroke="#fff" fill="none" strokeWidth="1.5" />
                  <circle cx="230" cy="170" r="8" fill="#FF4D00" />
                  <polyline points="226,170 229,173 234,167" stroke="#fff" fill="none" strokeWidth="1.5" />
                  <text x="60" y="30" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#737373" textDecoration="uppercase">Select Mode: Active</text>
                  <rect x="60" y="200" width="280" height="1" fill="#404040" />
                </svg>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="landing-display text-lg font-bold mb-3">링크 하나로 셀렉 완료</h3>
                <p className="text-[#737373] text-sm leading-relaxed mb-6 flex-1 landing-break">
                  작가가 사진을 업로드하면 고객 전용 갤러리 링크가 생성됩니다. 고객은 마음에 드는 사진을 직접 클릭해서 선택합니다.
                </p>
                <div className="landing-effect-block">
                  <div className="flex flex-col mb-3 pb-3 border-b border-dashed border-[#262626]">
                    <span className="landing-jb text-[10px] text-[#737373] uppercase mb-1">TIME_REDUCTION</span>
                    <span className="landing-display text-2xl text-[#FF4D00] font-bold">87% 단축</span>
                  </div>
                  <div className="landing-jb text-[11px] flex items-center gap-2">
                    <span className="text-[#737373] line-through">카톡 5회</span>
                    <span className="text-[#FF4D00]">→</span>
                    <span className="text-[#E8E8E8] font-bold">링크 1개</span>
                  </div>
                </div>
              </div>
            </article>
          </Reveal>

          {/* Panel 02 */}
          <Reveal delayMs={80}>
            <article className="landing-panel">
              <div className="flex justify-between items-center px-5 py-4 border-b border-[#262626] landing-jb text-xs font-bold">
                <span className="landing-panel-num">02</span>
                <span className="text-[#737373] tracking-[0.05em]">DATA.COMPARE</span>
              </div>
              <div className="relative overflow-hidden bg-black" style={{ height: 240 }}>
                {/* Before/after split */}
                <div className="relative w-full h-full">
                  {/* Labels */}
                  <div className="absolute top-3 w-full flex justify-between px-4 z-10 landing-jb text-[9px] uppercase" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                    <span className="text-white">BEFORE [RAW]</span>
                    <span className="text-[#FF4D00] font-bold">AFTER [PROC]</span>
                  </div>
                  {/* Left vignette */}
                  <div
                    className="absolute top-0 left-0 z-[4] pointer-events-none"
                    style={{ width: "50%", height: "100%", background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)" }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1502781259889-38fe4b170bcc?auto=format&fit=crop&q=80&w=800"
                    alt="Before"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: "grayscale(0.5) contrast(0.7) brightness(0.8)", clipPath: "inset(0 50% 0 0)" }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1502781259889-38fe4b170bcc?auto=format&fit=crop&q=80&w=800"
                    alt="After"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: "saturate(1.4) contrast(1.1) brightness(1.05) sepia(0.15)", clipPath: "inset(0 0 0 50%)" }}
                  />
                  {/* Split line */}
                  <div className="absolute top-0 left-1/2 w-[1px] h-full bg-[#FF4D00] z-[5]" />
                  {/* Scan sweep */}
                  <div className="landing-scan-sweep z-[6]" />
                </div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="landing-display text-lg font-bold mb-3">원본·보정본 나란히 비교</h3>
                <p className="text-[#737373] text-sm leading-relaxed mb-6 flex-1 landing-break">
                  고객이 원본과 보정본을 화면에서 나란히 비교하며 확정하거나 재보정을 요청합니다. 오해 없는 소통이 가능합니다.
                </p>
                <div className="landing-effect-block">
                  <div className="flex flex-col mb-3 pb-3 border-b border-dashed border-[#262626]">
                    <span className="landing-jb text-[10px] text-[#737373] uppercase mb-1">REVISION_CYCLE</span>
                    <span className="landing-display text-2xl text-[#FF4D00] font-bold">평균 1.4회</span>
                  </div>
                  <div className="landing-jb text-[11px] flex items-center gap-2">
                    <span className="text-[#737373] line-through">텍스트 설명</span>
                    <span className="text-[#FF4D00]">→</span>
                    <span className="text-[#E8E8E8] font-bold">직접 지정 코멘트</span>
                  </div>
                </div>
              </div>
            </article>
          </Reveal>

          {/* Panel 03 */}
          <Reveal delayMs={160}>
            <article className="landing-panel">
              <div className="flex justify-between items-center px-5 py-4 border-b border-[#262626] landing-jb text-xs font-bold">
                <span className="landing-panel-num">03</span>
                <span className="text-[#737373] tracking-[0.05em]">SYNC.MOBILE</span>
              </div>
              <div className="relative overflow-hidden bg-black" style={{ height: 240 }}>
                <svg className="w-full h-full" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
                  <rect x="160" y="30" width="80" height="160" rx="12" stroke="#E8E8E8" fill="none" strokeWidth="1.2" />
                  <rect x="190" y="38" width="20" height="4" rx="2" stroke="#404040" fill="none" strokeWidth="1" />
                  <rect x="168" y="50" width="30" height="30" fill="#262626" />
                  <rect x="202" y="50" width="30" height="30" fill="#262626" />
                  <rect x="168" y="84" width="30" height="30" fill="#262626" />
                  <rect x="202" y="84" width="30" height="30" fill="#262626" />
                  <rect x="168" y="130" width="64" height="4" rx="2" fill="#262626" />
                  <rect x="168" y="130" width="45" height="4" rx="2" fill="#FF4D00" />
                  <text x="175" y="150" fontFamily="'JetBrains Mono', monospace" fontSize="7" fill="#FF4D00">Uploading 72%</text>
                  <text x="100" y="100" fontFamily="'JetBrains Mono', monospace" fontSize="9" textAnchor="end" fill="#737373">Instant Sync</text>
                  <line x1="110" y1="100" x2="155" y2="100" stroke="#404040" strokeWidth="1" strokeDasharray="2 2" />
                </svg>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="landing-display text-lg font-bold mb-3">아이폰에서 바로 업로드</h3>
                <p className="text-[#737373] text-sm leading-relaxed mb-6 flex-1 landing-break">
                  촬영이 끝난 직후, 아이폰 카메라롤에서 바로 업로드합니다. PC 없이 현장에서 고객에게 링크를 전달할 수 있습니다.
                </p>
                <div className="landing-effect-block">
                  <div className="flex flex-col mb-3 pb-3 border-b border-dashed border-[#262626]">
                    <span className="landing-jb text-[10px] text-[#737373] uppercase mb-1">DELIVERY_TIME</span>
                    <span className="landing-display text-2xl text-[#FF4D00] font-bold">당일 전송</span>
                  </div>
                  <div className="landing-jb text-[11px] flex items-center gap-2">
                    <span className="text-[#737373] line-through">1~3일 대기</span>
                    <span className="text-[#FF4D00]">→</span>
                    <span className="text-[#E8E8E8] font-bold">촬영 당일 완료</span>
                  </div>
                </div>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials Section ────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    id: "T_001",
    quote:
      "웨딩 촬영 후 신랑신부분들이 구글드라이브 링크 받으면 어디서부터 봐야 할지 몰라하셨거든요. A컷 쓰고 나서는 '너무 편해요, 그냥 마음에 드는 거 누르면 되잖아요'라고 하시더라고요. 저도 셀렉 결과를 엑셀로 정리할 필요가 없어져서 촬영 한 건당 30분은 아끼는 것 같아요.",
    name: "이지수",
    role: "웨딩 사진작가 · 경력 6년",
    tag: "서울/경기 출장 웨딩 스냅",
    stat: "30min / 건",
    statLabel: "SAVED_PER_JOB",
  },
  {
    id: "T_002",
    quote:
      "저는 아이폰으로만 찍는데요, 예전엔 촬영 끝나고 집 가서 맥북 켜서 구글포토에 올리고 그랬거든요. 지금은 촬영 끝나고 카페에서 커피 마시면서 A컷에 올리고, 고객분한테 링크 바로 드려요. 당일에 사진 받으셨다고 연락 오면 그게 제일 뿌듯하더라고요.",
    name: "박민재",
    role: "아이폰 감성 스냅 작가 · 경력 3년",
    tag: "돌·가족·커플 스냅 전문",
    stat: "당일",
    statLabel: "DELIVERY_TIME",
  },
];

function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative z-10 w-full overflow-hidden" style={{ minHeight: "100vh", background: "#000" }}>
      {/* Scanline */}
      <div className="landing-scanline" style={{ position: "absolute" }} />

      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 lg:px-24 py-16 sm:py-32 flex flex-col min-h-screen justify-center">
        {/* Header */}
        <Reveal>
          <div className="flex items-center gap-4 mb-4">
            <span className="landing-mono text-[10px] tracking-[0.2em] text-[#FF4D00] border border-[#FF4D00]/30 px-2 py-1 uppercase">
              USER_TESTIMONIALS
            </span>
            <div className="h-[1px] flex-1 bg-[#222]" />
            <span className="landing-mono text-[10px] text-gray-600 hidden sm:inline">n=2 · VERIFIED</span>
          </div>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-6xl font-black uppercase leading-tight mb-6 landing-break">
            실제로 써보신<br />
            <span className="text-[#FF4D00]">분들의 이야기</span>
          </h2>
          <p className="landing-mono text-[11px] text-gray-500 mb-24">FIELD_REPORT :: REAL_WORKFLOW_FEEDBACK</p>
        </Reveal>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.id} delayMs={i * 120}>
              <div className="relative border border-[#222] bg-[#0A0A0A] p-8 hover:border-[#FF4D00]/50 transition-colors duration-300">
                {/* ID badge */}
                <div className="absolute top-0 left-0 landing-mono text-[9px] text-[#FF4D00] border border-[#FF4D00]/20 px-2 py-1 -translate-y-1/2 ml-6 bg-[#000]">
                  {t.id}
                </div>

                {/* Quote */}
                <div className="landing-mono text-[#FF4D00] text-xl mb-4 leading-none">&gt;&gt;</div>
                <blockquote className="text-base lg:text-lg text-gray-300 leading-relaxed mb-8 landing-break italic">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="flex items-end justify-between border-t border-[#222] pt-6">
                  <div>
                    <p className="font-bold text-white text-base">{t.name}</p>
                    <p className="landing-mono text-[10px] text-gray-500 mt-1">{t.role}</p>
                    <p className="landing-mono text-[10px] text-gray-600 mt-0.5">{t.tag}</p>
                  </div>
                  <div className="text-right">
                    <p className="landing-display text-3xl font-black text-[#FF4D00]">{t.stat}</p>
                    <p className="landing-mono text-[9px] text-gray-600 mt-1">{t.statLabel}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Bottom buffer status */}
        <div className="flex items-center justify-end gap-6 mt-20">
          <div className="flex flex-col items-end landing-mono text-[9px] text-gray-600 uppercase">
            <span>Buffer_status: optimal</span>
            <span>Stream_id: 8422-9x</span>
          </div>
          <div className="w-12 h-12 border border-[#222] flex items-center justify-center">
            <div className="w-2 h-2 bg-[#FF4D00] animate-ping" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── CTA Section ─────────────────────────────────────────────────────────────

function CTASection({ onAuthOpen }: { onAuthOpen: () => void }) {
  return (
    <section className="relative z-10 w-full overflow-hidden" style={{ background: "#050505", minHeight: "60vh" }}>
      <div className="landing-cta-noise" />
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 sm:px-12 py-20 sm:py-40 min-h-[60vh]">
        <Reveal>
          <p className="landing-mono text-xs text-gray-500 uppercase tracking-[0.3em] mb-4">
            SYSTEM.READY :: INIT_WORKFLOW
          </p>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-5xl font-black uppercase leading-tight mb-6 landing-break">
            다음 촬영부터<br /><span className="text-[#FF4D00]">바로 써보세요</span>
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed max-w-xl mx-auto mb-12 landing-break">
            지금 가입하면 베타 기간 동안 무료로 사용할 수 있습니다.<br />
            프로젝트 10개, 사진 1,500장까지 제한 없이 테스트해보세요.
          </p>
          <button
            type="button"
            onClick={onAuthOpen}
            className="landing-btn-primary gap-4 px-16 py-6 text-black font-bold text-xl uppercase"
          >
            무료로 시작하기
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center gap-4 mt-6 landing-mono text-[11px] text-gray-600">
            <span>베타 기간 무료</span>
            <div className="w-1 h-1 bg-[#FF4D00]" />
            <span>설치 없음</span>
            <div className="w-1 h-1 bg-[#FF4D00]" />
            <span>신용카드 불필요</span>
          </div>
          <p className="mt-24 landing-mono text-[11px] text-gray-700 italic max-w-sm">
            사진 찍는 일에만 집중할 수 있도록.<br />나머지는 A컷이 합니다.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="landing-root">
      {/* Background elements (fixed) */}
      <div className="landing-grid-bg" />
      <div className="landing-scanline" />
      <div className="landing-bracket landing-bracket-tl" />
      <div className="landing-bracket landing-bracket-tr" />
      <div className="landing-bracket landing-bracket-bl" />
      <div className="landing-bracket landing-bracket-br" />

      {/* Mobile hero (lg 미만에서만 표시) */}
      <div className="block lg:hidden">
        <MobileHeroSection onAuthOpen={() => setAuthOpen(true)} />
      </div>

      {/* Desktop header (lg 이상에서만 표시) */}
      <Header onAuthOpen={() => setAuthOpen(true)} />

      <main>
        {/* Desktop hero (lg 이상에서만 표시) */}
        <div className="hidden lg:block">
          <HeroSection onAuthOpen={() => setAuthOpen(true)} />
        </div>
        <ProblemSection onAuthOpen={() => setAuthOpen(true)} />
        <ServicesSection />
        <TestimonialsSection />
        <CTASection onAuthOpen={() => setAuthOpen(true)} />
      </main>

      <footer className="landing-footer relative z-10 border-t border-[#222] py-8 bg-[#000]">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#FF4D00] flex items-center justify-center text-black font-black text-[10px]">A</div>
            <span className="landing-display font-bold tracking-tighter text-lg uppercase">
              A-Cut<span className="text-[#FF4D00]">.</span>
            </span>
          </div>
          <p className="landing-mono text-[10px] text-gray-700">© {new Date().getFullYear()} A CUT</p>
        </div>
      </footer>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
