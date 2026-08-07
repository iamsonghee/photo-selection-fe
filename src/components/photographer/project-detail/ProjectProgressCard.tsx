import { Check, ChevronRight, Flag, ListChecks, Lock, PenLine, Upload } from "lucide-react";
import type { Project } from "@/types";

type StepState = "done" | "active" | "locked";

type Step = {
  label: string;
  description: string;
  state: StepState;
  icon: React.ReactNode;
  onClick?: () => void;
};

type Props = {
  project: Project;
  onUpload: () => void;
  onSelection: () => void;
  onWorkflow: () => void;
};

function buildSteps({ project, onUpload, onSelection, onWorkflow }: Props): Step[] {
  const { status, photoCount, requiredCount, maxRevisionCount } = project;
  const preparing = status === "preparing";
  const selecting = status === "selecting";
  const delivered = status === "delivered";
  const isV2Phase = ["editing_v2", "reviewing_v2", "delivered"].includes(status);
  const showV2 = maxRevisionCount > 0 && isV2Phase;

  const upload: Step = {
    label: "원본 업로드",
    description: preparing
      ? photoCount >= requiredCount
        ? "사진 준비 완료"
        : photoCount === 0
        ? "지금 시작"
        : `${photoCount}장 업로드됨`
      : "완료",
    state: preparing ? "active" : "done",
    icon: <Upload size={16} />,
    onClick: onUpload,
  };

  const selectionReady = !preparing;
  const selection: Step = {
    label: "셀렉 확인",
    description: selecting
      ? "고객 셀렉 중"
      : preparing
      ? photoCount >= requiredCount
        ? "고객 링크 활성화 후 가능"
        : "사진 업로드 후 가능"
      : "완료",
    state: selecting ? "active" : selectionReady ? "done" : "locked",
    icon: <ListChecks size={16} />,
    onClick: selectionReady ? onSelection : undefined,
  };

  const v1State: StepState = preparing || selecting ? "locked" : delivered || isV2Phase ? "done" : "active";
  const versionOne: Step = {
    label: showV2 ? "보정본 v1" : "보정본",
    description:
      v1State === "done"
        ? "완료"
        : v1State === "active"
        ? status === "confirmed"
          ? "보정 시작 대기"
          : status === "reviewing_v1"
          ? "고객 검토 중"
          : "작업 중"
        : "이전 단계 완료 후 가능",
    state: v1State,
    icon: <PenLine size={16} />,
    onClick: v1State === "locked" ? undefined : onWorkflow,
  };

  const delivery: Step = {
    label: "납품 완료",
    description: delivered ? "완료" : "최종 목표",
    state: delivered ? "done" : "locked",
    icon: <Flag size={16} />,
  };

  if (!showV2) return [upload, selection, versionOne, delivery];

  const v2State: StepState = delivered ? "done" : ["editing_v2", "reviewing_v2"].includes(status) ? "active" : "locked";
  const versionTwo: Step = {
    label: "재보정 v2",
    description:
      v2State === "done"
        ? "완료"
        : status === "reviewing_v2"
        ? "고객 검토 중"
        : "작업 중",
    state: v2State,
    icon: <PenLine size={16} />,
    onClick: v2State === "locked" ? undefined : onWorkflow,
  };

  return [upload, selection, versionOne, versionTwo, delivery];
}

/**
 * 상세 화면 전용 진행 단계. 결과 화면의 테크 스타일과 달리,
 * 현재 프로젝트 상태만 중립적으로 표시하며 현재 페이지 표시는 사용하지 않는다.
 */
export function ProjectProgressCard(props: Props) {
  const steps = buildSteps(props);

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h3 className="mb-4 text-base font-bold text-foreground">진행 단계</h3>
      <div className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          const isLocked = step.state === "locked";
          const clickable = Boolean(step.onClick);

          const stateClass = isActive
            ? "border-accent/40 bg-accent/5"
            : isDone
            ? "border-border-subtle bg-background/50"
            : "border-border-subtle bg-transparent opacity-60";
          const iconClass = isActive
            ? "border-accent/40 bg-accent/15 text-accent"
            : isDone
            ? "border-border-subtle bg-surface-raised text-emerald-400"
            : "border-border-subtle bg-surface-raised text-subtle-foreground";

          return (
            <button
              key={step.label}
              type="button"
              disabled={!clickable}
              onClick={step.onClick}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${stateClass} ${
                clickable ? "group hover:border-accent/50" : "cursor-default"
              }`}
            >
              <span className={`w-5 shrink-0 text-[10px] font-bold ${isActive ? "text-accent" : "text-disabled-foreground"}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconClass}`}>
                {isDone ? <Check size={14} strokeWidth={2.5} /> : isLocked ? <Lock size={14} /> : step.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${isLocked ? "text-subtle-foreground" : isDone ? "text-muted-foreground" : "text-foreground"}`}>
                  {step.label}
                </span>
                <span className={`mt-0.5 block truncate text-[11px] ${isActive ? "text-accent" : "text-disabled-foreground"}`}>
                  {step.description}
                </span>
              </span>
              {clickable && <ChevronRight size={16} className="shrink-0 text-subtle-foreground transition-colors group-hover:text-accent" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
