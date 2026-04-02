"use client";

import Image from "next/image";
import Link from "next/link";
import { BrandLogoBar, BrandLogoFull } from "@/components/BrandLogo";
import { useEffect, useRef, useState } from "react";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

function RevealInner({
  children,
  className = "",
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setVisible(true);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`about-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function DoubleBezel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10 ${className}`}
      style={{ transition: `all 0.5s ${ease}` }}
    >
      <div className="h-full rounded-[calc(2rem-0.375rem)] bg-zinc-900/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-sm">
        {children}
      </div>
    </div>
  );
}

function PillCta({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "group inline-flex items-center gap-3 rounded-full px-8 py-4 text-[15px] font-medium tracking-tight";
  const styles =
    variant === "primary"
      ? "bg-[#4f7eff] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:shadow-[0_0_40px_rgba(79,126,255,0.35)]"
      : "bg-white/5 text-zinc-100 ring-1 ring-white/10 hover:bg-white/10";

  return (
    <Link
      href={href}
      className={`${base} ${styles} active:scale-[0.98] hover:scale-[1.02]`}
      style={{ transition: `all 0.5s ${ease}` }}
    >
      <span>{children}</span>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 transition-transform group-hover:translate-x-1"
        style={{ transition: `transform 0.5s ${ease}` }}
      >
        <iconify-icon icon="solar:arrow-right-linear" width="18" height="18" className="text-white" />
      </span>
    </Link>
  );
}

export default function AboutPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="about-root relative min-h-[100dvh] overflow-x-hidden bg-[#050505] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="about-float-slow absolute -left-32 top-24 h-72 w-72 rounded-full bg-[#4f7eff]/20 blur-[100px]"
          aria-hidden
        />
        <div
          className="about-float-slow absolute right-[-20%] top-1/3 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]"
          style={{ animationDelay: "1.2s" }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 h-64 w-[120%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(79,126,255,0.12),transparent_65%)]"
          aria-hidden
        />
      </div>

      <header className="relative z-50 px-4 pt-4 md:px-8">
        <nav
          className="relative z-[60] mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl md:px-6"
          style={{ transition: `all 0.5s ${ease}` }}
        >
          <Link href="/about" className="inline-flex items-center">
            <BrandLogoBar size="md" priority />
          </Link>
          <div className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#features" className="hover:text-white" style={{ transition: `color 0.5s ${ease}` }}>
              기능
            </a>
            <a href="#proof" className="hover:text-white" style={{ transition: `color 0.5s ${ease}` }}>
              신뢰
            </a>
            <a href="#voices" className="hover:text-white" style={{ transition: `color 0.5s ${ease}` }}>
              후기
            </a>
            <a href="#cta" className="hover:text-white" style={{ transition: `color 0.5s ${ease}` }}>
              시작하기
            </a>
          </div>
          <div className="flex items-center gap-2">
            <PillCta href="/auth" variant="primary">
              로그인
            </PillCta>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 md:hidden"
              aria-expanded={mobileOpen}
              aria-label="메뉴"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <iconify-icon icon={mobileOpen ? "solar:close-circle-linear" : "solar:hamburger-menu-linear"} width="22" height="22" />
            </button>
          </div>
        </nav>
        {mobileOpen ? (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#050505]/95 px-6 backdrop-blur-3xl md:hidden"
            style={{ transition: `opacity 0.5s ${ease}` }}
          >
            {["#features", "#proof", "#voices", "#cta"].map((h, i) => (
              <a
                key={h}
                href={h}
                className="text-lg text-zinc-200"
                style={{
                  opacity: mobileOpen ? 1 : 0,
                  transform: mobileOpen ? "translateY(0)" : "translateY(2rem)",
                  transition: `all 0.5s ${ease}`,
                  transitionDelay: `${80 * i}ms`,
                }}
                onClick={() => setMobileOpen(false)}
              >
                {["기능", "신뢰", "후기", "시작하기"][i]}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-24 pt-16 md:flex-row md:items-center md:gap-16 md:px-8 md:pb-32 md:pt-24 lg:gap-24 lg:py-40">
          <RevealInner className="max-w-xl flex-1">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#4f7eff]/25 bg-[#4f7eff]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[#7ea3ff]">
              워크플로우 하나로 끝내는 셀렉
            </p>
            <h1 className="about-break font-display text-4xl font-semibold leading-snug tracking-tight text-white md:text-5xl lg:text-6xl">
              촬영 뒤의 시간을
              <br />
              <span className="bg-gradient-to-r from-[#7ea3ff] to-violet-300 bg-clip-text text-transparent">
                덜 바쁘게
              </span>
            </h1>
            <p className="about-break mt-6 text-lg leading-relaxed text-zinc-400 md:text-xl">
              업로드·버전 정리·고객 셀렉·피드백까지 한 화면에서 이어집니다. 링크 하나로 갤러리를 넘기고, 정리된 기록으로
              보정과 납품까지 가져가세요.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <PillCta href="/auth">무료로 시작하기</PillCta>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
                style={{ transition: `color 0.5s ${ease}` }}
              >
                <iconify-icon icon="solar:play-circle-linear" width="20" height="20" />
                기능 살펴보기
              </a>
            </div>
          </RevealInner>

          <RevealInner delayMs={80} className="relative flex flex-1 justify-center">
            <DoubleBezel className="w-full max-w-md">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[calc(2rem-0.375rem)]">
                <Image
                  src="https://images.unsplash.com/photo-1542038782986-f0be38184d09?auto=format&fit=crop&w=900&q=80"
                  alt="스튜디오에서 카메라를 다루는 작가"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 420px"
                  priority
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">이번 주 처리량</p>
                  <p className="mt-1 font-display text-3xl font-semibold text-white">12,847장</p>
                  <p className="mt-1 text-sm text-zinc-400">셀렉 대기 → 진행 중까지 실시간 집계</p>
                </div>
              </div>
            </DoubleBezel>
          </RevealInner>
        </section>

        <section id="proof" className="border-y border-white/5 bg-zinc-950/50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <RevealInner>
              <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">함께하는 팀</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-80">
                {["스텔라랩스", "루미너스", "플로우캔버스", "넥스트비전", "브릿지웍스"].map((name) => (
                  <span
                    key={name}
                    className="font-display text-lg font-semibold tracking-wide text-zinc-500 md:text-xl"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {[
                  { n: "4.87", s: "/5.0", l: "고객 만족 평균" },
                  { n: "2.3", s: "초", l: "갤러리 첫 로드" },
                  { n: "98.7", s: "%", l: "셀렉 완료율" },
                ].map((item, i) => (
                  <DoubleBezel key={item.l} className={i === 1 ? "sm:col-span-1" : ""}>
                    <div className="px-6 py-8 text-center">
                      <p className="font-display text-4xl font-semibold text-white">
                        {item.n}
                        <span className="text-2xl text-[#7ea3ff]">{item.s}</span>
                      </p>
                      <p className="about-break mt-2 text-sm text-zinc-400">{item.l}</p>
                    </div>
                  </DoubleBezel>
                ))}
              </div>
            </RevealInner>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
          <RevealInner>
            <div className="max-w-2xl">
              <p className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                기능
              </p>
              <h2 className="about-break mt-4 font-display text-3xl font-semibold leading-snug text-white md:text-4xl">
                작가는 정리에 쓰는 시간을 줄이고,
                <br className="hidden md:block" />
                고객은 고르는 경험에만 집중합니다.
              </h2>
            </div>
          </RevealInner>

          <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-5">
            <RevealInner className="md:col-span-8 md:row-span-2" delayMs={0}>
              <DoubleBezel className="h-full">
                <div className="flex h-full flex-col justify-between gap-8 p-8 md:p-10">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4f7eff]/15 ring-1 ring-[#4f7eff]/30">
                      <iconify-icon icon="solar:share-bold" width="26" height="26" className="text-[#7ea3ff]" />
                    </div>
                    <h3 className="about-break mt-6 text-xl font-semibold text-white md:text-2xl">링크 한 번 공유</h3>
                    <p className="about-break mt-3 text-base leading-relaxed text-zinc-400">
                      프로젝트마다 갤러리 주소를 나누고, 버전이 바뀌어도 같은 링크 흐름을 유지합니다. 메신저·메일
                      어디로 보내도 첫 화면부터 동일한 경험입니다.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
                    <span className="text-emerald-400/90">●</span> 고객 초대 링크 발급 → 열람 로그는 대시보드에서 확인
                  </div>
                </div>
              </DoubleBezel>
            </RevealInner>

            <RevealInner className="md:col-span-4" delayMs={60}>
              <DoubleBezel className="h-full">
                <div className="p-8">
                  <iconify-icon icon="solar:check-circle-bold" width="28" height="28" className="text-[#7ea3ff]" />
                  <h3 className="about-break mt-5 text-lg font-semibold text-white">실시간 셀렉</h3>
                  <p className="about-break mt-2 text-sm leading-relaxed text-zinc-400">
                    고객이 찍은 번호를 남기면 작가 화면에 바로 반영됩니다. 엑셀·캡처 없이 목록이 정리됩니다.
                  </p>
                </div>
              </DoubleBezel>
            </RevealInner>

            <RevealInner className="md:col-span-4" delayMs={100}>
              <DoubleBezel className="h-full">
                <div className="p-8">
                  <iconify-icon icon="solar:layers-bold" width="28" height="28" className="text-[#7ea3ff]" />
                  <h3 className="about-break mt-5 text-lg font-semibold text-white">업로드·버전 정리</h3>
                  <p className="about-break mt-2 text-sm leading-relaxed text-zinc-400">
                    1차·수정본을 나란히 올리고, 고객에게 보여줄 범위만 골라 공개합니다.
                  </p>
                </div>
              </DoubleBezel>
            </RevealInner>

            <RevealInner className="md:col-span-6" delayMs={40}>
              <DoubleBezel className="h-full">
                <div className="p-8">
                  <iconify-icon icon="solar:chat-round-dots-bold" width="28" height="28" className="text-[#7ea3ff]" />
                  <h3 className="about-break mt-5 text-lg font-semibold text-white">코멘트와 보정 연결</h3>
                  <p className="about-break mt-2 text-sm leading-relaxed text-zinc-400">
                    장면별 메모를 남기고, 셀렉이 끝난 뒤 보정·납품 단계로 자연스럽게 이어집니다.
                  </p>
                </div>
              </DoubleBezel>
            </RevealInner>

            <RevealInner className="md:col-span-6" delayMs={120}>
              <DoubleBezel className="h-full">
                <div className="p-8">
                  <iconify-icon icon="solar:shield-check-bold" width="28" height="28" className="text-[#7ea3ff]" />
                  <h3 className="about-break mt-5 text-lg font-semibold text-white">권한과 기록</h3>
                  <p className="about-break mt-2 text-sm leading-relaxed text-zinc-400">
                    누가 언제 열람했는지, 어떤 파일이 확정됐는지 남아서 분쟁 없이 마무리합니다.
                  </p>
                </div>
              </DoubleBezel>
            </RevealInner>
          </div>
        </section>

        <section id="voices" className="border-t border-white/5 bg-[#070708] py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <RevealInner>
              <h2 className="font-display text-3xl font-semibold text-white md:text-4xl">현장의 이야기</h2>
              <p className="about-break mt-3 max-w-xl text-zinc-400">
                실제 웨딩·스튜디오·상업 촬영 팀이 남긴 사용 소감입니다.
              </p>
            </RevealInner>

            <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
              {[
                {
                  q: "셀렉 문자만으로는 빠지는 번호가 많았는데, 지금은 목록이 자동으로 모입니다.",
                  name: "김하늘",
                  role: "웨딩 스튜디오 대표",
                },
                {
                  q: "버전이 두 개만 있어도 고객이 헷갈려 했는데, 공개 범위를 나누니 설명 시간이 줄었습니다.",
                  name: "박도현",
                  role: "프로덕트 디자이너",
                },
                {
                  q: "외주 보정실에 넘길 때 파일 이름·선택 번호가 한 번에 정리돼서 커뮤니케이션이 줄었습니다.",
                  name: "이서진",
                  role: "상업 촬영 리드",
                },
              ].map((t, i) => (
                <RevealInner key={t.name} delayMs={i * 70}>
                  <DoubleBezel>
                    <div className="p-8">
                      <iconify-icon icon="solar:quote-up-bold" width="24" height="24" className="text-zinc-600" />
                      <p className="about-break mt-4 text-sm leading-relaxed text-zinc-300">{t.q}</p>
                      <p className="mt-6 text-sm font-medium text-white">{t.name}</p>
                      <p className="text-xs text-zinc-500">{t.role}</p>
                    </div>
                  </DoubleBezel>
                </RevealInner>
              ))}
            </div>
          </div>
        </section>

        <section id="cta" className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
          <RevealInner>
            <DoubleBezel>
              <div className="flex flex-col items-start justify-between gap-8 p-10 md:flex-row md:items-center md:p-14">
                <div>
                  <h2 className="about-break font-display text-2xl font-semibold text-white md:text-3xl">
                    다음 촬영부터는 정리 시간을 줄여보세요.
                  </h2>
                  <p className="about-break mt-3 max-w-lg text-zinc-400">
                    계정을 만들고 첫 프로젝트를 열면, 바로 갤러리를 올리고 링크를 나눌 수 있습니다.
                  </p>
                </div>
                <PillCta href="/auth">지금 시작하기</PillCta>
              </div>
            </DoubleBezel>
          </RevealInner>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <BrandLogoFull maxWidth={220} className="opacity-95" />
            <p className="about-break mt-3 text-sm text-zinc-500">사진작가와 고객을 잇는 셀렉·보정 워크플로우</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-zinc-400">
            <Link href="/auth" className="hover:text-zinc-200" style={{ transition: `color 0.5s ${ease}` }}>
              로그인
            </Link>
            <a href="#features" className="hover:text-zinc-200" style={{ transition: `color 0.5s ${ease}` }}>
              기능
            </a>
          </div>
          <p className="text-xs text-zinc-600">© {new Date().getFullYear()} A CUT</p>
        </div>
      </footer>
    </div>
  );
}
