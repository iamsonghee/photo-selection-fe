"use client";

import type { ProjectStatus } from "@/types";

type StepState = "done" | "current" | "pending" | "all-done";

const STEP_LABELS = ["업로드", "셀렉", "보정·검토", "완료"];

function getSteps(status: ProjectStatus): StepState[] {
  switch (status) {
    case "preparing":    return ["current",  "pending",  "pending",  "pending"];
    case "selecting":    return ["done",     "current",  "pending",  "pending"];
    case "confirmed":
    case "editing":
    case "reviewing_v1":
    case "editing_v2":
    case "reviewing_v2": return ["done",     "done",     "current",  "pending"];
    case "delivered":    return ["all-done", "all-done", "all-done", "all-done"];
  }
}

type Props = {
  status: ProjectStatus;
  photoCount?: number;
  requiredCount?: number;
  className?: string;
};

export function ProjectProgressBar({ status, className = "" }: Props) {
  const steps = getSteps(status);

  return (
    <div className={className} style={{ display: "flex", gap: 0, marginBottom: 8, width: "100%" }}>
      {steps.map((state, i) => {
        // ── dot ──
        const dotSize   = state === "current" ? 7 : 5;
        const dotColor  =
          state === "all-done" ? "rgba(46,213,115,0.8)" :
          state === "current"  ? "#669bbc" :
          state === "done"     ? "#4a7a8e" : "#3a5a6e";
        const dotShadow =
          state === "current" ? "0 0 0 2px rgba(102,155,188,0.15)" : "none";

        // ── bar fill ──
        const fillColor =
          state === "all-done" ? "rgba(46,213,115,0.6)" :
          state === "done"     ? "#3a5a6e" :
          state === "current"  ? "#669bbc" : "transparent";

        // ── label ──
        const labelColor  =
          state === "current"                       ? "#e8eef2" :
          state === "done" || state === "all-done"  ? "#7a9ab0" : "#3a5a6e";
        const labelWeight = state === "current" ? 500 : 400;

        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            {/* 단계 텍스트 */}
            <span style={{
              fontSize: 9,
              color: labelColor,
              fontWeight: labelWeight,
              whiteSpace: "nowrap",
            }}>
              {STEP_LABELS[i]}
            </span>

            {/* dot */}
            <div style={{
              width: dotSize,
              height: dotSize,
              borderRadius: "50%",
              backgroundColor: dotColor,
              boxShadow: dotShadow,
              flexShrink: 0,
            }} />

            {/* bar */}
            <div style={{
              width: "100%",
              height: 2,
              borderRadius: 1,
              backgroundColor: "#1a3347",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                borderRadius: 1,
                backgroundColor: fillColor,
                width: state === "pending" ? "0%" : "100%",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
