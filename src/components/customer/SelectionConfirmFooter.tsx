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
  metaText,
  showProgress = true,
  mobileGallery = false,
  attentionKey = 0,
  theme = "workspace",
  notice,
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
  /** 안내 문구를 직접 지정한다. 기본 문구는 셀렉 기준("사진을 N장 더 골라주세요")이라
   * 같은 모양을 쓰되 말만 다른 화면(보정본 검토)에서 이 값으로 갈아 끼운다. */
  metaText?: string;
  /** 진행바 표시 여부. 기본 true.
   * 격자/목록에서는 "몇 장 했나"가 그 화면의 유일한 지표라 진행바가 값을 한다.
   * 단일 사진 상세(셀렉 뷰어·보정본 검토)는 헤더가 같은 수를 더 자세히 말하고 있고,
   * 필름스트립 위 위치 트랙과 같은 두께·같은 폭의 가로바가 두 겹으로 겹쳐 뜻이 섞인다. */
  showProgress?: boolean;
  /** 고객 모바일 갤러리(Figma #55882) 전용 레이아웃 */
  mobileGallery?: boolean;
  /** 선택 제한 피드백을 다시 재생하기 위한 증가 키 */
  attentionKey?: number;
  /** "workspace"(기본, Dark Photo Workspace 토큰) | "customerLight"(고객 라이트 톤 — 폭에 상관없이 적용).
   * viewer/review 등 다른 호출부의 기본 동작을 바꾸지 않기 위해 opt-in으로 둔다. */
  theme?: "workspace" | "customerLight";
  /** 최종 전달 전이라는 점을 버튼과 함께 안내한다. */
  notice?: string;
}) {
  const progressPct = N > 0 ? Math.min(Math.round((Y / N) * 100), 100) : 0;
  const remaining = N - Y;
  const isLight = theme === "customerLight";

  return (
    <>
      <style>{`
        .ac-confirm-footer-btn {
          background: var(--accent); color: #000; font-weight: 900;
          font-family: inherit; transition: all 0.3s ease;
          /* 예전에는 오른쪽 아래를 자른 노치(clip-path)였는데, 같은 화면의 나머지가 전부
           * 라운드(판단 버튼 12px, pill 999px)라 이 버튼만 튀었다. 라이트 톤이 이미 radius로
           * 정리돼 있어 다크도 같은 모양으로 맞춘다. */
          border-radius: 10px;
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px;
        }
        .ac-confirm-footer-btn:disabled {
          opacity: 0.4; cursor: not-allowed;
          background: var(--disabled-foreground);
        }
        .ac-confirm-footer-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(var(--accent-rgb), 0.3);
        }
        .ac-confirm-footer-attention .ac-confirm-footer-progress-label { animation: ac-limit-label 360ms ease-out; }
        .ac-confirm-footer-attention .ac-confirm-footer-track { animation: ac-limit-track 360ms ease-out; }
        @keyframes ac-limit-label { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-3px); color: #ff4d00; } 60% { transform: translateX(3px); color: #ff4d00; } }
        @keyframes ac-limit-track { 0%, 100% { box-shadow: none; } 40% { box-shadow: 0 0 0 3px rgba(255,77,0,.24); } }

        /* 고객 라이트 톤 — 폭에 상관없이 적용(768px 이상 갤러리 하단바 재스킨의 핵심).
         * <767px에서는 아래 .ac-confirm-footer-gallery 규칙이 layout까지 추가로 덮어써 기존 모바일 모습을 그대로 유지한다. */
        .ac-confirm-footer-light .ac-confirm-footer-btn {
          background: var(--customer-control);
          color: #fff;
          border-radius: 8px;
        }
        .ac-confirm-footer-light .ac-confirm-footer-btn:disabled {
          background: var(--customer-divider);
          color: #aab0b8;
        }
        .ac-confirm-footer-light .ac-confirm-footer-btn:not(:disabled):hover {
          box-shadow: none;
          transform: none;
        }

        @media (max-width: 767px) {
          .ac-confirm-footer-inner { height: 60px !important; padding: 0 14px !important; gap: 12px !important; }
          /* 진행바가 빠지면 좁은 화면에서는 왼쪽 절반이 통째로 빈다 — 그 폭을 버튼에 준다 */
          .ac-confirm-footer-noprogress .ac-confirm-footer-action { width: 100%; }
          .ac-confirm-footer-noprogress .ac-confirm-footer-btn { width: 100%; justify-content: center; }
          /* 버튼이 가로를 다 쓰면 안내 문구가 들어갈 자리가 없다 — 좁은 화면에서는 버튼 라벨로 충분하다 */
          .ac-confirm-footer-noprogress .ac-confirm-footer-meta { display: none; }
          .ac-confirm-footer-meta { max-width: 108px; }
          .ac-confirm-footer-meta p { font-size: 9px !important; white-space: normal !important; line-height: 1.3 !important; }
          .ac-confirm-footer-progress { gap: 4px !important; }
          .ac-confirm-footer-progress-label { font-size: 9px !important; }
          .ac-confirm-footer-btn { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
          .ac-confirm-footer.ac-confirm-footer-gallery {
            background: #fff !important;
            border-top: 1px solid #dde1e4 !important;
            backdrop-filter: none !important;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-inner {
            box-sizing: border-box;
            height: calc(80px + env(safe-area-inset-bottom)) !important;
            max-width: none !important;
            padding: 8px 20px calc(12px + env(safe-area-inset-bottom)) !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            grid-template-rows: 4px 48px !important;
            gap: 8px !important;
            background: #fff;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-progress { gap: 0 !important; }
          .ac-confirm-footer-gallery .ac-confirm-footer-progress-label {
            display: none !important;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-progress-label span:first-child { color: #26282c !important; }
          .ac-confirm-footer-gallery .ac-confirm-footer-progress-label span:last-child { color: #26282c !important; }
          .ac-confirm-footer-gallery .ac-confirm-footer-current { color: #ff4d00; font-weight: 700; }
          .ac-confirm-footer-gallery .ac-confirm-footer-track {
            height: 4px !important;
            border-radius: 999px;
            background: #ffe1d4 !important;
            overflow: hidden;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-fill { background: #ff4d00 !important; border-radius: 999px; }
          .ac-confirm-footer-gallery .ac-confirm-footer-action { width: 100%; }
          .ac-confirm-footer-gallery .ac-confirm-footer-meta { display: none; }
          .ac-confirm-footer-gallery .ac-confirm-footer-btn {
            width: 100%; height: 48px !important; padding: 0 20px !important;
            justify-content: center; border-radius: 8px; clip-path: none;
            background: #26282c; color: #fff; font-size: 15px !important;
            font-weight: 700; letter-spacing: -0.3px;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-btn:disabled {
            opacity: 1; background: #dde1e4; color: #aab0b8;
          }
          .ac-confirm-footer-gallery .ac-confirm-footer-btn svg { display: none; }
        }
      `}</style>

      <footer
        className={`ac-confirm-footer${mobileGallery ? " ac-confirm-footer-gallery" : ""}${isLight ? " ac-confirm-footer-light" : ""}${showProgress ? "" : " ac-confirm-footer-noprogress"}`}
        style={{
          position,
          bottom: position === "fixed" ? 0 : undefined,
          left: position === "fixed" ? 0 : undefined,
          right: position === "fixed" ? 0 : undefined,
          zIndex,
          background: isLight ? "var(--customer-canvas)" : "var(--background)",
          /* 다크 톤의 상단선은 원래 주황(accent 30%)이었다 — 주황은 선택/제출의 색인데 구분선까지
           * 주황이면 하단에 뜻 없는 주황 획이 하나 더 생긴다(위치 트랙·진행바와 같은 문제). 중립선으로 둔다. */
          borderTop: isLight
            ? "1px solid var(--customer-divider)"
            : "1px solid rgba(255,255,255,0.08)",
          backdropFilter: isLight ? "none" : "blur(12px)",
        }}
      >
        {notice && <p style={{margin:0,padding:"8px 20px 0",textAlign:"center",fontSize:12,color:isLight ? "var(--customer-ink-secondary)" : "var(--muted-foreground)"}}>{notice}</p>}
        <div
          className="ac-confirm-footer-inner"
          style={{
            maxWidth: "var(--customer-gallery-max-width, 1440px)",
            margin: "0 auto",
            height: 72,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          {showProgress && (
          <div
            key={`selection-progress-${attentionKey}`}
            className={`ac-confirm-footer-progress${attentionKey > 0 ? " ac-confirm-footer-attention" : ""}`}
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
              <span style={{ color: isLight ? "var(--customer-ink-secondary)" : "var(--muted-foreground)" }}>{progressLabel}</span>
              <span style={{ color: remaining < 0 ? "#ef4444" : "var(--accent)" }}>
                {mobileGallery ? <><span className="ac-confirm-footer-current">{Y}</span> / {N}</> : `${Y} / ${N}장`}
              </span>
            </div>
            <div
              className="ac-confirm-footer-track"
              role="progressbar"
              aria-label={`${progressLabel}: ${N}장 중 ${Y}장`}
              aria-valuemin={0}
              aria-valuemax={N}
              aria-valuenow={Math.min(Y, N)}
              style={{ width: "100%", height: 3, background: isLight ? "#ffe1d4" : "var(--surface)" }}
            >
              <div
                className="ac-confirm-footer-fill"
                style={{
                  height: "100%",
                  background: remaining < 0 ? "#ef4444" : "var(--accent)",
                  width: `${progressPct}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
          )}

          {/* 진행바를 뺐을 때도 버튼은 오른쪽 끝에 남는다(space-between의 유일한 자식이 되면 왼쪽으로 붙는다) */}
          <div className="ac-confirm-footer-action" style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0, marginLeft: showProgress ? undefined : "auto" }}>
            {showMeta && (
              <div className="ac-confirm-footer-meta" style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    color: remaining === 0 ? "var(--accent)" : remaining < 0 ? "#ef4444" : isLight ? "var(--customer-ink-secondary)" : "var(--subtle-foreground)",
                    margin: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {metaText ??
                    (remaining > 0
                      ? `사진을 ${remaining}장 더 골라주세요`
                      : remaining === 0
                        ? "모두 선택했어요! 의뢰 버튼을 눌러주세요"
                        : `${Math.abs(remaining)}장 초과됐어요`)}
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
