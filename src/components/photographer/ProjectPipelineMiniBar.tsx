"use client";

import type { ProjectStatus } from "@/types";

const ACCENT = "#FF4D00";
const GREEN  = "#22C55E";

const PIPELINE_STEPS = ["업로드", "셀렉", "보정", "재보정", "완료"];

type PipelineConfig = {
  completedSteps: number;
  activeStep: number;
  activeColor: string;
  stepLabel: string;
};

const STATUS_PIPELINE: Record<ProjectStatus, PipelineConfig> = {
  preparing:    { completedSteps: 0, activeStep: 0,  activeColor: ACCENT, stepLabel: "1/5 업로드" },
  selecting:    { completedSteps: 1, activeStep: 1,  activeColor: ACCENT, stepLabel: "2/5 셀렉" },
  confirmed:    { completedSteps: 2, activeStep: 2,  activeColor: ACCENT, stepLabel: "3/5 보정" },
  editing:      { completedSteps: 2, activeStep: 2,  activeColor: ACCENT, stepLabel: "3/5 보정" },
  reviewing_v1: { completedSteps: 3, activeStep: -1, activeColor: ACCENT, stepLabel: "보정 완료" },
  editing_v2:   { completedSteps: 3, activeStep: 3,  activeColor: ACCENT, stepLabel: "4/5 재보정" },
  reviewing_v2: { completedSteps: 4, activeStep: -1, activeColor: ACCENT, stepLabel: "재보정 완료" },
  delivered:    { completedSteps: 5, activeStep: -1, activeColor: GREEN,  stepLabel: "5/5 완료" },
};

export function getPipelineStepLabel(status: ProjectStatus): string {
  return STATUS_PIPELINE[status].stepLabel;
}

interface Props {
  status: ProjectStatus;
  /** "card" = 100px fixed width (dashboard), "full" = 100% width (project list card) */
  variant?: "card" | "full";
}

export function ProjectPipelineMiniBar({ status, variant = "card" }: Props) {
  const { completedSteps, activeStep, activeColor } = STATUS_PIPELINE[status];
  const allDone     = completedSteps === 5;
  const isPreparing = status === "preparing";

  return (
    <div
      style={{
        display: "flex",
        gap: variant === "full" ? 2 : 1,
        width: variant === "full" ? "100%" : 100,
        minWidth: variant === "full" ? 0 : undefined,
        height: 4,
        background: variant === "full" ? "#0a0a0a" : undefined,
        overflow: variant === "full" ? "hidden" : undefined,
      }}
    >
      {PIPELINE_STEPS.map((_, i) => {
        const isDone   = i < completedSteps;
        const isActive = i === activeStep;
        let bg      = "#1a1a1a";
        let opacity = 1;
        if (allDone) {
          bg = "#333";
        } else if (isDone) {
          bg = "#fff";
        } else if (isActive) {
          bg = activeColor;
          if (isPreparing) opacity = 0.4;
        }
        return <div key={i} style={{ flex: 1, height: "100%", background: bg, opacity }} />;
      })}
    </div>
  );
}
