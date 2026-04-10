"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_OAUTH_QUERY_PARAMS } from "@/lib/google-oauth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setIsMobile(window.innerWidth <= 600);
    const handler = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(
      () => {
        setClosing(false);
        setError(null);
        setLoading(null);
        onClose();
      },
      isMobile ? 350 : 400,
    );
  }, [onClose, isMobile]);

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, handleClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ── Auth handlers (identical logic to /auth page) ────────────────────────
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
          redirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
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
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen && !closing) return null;

  return (
    <div
      className={`auth-modal-backdrop${closing ? " auth-modal-closing" : ""}`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className={`auth-modal-container${closing && isMobile ? " auth-modal-slide-out" : ""}`}>
        {/* Corner brackets */}
        <div className="auth-modal-bracket auth-modal-bracket-tl" />
        <div className="auth-modal-bracket auth-modal-bracket-tr" />
        <div className="auth-modal-bracket auth-modal-bracket-bl" />
        <div className="auth-modal-bracket auth-modal-bracket-br" />

        {/* Scanlines overlay */}
        <div className="auth-modal-scanlines" />

        <div className="auth-modal-inner">
          {/* Header */}
          <div className="auth-modal-header">
            <div className="auth-modal-sys-status">
              <div className="auth-modal-status-dot" />
              <span>[SYS.AUTH_PROTOCOL: STANDBY]</span>
            </div>
            <button
              type="button"
              className="auth-modal-close-btn"
              aria-label="Close"
              onClick={handleClose}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="auth-modal-body">
            <div className="auth-modal-logo">
              A<span className="auth-modal-accent">-</span>CUT
            </div>

            <div className="auth-modal-meta-block">
              <span className="auth-modal-sys-label">SECURE_CONN: SSL</span>
              <span className="auth-modal-sys-label">OAUTH_READY</span>
            </div>

            <h1 className="auth-modal-headline">3초면 시작할 수 있어요</h1>

            {error && (
              <div className="auth-modal-error" role="alert">
                {error}
              </div>
            )}

            <div className="auth-modal-action-group">
              {/* Google */}
              <button
                type="button"
                className="auth-modal-btn auth-modal-btn-google"
                onClick={handleGoogleLogin}
                disabled={!!loading}
              >
                <span className="auth-modal-btn-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </span>
                {loading === "google" ? "연결 중…" : "Google로 시작하기"}
              </button>

              {/* Kakao */}
              <button
                type="button"
                className="auth-modal-btn auth-modal-btn-kakao"
                onClick={handleKakaoLogin}
                disabled={!!loading}
              >
                <span className="auth-modal-btn-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                    <path
                      fill="#181600"
                      d="M12 3c-5.52 0-10 3.46-10 7.73 0 2.76 1.77 5.18 4.45 6.47l-1.14 4.21c-.08.31.24.56.51.41l4.9-3.23c.42.04.85.06 1.28.06 5.52 0 10-3.46 10-7.72C22 6.46 17.52 3 12 3z"
                    />
                  </svg>
                </span>
                카카오로 시작하기
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="auth-modal-footer">
            <p className="auth-modal-terms">
              로그인 시{" "}
              <a href="#" className="auth-modal-terms-link">이용약관</a>
              {" "}및{" "}
              <a href="#" className="auth-modal-terms-link">개인정보처리방침</a>에 동의합니다
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .auth-modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.82);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 1;
          transition: opacity 0.3s ease;
        }
        .auth-modal-backdrop.auth-modal-closing {
          opacity: 0;
          pointer-events: none;
        }

        .auth-modal-container {
          position: relative;
          width: 100%;
          max-width: 440px;
          background-color: #050505;
          border: 1px solid #222222;
          box-shadow:
            0 0 60px rgba(255, 77, 0, 0.05),
            inset 0 0 20px rgba(255, 77, 0, 0.02);
          z-index: 20;
          overflow: hidden;
          animation: authModalEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes authModalEnter {
          from { opacity: 0; transform: scale(0.98) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }

        @keyframes authModalSlideOut {
          from { transform: translateY(0); }
          to   { transform: translateY(100%); }
        }

        .auth-modal-bracket {
          position: absolute;
          width: 16px;
          height: 16px;
          border: 2px solid #FF4D00;
          z-index: 30;
          pointer-events: none;
        }
        .auth-modal-bracket-tl { top: -1px; left: -1px;   border-right: none; border-bottom: none; }
        .auth-modal-bracket-tr { top: -1px; right: -1px;  border-left:  none; border-bottom: none; }
        .auth-modal-bracket-bl { bottom: -1px; left: -1px;  border-right: none; border-top: none; }
        .auth-modal-bracket-br { bottom: -1px; right: -1px; border-left:  none; border-top: none; }

        .auth-modal-scanlines {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0) 50%,
            rgba(0,0,0,0.2) 50%,
            rgba(0,0,0,0.2) 100%
          );
          background-size: 100% 4px;
          pointer-events: none;
          z-index: 25;
          opacity: 0.5;
          animation: authScanlineScroll 10s linear infinite;
        }

        @keyframes authScanlineScroll {
          from { background-position: 0 0; }
          to   { background-position: 0 100vh; }
        }

        .auth-modal-inner {
          position: relative;
          z-index: 30;
          padding: 32px 40px 40px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .auth-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .auth-modal-sys-status {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: #888;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .auth-modal-status-dot {
          width: 6px;
          height: 6px;
          background-color: #FF4D00;
          border-radius: 50%;
          box-shadow: 0 0 8px #FF4D00;
          animation: authModalPulse 2s infinite;
        }

        @keyframes authModalPulse {
          0%   { opacity: 0.4; box-shadow: 0 0 2px #FF4D00; }
          50%  { opacity: 1;   box-shadow: 0 0 12px #FF4D00; }
          100% { opacity: 0.4; box-shadow: 0 0 2px #FF4D00; }
        }

        .auth-modal-close-btn {
          background: none;
          border: none;
          color: #888;
          font-family: 'Space Mono', monospace;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          transition: color 0.2s;
          padding: 0;
          margin-top: -6px;
          margin-right: -8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-modal-close-btn:hover { color: #FF4D00; }

        .auth-modal-body {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
        }

        .auth-modal-logo {
          font-family: 'Space Mono', monospace;
          font-size: 42px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 8px;
        }

        .auth-modal-accent { color: #FF4D00; }

        .auth-modal-headline {
          font-size: 20px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }

        .auth-modal-meta-block {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .auth-modal-sys-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #444;
          border: 1px solid #222;
          padding: 2px 6px;
          letter-spacing: 0.05em;
        }

        .auth-modal-error {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255, 77, 0, 0.08);
          border: 1px solid rgba(255, 77, 0, 0.25);
          font-size: 12px;
          color: rgba(255, 160, 100, 0.9);
          line-height: 1.5;
          text-align: left;
        }

        .auth-modal-action-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          margin-top: 16px;
        }

        .auth-modal-btn {
          width: 100%;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border: none;
          font-family: 'Pretendard', -apple-system, system-ui, sans-serif;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s, filter 0.2s;
        }
        .auth-modal-btn:disabled { cursor: not-allowed; opacity: 0.65; }
        .auth-modal-btn:active   { transform: scale(0.98); }
        .auth-modal-btn:not(:disabled):hover { filter: brightness(0.95); }

        .auth-modal-btn-google {
          background-color: #fff;
          color: #000;
        }
        .auth-modal-btn-kakao {
          background-color: #FEE500;
          color: #181600;
        }

        .auth-modal-btn-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .auth-modal-footer { text-align: center; }

        .auth-modal-terms {
          font-size: 12px;
          color: #888;
          line-height: 1.5;
        }

        .auth-modal-terms-link {
          color: #888;
          text-decoration: none;
          border-bottom: 1px solid #222;
          transition: color 0.2s, border-color 0.2s;
          padding-bottom: 1px;
        }
        .auth-modal-terms-link:hover {
          color: #FF4D00;
          border-bottom-color: #FF4D00;
        }

        /* ── Mobile ── */
        @media (max-width: 600px) {
          .auth-modal-backdrop {
            align-items: flex-end;
            padding: 0;
          }
          .auth-modal-container {
            width: 100%;
            max-width: 100%;
            border-bottom: none;
            animation: authModalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .auth-modal-container.auth-modal-slide-out {
            animation: authModalSlideOut 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .auth-modal-bracket-bl,
          .auth-modal-bracket-br { display: none; }
          .auth-modal-inner {
            padding: 24px 24px 40px;
          }
          @keyframes authModalSlideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
