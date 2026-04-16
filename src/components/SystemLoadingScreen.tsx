"use client";

import { useEffect, useRef } from "react";

const LOG_LINES = [
  { ts: "[SYS:BOOT:0.865]", msg: "Checking local storage integrity..." },
  { ts: "[SYS:BOOT:1.265]", msg: "Initializing UI components..." },
  { ts: "[SYS:BOOT:2.065]", msg: "Connection established." },
  { ts: "[SYS:BOOT:2.465]", msg: "Finalizing layout rendering..." },
];

export function SystemLoadingScreen() {
  const clockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let rafId: number;
    function tick() {
      const now = new Date();
      const t =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0") +
        ":" +
        now.getSeconds().toString().padStart(2, "0") +
        ":" +
        now.getMilliseconds().toString().padStart(3, "0");
      if (clockRef.current) clockRef.current.textContent = t;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <>
      <style>{`
        @keyframes sls-scanline {
          0%   { top: -150px; }
          100% { top: 100vh; }
        }
        @keyframes sls-breathe {
          0%, 100% {
            box-shadow: 0 0 0px rgba(255,77,0,0);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 40px rgba(255,77,0,0.4);
            transform: scale(1.05);
          }
        }
        @keyframes sls-pulse {
          0%   { opacity: 0.2; }
          100% { opacity: 1; }
        }
        .sls-scanline {
          width: 100%;
          height: 150px;
          position: absolute;
          top: -150px;
          left: 0;
          background: linear-gradient(to bottom, rgba(255,77,0,0) 0%, rgba(255,77,0,0.03) 50%, rgba(255,77,0,0) 100%);
          animation: sls-scanline 8s linear infinite;
          pointer-events: none;
          z-index: 1;
        }
        .sls-logo {
          width: 64px;
          height: 64px;
          background-color: #FF4D00;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 900;
          font-size: 32px;
          animation: sls-breathe 4s ease-in-out infinite;
        }
        .sls-pulse {
          width: 6px;
          height: 6px;
          background-color: #FF4D00;
          border-radius: 50%;
          animation: sls-pulse 2s infinite alternate;
          flex-shrink: 0;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#030303",
          color: "#E8E8E8",
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 9999,
        }}
      >
        {/* Grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            backgroundPosition: "center center",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Scanline */}
        <div className="sls-scanline" />

        {/* Corner brackets */}
        {/* TL */}
        <div style={{ position: "absolute", top: 32, left: 32, width: 32, height: 32, borderTop: "2px solid #222", borderLeft: "2px solid #222", zIndex: 10, pointerEvents: "none" }} />
        {/* TR */}
        <div style={{ position: "absolute", top: 32, right: 32, width: 32, height: 32, borderTop: "2px solid #222", borderRight: "2px solid #222", zIndex: 10, pointerEvents: "none" }} />
        {/* BL */}
        <div style={{ position: "absolute", bottom: 32, left: 32, width: 32, height: 32, borderBottom: "2px solid #222", borderLeft: "2px solid #222", zIndex: 10, pointerEvents: "none" }} />
        {/* BR */}
        <div style={{ position: "absolute", bottom: 32, right: 32, width: 32, height: 32, borderBottom: "2px solid #222", borderRight: "2px solid #222", zIndex: 10, pointerEvents: "none" }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {/* Status badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid #222", padding: "6px 12px" }}>
              <div className="sls-pulse" />
              <span style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
                SYS :: STANDBY
              </span>
            </div>

            {/* Clock */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#666", marginBottom: 4 }}>
                LOCAL_TIME
              </div>
              <span ref={clockRef} style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 14, opacity: 0.6 }}>
                00:00:00:000
              </span>
            </div>
          </div>

          {/* Center logo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <div className="sls-logo">A</div>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#666", marginTop: 32, opacity: 0.4 }}>
              INITIALIZING ENVIRONMENT...
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>

            {/* Terminal log */}
            <div style={{ width: 400, height: 100, padding: 12, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "#666" }}>
                {LOG_LINES.map((line, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, opacity: 0.3 + i * 0.2 }}>
                    <span style={{ flexShrink: 0 }}>{line.ts}</span>
                    <span>{line.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* System info */}
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#666" }}>
                TARGET_ENV: <span style={{ color: "#E8E8E8" }}>PRODUCTION</span>
              </div>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#666" }}>
                A-CUT_VERSION: <span style={{ color: "#E8E8E8" }}>1.2.0-CORE</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#444" }}>SECURE</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
