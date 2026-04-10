"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_OAUTH_QUERY_PARAMS } from "@/lib/google-oauth";
import { BrandLogoBar } from "@/components/BrandLogo";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

const FEATURES = [
  {
    icon: "solar:share-bold",
    title: "간편 공유",
    desc: "링크 하나로 고객에게 갤러리를 전달하세요.",
  },
  {
    icon: "solar:check-circle-bold",
    title: "실시간 셀렉",
    desc: "고객이 직접 사진을 고르고 코멘트를 남깁니다.",
  },
  {
    icon: "solar:layers-bold",
    title: "보정 워크플로우",
    desc: "셀렉 완료 후 보정·납품까지 한 흐름으로.",
  },
] as const;

function DoubleBezel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10 ${className}`}
      style={{ transition: `all 0.5s ${ease}` }}
    >
      <div className="h-full rounded-[calc(2rem-0.375rem)] bg-zinc-900/85 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(decodeURIComponent(err));
  }, []);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading("google");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
      setError(
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정한 뒤 개발 서버를 재시작해 주세요.",
      );
      setLoading(null);
      return;
    }
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
          queryParams: GOOGLE_OAUTH_QUERY_PARAMS,
        },
      });
      if (err) {
        setError(err.message);
        setLoading(null);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError("로그인 URL을 받지 못했습니다. Supabase Google Provider 설정을 확인하세요.");
        setLoading(null);
      }
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
      setLoading(null);
    }
  };

  const handleKakaoLogin = () => setError("카카오 로그인은 준비 중입니다.");

  const fadeIn = (delaySec: number) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(1rem)",
    transition: `opacity 0.65s ${ease}, transform 0.65s ${ease}`,
    transitionDelay: `${delaySec}s`,
  });

  return (
    <div className="auth-root relative min-h-[100dvh] overflow-hidden bg-[#050505] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="auth-orb absolute -left-24 top-[12%] h-80 w-80 rounded-full bg-[#4f7eff]/18 blur-[100px]"
          aria-hidden
        />
        <div
          className="auth-orb absolute right-[-10%] top-[40%] h-72 w-72 rounded-full bg-violet-500/12 blur-[90px]"
          style={{ animationDelay: "1.5s" }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 h-48 w-[140%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(79,126,255,0.1),transparent_70%)]"
          aria-hidden
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-center px-4 py-10 md:px-8 md:py-16 lg:py-20">
        <header className="mb-10 flex items-center justify-between md:mb-12" style={fadeIn(0)}>
          <Link href="/auth" className="inline-flex items-center">
            <BrandLogoBar size="md" priority />
          </Link>
          <Link
            href="/about"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 backdrop-blur-md hover:border-white/20 hover:text-white"
            style={{ transition: `all 0.5s ${ease}` }}
          >
            서비스 소개
          </Link>
        </header>

        <div className="flex flex-col-reverse items-stretch gap-12 lg:flex-row lg:items-center lg:gap-16 xl:gap-20">
          {/* Left: story */}
          <div className="min-w-0 flex-1">
            <div style={fadeIn(0.05)}>
              <p className="mb-3 inline-flex items-center rounded-full border border-[#4f7eff]/25 bg-[#4f7eff]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[#7ea3ff]">
                사진작가를 위한 셀렉 워크플로우
              </p>
              <h1 className="auth-break font-display text-3xl font-semibold leading-snug tracking-tight text-white md:text-4xl lg:text-[2.75rem]">
                사진 셀렉,
                <br />
                <span className="bg-gradient-to-r from-[#7ea3ff] to-violet-300 bg-clip-text text-transparent">
                  더 스마트하게
                </span>
              </h1>
              <p className="auth-break mt-5 max-w-md text-base leading-relaxed text-zinc-400 md:text-lg">
                고객과의 사진 선택·보정 과정을 하나의 흐름으로 관리하세요. 링크 공유부터 최종 납품까지.
              </p>
            </div>

            <ul className="mt-10 flex flex-col gap-5">
              {FEATURES.map((f, i) => (
                <li
                  key={f.title}
                  className="flex gap-4"
                  style={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? "translateY(0)" : "translateY(0.75rem)",
                    transition: `opacity 0.65s ${ease}, transform 0.65s ${ease}`,
                    transitionDelay: `${0.12 + i * 0.07}s`,
                  }}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4f7eff]/12 ring-1 ring-[#4f7eff]/25">
                    <iconify-icon icon={f.icon} width="22" height="22" className="text-[#7ea3ff]" />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-zinc-100">{f.title}</p>
                    <p className="auth-break mt-0.5 text-sm leading-relaxed text-zinc-500">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div
              className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
              style={fadeIn(0.45)}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.5)]" />
              <span className="text-xs font-medium text-zinc-400">Beta · 현재 무료로 이용 가능</span>
            </div>
          </div>

          {/* Right: login card */}
          <div className="w-full shrink-0 lg:w-[380px]">
            <div style={fadeIn(0.08)}>
              <DoubleBezel>
                <div className="px-6 py-9 sm:px-8 sm:py-10">
                  <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#7ea3ff]">시작하기</p>
                  <h2 className="auth-break mt-2 font-display text-2xl font-semibold leading-snug text-white">
                    A CUT에
                    <br />
                    오신 걸 환영합니다
                  </h2>
                  <p className="auth-break mt-3 text-sm leading-relaxed text-zinc-400">소셜 계정으로 간편하게 시작하세요.</p>

                  {error ? (
                    <div
                      className="auth-break mt-6 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-300"
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={!!loading}
                      className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white py-3.5 text-sm font-medium text-zinc-900 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.01] active:scale-[0.99]"
                      style={{ transition: `all 0.5s ${ease}` }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      {loading === "google" ? "연결 중…" : "Google로 계속하기"}
                    </button>

                    <div className="flex items-center gap-3 py-0.5">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] text-zinc-500">또는</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <button
                      type="button"
                      onClick={handleKakaoLogin}
                      className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#FEE500] py-3.5 text-sm font-medium text-[#3C1E1E] hover:scale-[1.01] active:scale-[0.99]"
                      style={{ transition: `all 0.5s ${ease}` }}
                    >
                      <iconify-icon icon="solar:chat-round-dots-bold" width="20" height="20" />
                      카카오로 계속하기
                    </button>
                  </div>
                </div>
              </DoubleBezel>

              <p className="auth-break mt-5 text-center text-[11px] leading-relaxed text-zinc-500">
                최초 로그인 시 자동으로 가입됩니다
                <br />
                <a href="#" className="text-zinc-400 hover:text-zinc-300" style={{ transition: `color 0.5s ${ease}` }}>
                  이용약관
                </a>
                {" · "}
                <a href="#" className="text-zinc-400 hover:text-zinc-300" style={{ transition: `color 0.5s ${ease}` }}>
                  개인정보처리방침
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
