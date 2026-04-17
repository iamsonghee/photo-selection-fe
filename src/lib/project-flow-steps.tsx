import { Upload, ListChecks, PenLine, Eye, Flag } from "lucide-react";
import type { FlowStep } from "@/components/photographer/ProjectActionFlow";
import type { Project, ProjectStatus } from "@/types";

export type FlowPageKey =
  | "upload"
  | "results"
  | "upload-versions"
  | "upload-versions-v2";

/**
 * Plan B: allowRevision=true여도 v2 진입 전까지는 5단계.
 * editing_v2 이후부터 7단계 자동 확장.
 */
function resolveStepCount(
  status: ProjectStatus,
  allowRevision: boolean
): 5 | 7 {
  if (!allowRevision) return 5;
  const v2Statuses: ProjectStatus[] = ["editing_v2", "reviewing_v2", "delivered"];
  return v2Statuses.includes(status) ? 7 : 5;
}

/**
 * pageKey가 있는 단계(이동 가능)가 이미 완료된 상태인지 status로 판단.
 * 순서 기반이 아닌 project status 기반으로 판단하여,
 * 현재 페이지가 earlier step이어도 이미 지나간 단계를 "done"으로 표시.
 */
function isPageCompleted(stepPageKey: FlowPageKey, status: ProjectStatus): boolean {
  switch (stepPageKey) {
    case "upload":
      return status !== "preparing";
    case "results":
      return !["preparing", "selecting"].includes(status);
    case "upload-versions":
      return ["reviewing_v1", "editing_v2", "reviewing_v2", "delivered"].includes(status);
    case "upload-versions-v2":
      return ["reviewing_v2", "delivered"].includes(status);
  }
}

/**
 * pageKey 없는 read-only 단계(보정본 검토, 재보정 검토, 납품 완료)의
 * state를 project status에서 파생.
 */
function readOnlyStepState(
  stepLabel: string,
  status: ProjectStatus,
  stepCount: 5 | 7
): "done" | "active" | "locked" {
  if (stepCount === 5) {
    switch (stepLabel) {
      case "보정본 검토":
        if (status === "reviewing_v1") return "active";
        if (status === "delivered") return "done";
        return "locked";
      case "납품 완료":
        return status === "delivered" ? "done" : "locked";
    }
  } else {
    // 7단계 — status는 항상 editing_v2 이후
    switch (stepLabel) {
      case "보정본 검토":
        // 7단계에 진입했다면 보정본 검토(v1)는 이미 완료
        return "done";
      case "재보정 검토":
        if (status === "reviewing_v2") return "active";
        if (status === "delivered") return "done";
        return "locked";
      case "납품 완료":
        return status === "delivered" ? "done" : "locked";
    }
  }
  return "locked";
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

  const steps5: StepDef[] = [
    {
      label: "원본 업로드",
      desc: "원본 사진 업로드",
      icon: <Upload size={14} color="#FF4D00" />,
      pageKey: "upload",
      onClick: handlers.onUpload,
    },
    {
      label: "셀렉 확인",
      desc: "고객 셀렉 결과 확인",
      icon: <ListChecks size={14} color="#FF4D00" />,
      pageKey: "results",
      onClick: handlers.onResults,
      badge: isSelecting ? "LIVE" : null,
    },
    {
      label: "보정본 업로드",
      desc: "보정본 업로드 관리",
      icon: <PenLine size={14} color="#FF4D00" />,
      pageKey: "upload-versions",
      onClick: handlers.onVersions,
    },
    {
      label: "보정본 검토",
      desc: "고객 검토 진행 중",
      icon: <Eye size={14} color="#FF4D00" />,
      // read-only: no pageKey, no onClick
    },
    {
      label: "납품 완료",
      desc: "최종 납품",
      icon: <Flag size={14} color="#FF4D00" />,
    },
  ];

  const steps7: StepDef[] = [
    steps5[0],
    steps5[1],
    steps5[2],
    steps5[3], // 보정본 검토 (read-only)
    {
      label: "재보정 업로드",
      desc: "재보정본 업로드",
      icon: <PenLine size={14} color="#FF4D00" />,
      pageKey: "upload-versions-v2",
      onClick: handlers.onVersionsV2,
    },
    {
      label: "재보정 검토",
      desc: "고객 재검토 진행 중",
      icon: <Eye size={14} color="#FF4D00" />,
    },
    {
      label: "납품 완료",
      desc: "최종 납품",
      icon: <Flag size={14} color="#FF4D00" />,
    },
  ];

  const allSteps = stepCount === 7 ? steps7 : steps5;

  return allSteps.map((step) => {
    let state: "done" | "active" | "current" | "locked";

    if (step.pageKey) {
      // 이동 가능한 단계: 현재 페이지면 "current"(위치), 아니면 status 기반으로 done/locked
      if (step.pageKey === pageKey) {
        state = "current";
      } else {
        state = isPageCompleted(step.pageKey, status) ? "done" : "locked";
      }
    } else {
      // read-only 단계: status에서 파생
      state = readOnlyStepState(step.label, status, stepCount);
    }

    return {
      label: step.label,
      desc: step.desc,
      icon: step.icon,
      state,
      badge: step.badge ?? undefined,
      // locked 상태이면 onClick 제거
      onClick: state !== "locked" ? step.onClick : undefined,
    };
  });
}
