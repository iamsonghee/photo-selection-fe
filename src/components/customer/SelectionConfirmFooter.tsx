"use client";

import React from "react";

type Position = "fixed" | "static";

export function SelectionConfirmFooter({
  Y,
  N,
  position = "fixed",
  disabled,
  onConfirm,
  zIndex = 50,
  progressLabel = "사진 선택",
  buttonLabel,
  showMeta = true,
}: {
  Y: number;
  N: number;
  position?: Position;
  disabled: boolean;
  onConfirm: () => void;
  zIndex?: number;
  /** 진행바 좌측 라벨. 기본값: "사진 선택" */
  progressLabel?: string;
  /** CTA 버튼 텍스트. 미입력 시 자동 생성 */
  buttonLabel?: string;
  /** 버튼 좌측 안내 문구 표시 여부. 기본 true */
  showMeta?: boolean;
}) {
  const progressPct = N > 0 ? Math.min(Math.round((Y / N) * 100), 100) : 0;
  const remaining = N - Y;

  return (
    <>
      <style>{`
        .ac-confirm-footer-btn {
          background: #FF4D00; color: #000; font-weight: 900;
          font-family: inherit; transition: all 0.3s ease;
          clip-path: polygon(0 0, 100% 0, 100% 65%, 88% 100%, 0 100%);
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px;
        }
        .ac-confirm-footer-btn:disabled {
          opacity: 0.4; cursor: not-allowed;
          background: #555;
        }
        .ac-confirm-footer-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(255,77,0,0.3);
        }

        @media (max-width: 767px) {
          .ac-confirm-footer-inner { height: 60px !important; padding: 0 14px !important; gap: 12px !important; }
          .ac-confirm-footer-meta { display: none !important; }
          .ac-confirm-footer-progress { gap: 4px !important; }
          .ac-confirm-footer-progress-label { font-size: 9px !important; }
          .ac-confirm-footer-btn { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
        }
      `}</style>

      <footer
        style={{
          position,
          bottom: position === "fixed" ? 0 : undefined,
          left: position === "fixed" ? 0 : undefined,
          right: position === "fixed" ? 0 : undefined,
          zIndex,
          background: "#000",
          borderTop: "1px solid rgba(255,77,0,0.3)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="ac-confirm-footer-inner"
          style={{
            maxWidth: 1800,
            margin: "0 auto",
            height: 72,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div
            className="ac-confirm-footer-progress"
            style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              className="ac-confirm-footer-progress-label"
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span style={{ color: "#888" }}>{progressLabel}</span>
              <span style={{ color: "#FF4D00" }}>
                {Y} / {N}장
              </span>
            </div>
            <div style={{ width: "100%", height: 3, background: "#111" }}>
              <div
                style={{
                  height: "100%",
                  background: "#FF4D00",
                  width: `${progressPct}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
            {showMeta && (
              <div className="ac-confirm-footer-meta" style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    color: remaining === 0 ? "#FF4D00" : "rgba(255,255,255,0.35)",
                    margin: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {remaining > 0
                    ? `사진을 ${remaining}장 더 골라주세요`
                    : remaining === 0
                      ? "모두 선택했어요! 의뢰 버튼을 눌러주세요"
                      : `${Math.abs(remaining)}장 초과됐어요`}
                </p>
              </div>
            )}
            <button
              type="button"
              className="ac-confirm-footer-btn"
              disabled={disabled}
              onClick={onConfirm}
            >
              <span>{buttonLabel ?? "보정 의뢰하기"}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}

