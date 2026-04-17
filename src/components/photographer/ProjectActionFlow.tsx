"use client";

import { Check, Lock } from "lucide-react";

export interface FlowStep {
  label: string;
  desc: string;
  icon?: React.ReactNode;
  state: "done" | "active" | "current" | "locked";
  badge?: string | null;
  onClick?: () => void;
}

interface Props {
  steps: FlowStep[];
  /**
   * full   — 큰 카드 (프로젝트 상세 ACTION_FLOW)
   * compact — 작은 패널 (사이드바 OPERATION_NODES)
   */
  variant?: "full" | "compact";
}

const ORANGE     = "#FF4D00";
const GREEN      = "#00E676";
const MUTED      = "#555555";
const BORDER_DIM = "#222222";
const MONO       = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', monospace";

const KEYFRAMES = `
  @keyframes paf-scan {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  @keyframes paf-ping {
    0%       { transform: scale(1); opacity: 0.8; }
    50%      { transform: scale(1.9); opacity: 0; }
    100%     { transform: scale(1); opacity: 0; }
  }
  @keyframes dot-blink {
    0%, 20%   { opacity: 0; }
    40%       { opacity: 1; }
    60%, 100% { opacity: 0; }
  }
  .paf-scan { animation: paf-scan 4s linear infinite; }
  .paf-ping { animation: paf-ping 1.6s ease-out infinite; }
  .dot-1    { animation: dot-blink 1.5s linear infinite; }
  .dot-2    { animation: dot-blink 1.5s linear 0.2s infinite; }
  .dot-3    { animation: dot-blink 1.5s linear 0.4s infinite; }

  .paf-done-step { cursor: default; }
  .paf-done-step[data-clickable="true"] { cursor: pointer; }
  .paf-done-step:hover .paf-ind  { border-color: ${ORANGE} !important; }
  .paf-done-step:hover .paf-num  { color: ${ORANGE} !important; }
  .paf-done-step:hover .paf-lbl  { color: ${ORANGE} !important; }
`;

export function ProjectActionFlow({ steps, variant = "full" }: Props) {
  const isCompact = variant === "compact";

  // Indicator square size
  const indSize = isCompact ? 22 : 28;
  // Number column width
  const numW    = isCompact ? 16 : 20;
  // Gap between num and indicator
  const rowGap  = isCompact ? 10 : 12;
  // Connector center alignment: numW + rowGap + indSize/2
  const connML  = numW + rowGap + indSize / 2;
  // Connector height
  const connH   = isCompact ? 10 : 14;

  const stepsContent = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {steps.map((step, idx) => {
        const isDone    = step.state === "done";
        const isActive  = step.state === "active";
        const isCurrent = step.state === "current";
        const isLocked  = step.state === "locked";
        const isLast    = idx === steps.length - 1;
        const num       = String(idx + 1).padStart(2, "0");

        const indBorderColor = isDone
          ? GREEN
          : isActive || isCurrent
          ? ORANGE
          : BORDER_DIM;
        const indBg = isCurrent ? "#1a0800" : "transparent";
        const connColor = isDone ? ORANGE : BORDER_DIM;

        return (
          <div
            key={step.label}
            className={isDone ? "paf-done-step" : undefined}
            data-clickable={isDone && !!step.onClick ? "true" : undefined}
            style={{ cursor: step.onClick && !isDone ? "pointer" : undefined }}
            onClick={step.onClick}
          >
            {/* Step row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: rowGap,
                padding: isCompact ? "5px 0" : "7px 0",
                opacity: isLocked ? 0.45 : 1,
              }}
            >
              {/* Step number */}
              <div
                className="paf-num"
                style={{
                  fontFamily: MONO,
                  fontSize: isCompact ? 9 : 10,
                  color: isDone
                    ? GREEN
                    : isActive || isCurrent
                    ? ORANGE
                    : MUTED,
                  width: numW,
                  flexShrink: 0,
                  textAlign: "right",
                  lineHeight: 1,
                  transition: "color 0.15s",
                }}
              >
                {num}
              </div>

              {/* Indicator box */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                {/* Ping ring for active */}
                {isActive && (
                  <div
                    className="paf-ping"
                    style={{
                      position: "absolute",
                      inset: -3,
                      border: `1px solid ${ORANGE}`,
                      borderRadius: 4,
                      opacity: 0.5,
                      pointerEvents: "none",
                    }}
                  />
                )}
                <div
                  className="paf-ind"
                  style={{
                    width: indSize,
                    height: indSize,
                    borderRadius: 2,
                    border: `${isCurrent ? 2 : 1}px solid ${indBorderColor}`,
                    background: indBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    transition: "border-color 0.15s",
                  }}
                >
                  {isDone ? (
                    <Check size={isCompact ? 11 : 14} color="#fff" strokeWidth={2.5} />
                  ) : isLocked ? (
                    <Lock size={isCompact ? 10 : 13} color={MUTED} strokeWidth={2} />
                  ) : isCurrent ? (
                    <div
                      style={{
                        width: isCompact ? 8 : 10,
                        height: isCompact ? 8 : 10,
                        background: ORANGE,
                        borderRadius: 1,
                      }}
                    />
                  ) : isActive ? (
                    <div
                      style={{
                        width: isCompact ? 6 : 8,
                        height: isCompact ? 6 : 8,
                        borderRadius: "50%",
                        background: ORANGE,
                      }}
                    />
                  ) : null}
                </div>
              </div>

              {/* Label + desc */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="paf-lbl"
                  style={{
                    fontFamily: MONO,
                    fontSize: isCompact ? 12 : 13,
                    fontWeight: isCurrent || isActive ? 700 : 500,
                    color: isLocked ? MUTED : isDone ? "#aaaaaa" : "#ffffff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                    transition: "color 0.15s",
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: isCompact ? 9 : 10,
                    color: isLocked
                      ? `${MUTED}66`
                      : isCurrent
                      ? `${ORANGE}99`
                      : isActive
                      ? `${ORANGE}66`
                      : isDone
                      ? "#333333"
                      : "#444444",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.desc}
                </div>
              </div>

              {/* Right badge / state indicator */}
              {step.badge ? (
                <span
                  style={{
                    padding: "2px 5px",
                    background: "rgba(46,213,115,0.1)",
                    border: "1px solid rgba(46,213,115,0.3)",
                    fontFamily: MONO,
                    fontSize: 8,
                    color: "#2ed573",
                    flexShrink: 0,
                    letterSpacing: "0.05em",
                  }}
                >
                  {step.badge}
                </span>
              ) : isCurrent ? (
                <div
                  style={{
                    background: ORANGE,
                    padding: isCompact ? "2px 6px" : "3px 8px",
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: isCompact ? 8 : 9,
                      color: "#000",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                    }}
                  >
                    ► YOU ARE HERE
                  </span>
                </div>
              ) : isActive ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: isCompact ? 8 : 9,
                      color: ORANGE,
                      letterSpacing: "0.02em",
                    }}
                  >
                    IN_PROGRESS
                    <span className="dot-1" style={{ display: "inline-block" }}>.</span>
                    <span className="dot-2" style={{ display: "inline-block" }}>.</span>
                    <span className="dot-3" style={{ display: "inline-block" }}>.</span>
                  </span>
                  <span
                    style={{
                      padding: "1px 4px",
                      background: "rgba(255,77,0,0.15)",
                      border: `1px solid rgba(255,77,0,0.3)`,
                      fontFamily: MONO,
                      fontSize: 7,
                      color: ORANGE,
                      letterSpacing: "0.05em",
                    }}
                  >
                    LIVE
                  </span>
                </div>
              ) : isLocked ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: isCompact ? 8 : 9,
                    color: `${MUTED}66`,
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}
                >
                  READ_ONLY
                </span>
              ) : null}
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                style={{
                  width: 1,
                  height: connH,
                  marginLeft: connML,
                  background: connColor,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Full variant: no outer container ──
  if (!isCompact) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
        {stepsContent}
      </>
    );
  }

  // ── Compact variant: tech-grid panel container ──
  const bracketPx = 8;
  const bracketBorder = `2px solid ${ORANGE}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        style={{
          position: "relative",
          background: "#030303",
          backgroundImage: [
            "linear-gradient(rgba(34,34,34,0.5) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(34,34,34,0.5) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "20px 20px",
          border: `1px solid ${BORDER_DIM}`,
          overflow: "hidden",
        }}
      >
        {/* Corner brackets */}
        <div style={{ position: "absolute", top: 0, left: 0, width: bracketPx, height: bracketPx, borderTop: bracketBorder, borderLeft: bracketBorder, zIndex: 3 }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: bracketPx, height: bracketPx, borderTop: bracketBorder, borderRight: bracketBorder, zIndex: 3 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: bracketPx, height: bracketPx, borderBottom: bracketBorder, borderLeft: bracketBorder, zIndex: 3 }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: bracketPx, height: bracketPx, borderBottom: bracketBorder, borderRight: bracketBorder, zIndex: 3 }} />

        {/* Scanline animation */}
        <div
          className="paf-scan"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(to bottom, transparent, rgba(255,77,0,0.025), transparent)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        {/* Header */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: `1px solid ${BORDER_DIM}`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 8,
                color: ORANGE,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                lineHeight: 1.4,
              }}
            >
              SYS::PIPELINE
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#888888",
                letterSpacing: "0.04em",
                lineHeight: 1.4,
              }}
            >
              Project Action Flow
            </div>
          </div>
          <div
            style={{
              padding: "2px 6px",
              border: `1px solid ${BORDER_DIM}`,
              fontFamily: MONO,
              fontSize: 8,
              color: MUTED,
              letterSpacing: "0.08em",
            }}
          >
            V.{steps.length}
          </div>
        </div>

        {/* Steps area */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "10px 12px",
            paddingBottom: 22,
          }}
        >
          {stepsContent}
        </div>

        {/* Bottom fade gradient */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 22,
            background: "linear-gradient(to top, #030303, transparent)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      </div>
    </>
  );
}
