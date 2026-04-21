import { Upload, ListChecks, PenLine, Flag } from "lucide-react";
import type { FlowStep } from "@/components/photographer/ProjectActionFlow";
import type { Project, ProjectStatus } from "@/types";

export type FlowPageKey =
  | "upload"
  | "results"
  | "upload-versions"
  | "upload-versions-v2";

/**
 * v2 진입(editing_v2 이후)부터 5단계, 그 전은 4단계.
 */
function resolveStepCount(
  status: ProjectStatus,
  allowRevision: boolean
): 4 | 5 {
  if (!allowRevision) return 4;
  const v2Statuses: ProjectStatus[] = ["editing_v2", "reviewing_v2", "delivered"];
  return v2Statuses.includes(status) ? 5 : 4;
}

/**
 * pageKey가 있는 단계가 이미 완료된 상태인지 판단.
 * upload-versions: reviewing_v1은 아직 진행 중(고객 검토 중)이므로 완료 아님.
 */
function isPageCompleted(stepPageKey: FlowPageKey, status: ProjectStatus): boolean {
  switch (stepPageKey) {
    case "upload":
      return status !== "preparing";
    case "results":
      return !["preparing", "selecting"].includes(status);
    case "upload-versions":
      return ["editing_v2", "reviewing_v2", "delivered"].includes(status);
    case "upload-versions-v2":
      return status === "delivered";
  }
}

function isPageActive(stepPageKey: FlowPageKey, status: ProjectStatus): boolean {
  switch (stepPageKey) {
    case "upload":
      return status === "preparing";
    case "results":
      return status === "selecting";
    case "upload-versions":
      return ["confirmed", "editing", "reviewing_v1"].includes(status);
    case "upload-versions-v2":
      return ["editing_v2", "reviewing_v2"].includes(status);
  }
}

type StepDef = {
  label: string;
  desc: string;
  icon: React.ReactNode;
  pageKey?: FlowPageKey;
  onClick?: () => void;
  badge?: string | null;
};

export function buildCompactSteps(
  pageKey: FlowPageKey,
  project: Project,
  handlers: {
    onUpload: () => void;
    onResults: () => void;
    onVersions: () => void;
    onVersionsV2: () => void;
  }
): FlowStep[] {
  const { status, allowRevision } = project;
  const stepCount = resolveStepCount(status, allowRevision);
  const isSelecting = status === "selecting";

  const versionDesc =
    status === "reviewing_v1" ? "고객 검토 중"
    : isPageCompleted("upload-versions", status) ? "완료"
    : ["confirmed", "editing"].includes(status) ? "업로드 진행 중"
    : "이전 단계 완료 후 가능";

  const v2Desc =
    status === "delivered" ? "완료"
    : status === "reviewing_v2" ? "고객 검토 중"
    : status === "editing_v2" ? "업로드 진행 중"
    : "이전 단계 완료 후 가능";

  const steps4: StepDef[] = [
    {
      label: "원본 업로드",
      desc: status === "preparing" ? "진행 중" : "완료",
      icon: <Upload size={14} color="#FF4D00" />,
      pageKey: "upload",
      onClick: handlers.onUpload,
    },
    {
      label: "셀렉 확인",
      desc: isSelecting ? "고객 셀렉 중"
        : !["preparing", "selecting"].includes(status) ? "완료"
        : "이전 단계 완료 후 가능",
      icon: <ListChecks size={14} color="#FF4D00" />,
      pageKey: "results",
      onClick: handlers.onResults,
      badge: isSelecting ? "LIVE" : null,
    },
    {
      label: "보정본",
      desc: versionDesc,
      icon: <PenLine size={14} color="#FF4D00" />,
      pageKey: "upload-versions",
      onClick: handlers.onVersions,
      badge: status === "reviewing_v1" ? "LIVE" : null,
    },
    {
      label: "납품 완료",
      desc: status === "delivered" ? "완료" : "최종 목표",
      icon: <Flag size={14} color="#FF4D00" />,
    },
  ];

  const steps5: StepDef[] = [
    steps4[0],
    steps4[1],
    {
      label: "보정본 v1",
      desc: "완료",
      icon: <PenLine size={14} color="#FF4D00" />,
      pageKey: "upload-versions",
      onClick: handlers.onVersions,
    },
    {
      label: "재보정 v2",
      desc: v2Desc,
      icon: <PenLine size={14} color="#FF4D00" />,
      pageKey: "upload-versions-v2",
      onClick: handlers.onVersionsV2,
      badge: status === "editing_v2" ? "LIVE" : null,
    },
    steps4[3],
  ];

  const allSteps = stepCount === 5 ? steps5 : steps4;

  return allSteps.map((step) => {
    let state: "done" | "active" | "current" | "locked";

    if (step.pageKey) {
      if (step.pageKey === pageKey) {
        state = "current";
      } else if (isPageCompleted(step.pageKey, status)) {
        state = "done";
      } else if (isPageActive(step.pageKey, status)) {
        state = "active";
      } else {
        state = "locked";
      }
    } else {
      state = status === "delivered" ? "done" : "locked";
    }

    return {
      label: step.label,
      desc: step.desc,
      icon: step.icon,
      state,
      badge: step.badge ?? undefined,
      onClick: state !== "locked" && state !== "current" ? step.onClick : undefined,
    };
  });
}
