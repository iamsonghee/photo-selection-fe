import { Check, ChevronRight } from "lucide-react";
import type { Project } from "@/types";
import {
  getDisabledSteps,
  getSixStepPosition,
} from "@/components/photographer/ProjectStepper";

type Props = {
  project: Project;
  onUpload: () => void;
  onSelection: () => void;
  onWorkflow: () => void;
  onResults: () => void;
};

const STEPS = ["원본", "셀렉", "보정", "1차 수정", "2차 수정", "납품"] as const;
const MOBILE_STEPS = ["원본", "셀렉", "보정", "1차", "2차", "납품"] as const;

function activeDescription(project: Project, step: number): string {
  if (step === 1) {
    if (project.photoCount === 0) return "지금 시작";
    return `${project.photoCount}장 업로드`;
  }
  if (step === 2) return "고객 셀렉 중";
  if (step === 3) {
    if (project.status === "confirmed") return "보정 시작 대기";
    if (project.status === "reviewing_v1") return "고객 검토 중";
    return "작업 중";
  }
  if (step === 4 || step === 5) {
    return project.status === "reviewing_v2" ? "고객 검토 중" : "작업 중";
  }
  return "완료";
}

function futureDescription(project: Project, step: number): string {
  if (step === 2 && project.status === "preparing" && project.photoCount < project.requiredCount) {
    return "사진 업로드 후 가능";
  }
  return "예정";
}

/**
 * Project Detail 전용 Expanded Stepper.
 * 상태/actor/비활성 단계 판정은 Project List의 공통 6-step mapping을 재사용하고,
 * 상세 화면에서는 각 단계명과 상태 설명을 함께 보여준다.
 */
export function ProjectProgressCard({ project, onUpload, onSelection, onWorkflow, onResults }: Props) {
  const { step: currentStep, actor } = getSixStepPosition(project.status, project.revisionRound);
  const completed = actor === "completed";
  const disabledSteps = getDisabledSteps(project.maxRevisionCount);

  const actionForStep = (step: number): (() => void) | undefined => {
    if (step === 1) return onUpload;
    if (step === 2 && project.status !== "selecting" && (completed || currentStep >= 2)) return onSelection;
    if (step === 6 && completed) return onResults;
    // 고객 셀렉 확정(confirmed)은 아직 보정 시작 전이다. 현재 단계 표시는 유지하되,
    // 우측 작업 CTA의 확인 절차를 거치기 전에는 3단계에서 보정 화면으로 이동하지 않는다.
    if (
      step >= 3 &&
      step <= 5 &&
      project.status !== "confirmed" &&
      (completed || currentStep >= 3)
    ) return onWorkflow;
    return undefined;
  };

  return (
    <section
      aria-label="프로젝트 진행 단계"
      data-project-progress-card
      className="rounded-xl border border-border-subtle bg-surface-raised px-3 py-2.5 md:px-4 md:py-3"
    >
      <div data-project-progress-grid className="grid grid-cols-6 gap-0 md:grid-cols-3 md:gap-2 xl:grid-cols-6">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const done = completed || step < currentStep;
          const active = !completed && step === currentStep;
          const unavailable = !done && !active && disabledSteps.includes(step);
          const onClick = actionForStep(step);
          const customerActive = active && actor === "customer";

          // Expanded Stepper에서는 현재 단계의 의미를 node와 text에만 싣는다.
          // 단계 item 전체에 semantic border/fill을 반복하면 우측 Primary CTA와 경쟁한다.
          const itemTone = "border-transparent bg-transparent";
          const nodeTone = done
            ? "border-[var(--stepper-done-node)] bg-[var(--stepper-done-node)] text-white"
            : active
              ? customerActive
                ? "border-transparent bg-cyan text-white"
                : "border-transparent bg-accent text-white"
              : unavailable
                ? "border-border-subtle bg-surface-raised text-disabled-foreground"
                : "border-border-strong bg-background text-muted-foreground";
          const textTone = active
            ? customerActive
              ? "text-cyan"
              : "text-accent"
            : done
              ? "text-muted-foreground"
              : unavailable
                ? "text-disabled-foreground"
                : "text-subtle-foreground";
          const description = done
            ? "완료"
            : active
              ? activeDescription(project, step)
              : unavailable
                ? "미사용"
                : futureDescription(project, step);
          const connectorTone = completed || step < currentStep
            ? "bg-[var(--stepper-done-node)]"
            : "bg-border-subtle";

          return (
            <button
              key={label}
              type="button"
              disabled={!onClick}
              onClick={onClick}
              aria-current={active ? "step" : undefined}
              aria-label={`${label}, ${description}`}
              data-step-state={done ? "done" : active ? "current" : unavailable ? "unavailable" : "future"}
              className={`group relative flex min-h-[52px] min-w-0 flex-col items-center gap-1.5 rounded-lg border px-0.5 py-0 text-center transition-colors md:min-h-[68px] md:flex-row md:gap-3 md:px-3 md:py-2 md:text-left ${itemTone} ${
                onClick ? "md:hover:border-border-strong" : "cursor-default"
              }`}
            >
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1/2 top-[14px] z-0 h-px w-full md:hidden ${connectorTone}`}
                />
              ) : null}
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold leading-5 tracking-[-0.3px] md:h-8 md:w-8 md:text-[13px] ${nodeTone}`}>
                {done ? <Check size={12} strokeWidth={2.5} /> : unavailable ? "—" : step}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12px] font-semibold leading-4 tracking-[-0.3px] md:text-[15px] md:font-bold md:leading-5 md:tracking-[-0.35px] ${textTone}`}>
                  <span className="md:hidden">{MOBILE_STEPS[index]}</span>
                  <span className="hidden md:inline">{label}</span>
                </span>
                <span className={`mt-0.5 hidden truncate text-[12px] font-normal leading-5 tracking-[-0.25px] md:block ${
                  active ? textTone : done ? "text-muted-foreground" : "text-subtle-foreground"
                }`}>
                  {description}
                </span>
              </span>
              {onClick ? (
                <ChevronRight
                  size={12}
                  className="hidden shrink-0 text-disabled-foreground transition-colors group-hover:text-muted-foreground 2xl:block"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
