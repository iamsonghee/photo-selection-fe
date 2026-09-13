"use client";
import { useEffect, useRef } from "react";
import "./benefits-scroll.css";
import { BenefitVisual } from "./BenefitVisual";
import { SentenceText } from "./SentenceText";

// 실제 제공 기능을 설명하며 AI가 사진을 자동 삭제하거나 최종 선택한다고 표현하지 않는다.
const BENEFITS = [
  { name: "AI 셀렉 보조", title: "AI로 돕는 사진 셀렉.", body: "유사컷을 묶어 비교하고, 눈감음·흐림 필터로 확인할 사진을 좁혀보세요. 최종 선택은 직접 결정합니다.", label: "AI 셀렉 보조", tags: ["유사컷 묶음", "눈감음", "흐림·흔들림"] },
  { name: "원본 전달", title: "원본 전달도 한곳에서.", body: "원본을 업로드하고 고객에게 다운로드 링크를 공유하세요. 사진과 전달 정보를 한곳에서 관리합니다.", label: "원본 전달 · 다운로드", tags: [] },
  { name: "셀렉 기한", title: "셀렉에도 기한을.", body: "고객에게 셀렉 기한을 안내하고 진행 상태를 확인하세요. 언제까지 기다릴지, 다음 보정 작업은 언제 시작할지 계획할 수 있습니다.", label: "셀렉 기한 · 진행 상태", tags: [] },
];

/** 샘플 비주얼을 포함한 장점 카드. 휠/터치를 가로채지 않고 일반 스크롤 위치만 읽는다. */
export function BenefitsScroll() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const desktop = matchMedia("(min-width: 801px) and (min-height: 640px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const cards = [...section.querySelectorAll<HTMLElement>(".bs-card")];
    const steps = [...section.querySelectorAll<HTMLElement>(".bs-step")];
    const stage = section.querySelector<HTMLElement>(".bs-stage")!;
    const count = section.querySelector<HTMLElement>(".bs-count")!;
    let frame = 0;
    const update = () => {
      frame = 0;
      const animated = desktop.matches && !reduced.matches;
      section.dataset.mode = reduced.matches ? "static" : animated ? "stack" : "mobile";
      const rect = section.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const progress = Math.max(0, Math.min(1, (top - rect.top) / Math.max(1, section.offsetHeight - stage.offsetHeight)));
      // 시작과 끝에 읽을 시간을 남기고 두 전환 구간만 스크롤에 연동한다.
      const position = Math.max(0, Math.min(2, (progress - .12) / .38));
      const active = Math.min(2, Math.floor(position + .5));
      count.textContent = `0${active + 1} / 03`;
      steps.forEach((step, i) => step.dataset.active = String(i === active));
      cards.forEach((card, i) => {
        card.removeAttribute("aria-hidden");
        if (animated) {
          const incoming = Math.max(0, Math.min(1, position - (i - 1)));
          const outgoing = Math.max(0, Math.min(1, position - i));
          const visible = i === 0 ? 1 : incoming;
          card.style.transform = `translateY(${(1-visible)*100 - outgoing*12}px) scale(${1 - outgoing*.045 - (1-visible)*.025})`;
          card.style.opacity = String(visible * (1-outgoing));
          card.setAttribute("aria-hidden", String(i !== active));
        } else {
          const visible = reduced.matches || card.getBoundingClientRect().top < innerHeight * .92;
          card.style.transform = visible ? "none" : "translateY(12px) scale(.985)";
          card.style.opacity = visible ? "1" : ".75";
        }
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    desktop.addEventListener("change", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule); removeEventListener("resize", schedule);
      desktop.removeEventListener("change", schedule); reduced.removeEventListener("change", schedule);
    };
  }, []);
  return <section ref={root} id="benefits" className="bs-section ac-container" aria-labelledby="benefits-title">
    <div className="bs-stage">
      <header className="bs-heading"><p className="bs-eyebrow">A-CUT을 쓰는 이유</p><h2 id="benefits-title">촬영 후의 일을 간편하게.</h2><p className="bs-description">AI 셀렉 보조, 원본 전달, 셀렉 기한 관리.<br/>촬영 이후 작가의 일을 더 간편하게.</p>
        <div className="bs-progress" aria-hidden="true"><span className="bs-count">01 / 03</span>{BENEFITS.map(item=><span className="bs-step" key={item.name}>{item.name}</span>)}</div>
      </header>
      <div className="bs-cards">{BENEFITS.map((item,i)=><article className="bs-card" key={item.name}><span className="bs-number">0{i+1}</span><span className="bs-label">{item.label}</span><h3>{item.title}</h3><p><SentenceText>{item.body}</SentenceText></p>{item.tags.length>0&&<ul className="bs-tags" aria-label="AI 지원 기능">{item.tags.map(tag=><li key={tag}>{tag}</li>)}</ul>}<BenefitVisual index={i}/></article>)}</div>
    </div>
  </section>;
}
