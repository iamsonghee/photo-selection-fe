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

export function ProjectProgressBar({ status, photoCount, requiredCount, className = "" }: Props) {
  const steps = getSteps(status);
  // preparing 상태에서 업로드 진행률 (0~100%)
  const uploadPct = status === "preparing" && requiredCount && requiredCount > 0
    ? Math.min(100, Math.round(((photoCount ?? 0) / requiredCount) * 100))
    : null;

  return (
    <div className={className} style={{ display: "flex", gap: 0, marginBottom: 8, width: "100%" }}>
      {steps.map((state, i) => {
        // ── preparing 업로드 진행률 반영: step 0(업로드)이 current일 때 ──
        const isUploadStep = i === 0 && state === "current" && uploadPct !== null;
        // preparing 완료 시 dot 색상 변경 (photo_count >= required_count → orange 힌트)
        const isUploadDone = i === 0 && state === "current" && uploadPct !== null && uploadPct >= 100;

        // ── dot ──
        const dotSize   = state === "current" ? 7 : 5;
        const dotColor  =
          state === "all-done"  ? "rgba(46,213,115,0.8)" :
          isUploadDone          ? "#f5a623" :
          state === "current"   ? "#4f7eff" :
          state === "done"      ? "#52525b" : "#71717a";
        const dotShadow =
          isUploadDone          ? "0 0 0 2px rgba(245,166,35,0.2)" :
          state === "current"   ? "0 0 0 2px rgba(79,126,255,0.22)" : "none";

        // ── bar fill ──
        const fillColor =
          state === "all-done" ? "rgba(46,213,115,0.6)" :
          isUploadDone         ? "#f5a623" :
          state === "done"     ? "#52525b" :
          state === "current"  ? "#4f7eff" : "transparent";

        // 업로드 진행 중일 때 bar width
        const barWidth = isUploadStep
          ? `${uploadPct}%`
          : state === "pending" ? "0%" : "100%";

        // ── label ──
        const labelColor  =
          state === "current"                       ? "#fafafa" :
          state === "done" || state === "all-done"  ? "#a1a1aa" : "#71717a";
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
              backgroundColor: "#27272a",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                borderRadius: 1,
                backgroundColor: fillColor,
                width: barWidth,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
