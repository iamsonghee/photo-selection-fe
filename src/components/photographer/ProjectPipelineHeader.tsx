"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getStatusLabel } from "@/lib/project-status";
import type { Project } from "@/types";

const ACCENT = "#FF5A1F";
const BORDER = "#1f1f1f";
const BORDER_MID = "#2a2a2a";
export const PIPELINE_HEADER_H = 56;
const HEADER_PAD_X = 24;
const HEADER_BACK = "#888888";
const SURFACE_2 = "#0a0a0a";
const MONO = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif";
const TEXT_MUTED = "#5c5c5c";
const TEXT_BRIGHT = "#ffffff";


const techLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.63rem",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
};

export type ProjectPipelineActiveStep = 0 | 1 | 2 | 3 | 4;

type Props = {
  projectId: string;
  project: Pick<Project, "status" | "displayId" | "name">;
  activeStepIndex?: ProjectPipelineActiveStep;
};

export function ProjectPipelineHeader({ projectId, project, activeStepIndex }: Props) {
  const router = useRouter();
  const idShort = (project.displayId ?? projectId).replace(/^PRJ-/i, "").slice(0, 12);
  const linkActive = project.status !== "preparing";

  return (
    <nav
      style={{
        minHeight: PIPELINE_HEADER_H,
        borderBottom: `1px solid ${BORDER_MID}`,
        background: "rgba(5, 5, 5, 0.8)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        padding: `0 ${HEADER_PAD_X}px`,
        paddingTop: "env(safe-area-inset-top, 0px)",
        zIndex: 100,
        flexShrink: 0,
        position: "sticky",
        top: 0,
      }}
    >
      <button
        type="button"
        onClick={() => router.push(`/photographer/projects/${projectId}`)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: HEADER_BACK,
          padding: 0,
          marginRight: 16,
          flexShrink: 0,
          fontFamily: MONO,
          fontSize: 12,
        }}
      >
        <ChevronLeft size={12} strokeWidth={2} color={HEADER_BACK} />
        뒤로가기
      </button>

      <div style={{ flex: 1 }} />
      {activeStepIndex !== undefined && (
        <span style={{ ...techLabel, color: TEXT_BRIGHT, flexShrink: 0, marginRight: 12 }}>
          STEP <span style={{ color: ACCENT }}>{String(Math.max(0, Math.min(4, activeStepIndex)) + 1).padStart(2, "0")}/05</span>
        </span>
      )}
      <span
        style={{
          ...techLabel,
          color: TEXT_MUTED,
          flexShrink: 0,
          marginRight: 12,
          maxWidth: 140,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        STATUS: <span style={{ color: ACCENT }}>{getStatusLabel(project.status)}</span>
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: SURFACE_2,
          border: `1px solid ${BORDER}`,
          padding: "6px 14px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            border: `1px solid ${linkActive ? "#22c55e" : "#444"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {linkActive ? (
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px rgba(34,197,94,0.6)",
              }}
            />
          ) : null}
        </div>
        <span style={{ ...techLabel, color: TEXT_BRIGHT, fontSize: "0.58rem" }}>
          {idShort.toUpperCase()} //{" "}
          <span style={{ color: linkActive ? "#22c55e" : TEXT_MUTED, fontWeight: 700 }}>
            {linkActive ? "LINK_ACTIVE" : "LINK_INACTIVE"}
          </span>
        </span>
      </div>
    </nav>
  );
}
