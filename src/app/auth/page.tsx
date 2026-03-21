"use client";

import { useState, useEffect } from "react";
import { Camera, Share2, CheckCircle2, Layers, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#0d1e28",
  surface: "#0f2030",
  steel: "#669bbc",
  steelFaint: "rgba(102,155,188,0.08)",
  steelBorder: "rgba(102,155,188,0.15)",
  muted: "#7a9ab0",
  dim: "#3a5a6e",
  text: "#d6e8f2",
  white: "#ffffff",
};

const FEATURES = [
  {
    icon: Share2,
    title: "간편 공유",
    desc: "링크 하나로 고객에게 갤러리를 전달하세요.",
  },
  {
    icon: CheckCircle2,
    title: "실시간 셀렉",
    desc: "고객이 직접 사진을 고르고 코멘트를 남깁니다.",
  },
  {
    icon: Layers,
    title: "보정 워크플로우",
    desc: "셀렉 완료 후 보정·납품까지 한 흐름으로.",
  },
];

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
      setError("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정한 뒤 개발 서버를 재시작해 주세요.");
      setLoading(null);
      return;
    }
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
        },
      });
      if (err) { setError(err.message); setLoading(null); return; }
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

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: C.ink,
        fontFamily: "'DM Sans', 'Noto Sans KR', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── background grid ── */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(102,155,188,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(102,155,188,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />

      {/* ── floating blobs ── */}
      {[
        { top: "10%", left: "15%", size: 320, color: "rgba(102,155,188,0.07)" },
        { top: "60%", left: "5%",  size: 240, color: "rgba(46,213,115,0.05)" },
        { top: "30%", left: "45%", size: 200, color: "rgba(102,155,188,0.05)" },
      ].map((b, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: "absolute",
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: "50%",
            background: b.color,
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* ══════════════ LEFT PANEL ══════════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 64px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 64,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#0a1a28",
              border: `1px solid ${C.steelBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Camera size={20} color={C.steel} />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 20,
                fontWeight: 600,
                color: C.text,
                lineHeight: 1.1,
              }}
            >
              A컷
            </div>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Acut
            </div>
          </div>
        </div>

        {/* Hero */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s",
          }}
        >
          <p style={{ fontSize: 12, color: C.steel, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
            사진작가를 위한 셀렉 워크플로우
          </p>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 42,
              fontWeight: 600,
              color: C.white,
              lineHeight: 1.2,
              marginBottom: 20,
            }}
          >
            사진 셀렉,<br />
            <span style={{ color: C.steel }}>더 스마트하게</span>
          </h1>
          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, maxWidth: 420, marginBottom: 48 }}>
            고객과의 사진 선택·보정 과정을 하나의 흐름으로 관리하세요.
            링크 공유부터 최종 납품까지.
          </p>
        </div>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 48 }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(16px)",
                transition: `opacity 0.5s ease ${0.2 + i * 0.08}s, transform 0.5s ease ${0.2 + i * 0.08}s`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: C.steelFaint,
                  border: `1px solid ${C.steelBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <f.icon size={16} color={C.steel} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Beta badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 20,
            backgroundColor: "rgba(102,155,188,0.1)",
            border: `1px solid ${C.steelBorder}`,
            width: "fit-content",
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.5s ease 0.5s",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "rgba(46,213,115,0.8)" }} />
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>Beta · 현재 무료로 이용 가능</span>
        </div>
      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div
        style={{
          width: 420,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 40px",
          position: "relative",
          zIndex: 1,
          background: "radial-gradient(ellipse at 60% 40%, rgba(102,155,188,0.06) 0%, transparent 70%)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 340,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s",
          }}
        >
          {/* Card */}
          <div
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.steelBorder}`,
              borderRadius: 16,
              padding: "36px 32px",
            }}
          >
            <p style={{ fontSize: 11, color: C.steel, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
              시작하기
            </p>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 24,
                fontWeight: 600,
                color: C.white,
                lineHeight: 1.3,
                marginBottom: 8,
              }}
            >
              A컷에 오신 걸<br />환영합니다
            </h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 28, lineHeight: 1.5 }}>
              소셜 계정으로 간편하게 시작하세요.
            </p>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  backgroundColor: "rgba(255,71,87,0.1)",
                  border: "1px solid rgba(255,71,87,0.2)",
                  fontSize: 12,
                  color: "#ff6b7a",
                  marginBottom: 20,
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {/* Google button */}
            <button
              onClick={handleGoogleLogin}
              disabled={!!loading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "11px 0",
                borderRadius: 10,
                backgroundColor: C.white,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading === "google" ? 0.7 : 1,
                fontSize: 14,
                fontWeight: 500,
                color: "#1a1a1a",
                fontFamily: "'DM Sans', sans-serif",
                transform: "translateY(0)",
                transition: "transform 0.15s ease, opacity 0.15s ease",
                marginBottom: 12,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {loading === "google" ? "연결 중…" : "Google로 계속하기"}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: C.steelBorder }} />
              <span style={{ fontSize: 11, color: C.dim }}>또는</span>
              <div style={{ flex: 1, height: 1, backgroundColor: C.steelBorder }} />
            </div>

            {/* Kakao button */}
            <button
              onClick={handleKakaoLogin}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "11px 0",
                borderRadius: 10,
                backgroundColor: "#FEE500",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                color: "#3C1E1E",
                fontFamily: "'DM Sans', sans-serif",
                transform: "translateY(0)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <MessageCircle size={18} color="#3C1E1E" />
              카카오로 계속하기
            </button>
          </div>

          {/* Terms */}
          <p style={{ fontSize: 11, color: C.dim, textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
            최초 로그인 시 자동으로 가입됩니다
            <br />
            <a href="#" style={{ color: C.muted, textDecoration: "none" }}>이용약관</a>
            {" · "}
            <a href="#" style={{ color: C.muted, textDecoration: "none" }}>개인정보처리방침</a>
          </p>
        </div>
      </div>
    </div>
  );
}
