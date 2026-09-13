"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import type { Project, ProjectStatus } from "@/types";
import { getProjectActor, type ProjectActor } from "@/lib/project-actor";

/**
 * Project List Desktop 전용 6-step Workflow Stepper. Golden Screen №7(v0.8)의 Header/Row
 * 통합 grid 구조를 그대로 옮긴 것 — ProjectStepperHeader와 ProjectStepper가 완전히 같은
 * grid-template-columns를 공유해야 dot 중심축이 Row마다 어긋나지 않는다.
 */

const STEP_PARTS: readonly [num: string, label: string][] = [
  ["01", "원본"],
  ["02", "셀렉"],
  ["03", "보정"],
  ["04", "1차 수정"],
  ["05", "2차 수정"],
  ["06", "납품"],
];

// Figma Project List 실측: dot은 23px, connector는 1px. Header와 Row가 같은
// track을 공유해 모든 중심축이 일치하도록 dot column도 실제 dot geometry와 맞춘다.
const TRACK_COLS = "23px 1fr 23px 1fr 23px 1fr 23px 1fr 23px 1fr 23px";
const DOT_COL: readonly number[] = [1, 3, 5, 7, 9, 11];

export type SixStepPosition = { step: 1 | 2 | 3 | 4 | 5 | 6; actor: ProjectActor };

/**
 * maxRevisionCount(재보정 허용 횟수, 실제 필드)에 따라 이 프로젝트가 절대 도달하지 않는 단계를
 * 반환한다 — 0이면 1차/2차 수정 둘 다, 1이면 2차 수정만 도달 불가. 새 데이터를 만들지 않고
 * 기존 Project.maxRevisionCount만 사용한다.
 */
export function getDisabledSteps(maxRevisionCount: 0 | 1 | 2): number[] {
  if (maxRevisionCount === 0) return [4, 5];
  if (maxRevisionCount === 1) return [5];
  return [];
}

/**
 * ProjectStatus(+revisionRound) → 6-step 위치. reviewing_v1/v2는 다음 단계로 넘어가지 않고
 * 직전 작업 단계(보정/1·2차 수정) dot에 그대로 머무르며 current-wait로 표시한다 — "검토 중"은
 * 아직 그 단계가 끝났는지 확정되지 않은 상태이기 때문(승인된 Workflow Mapping, 2026-08-24).
 * 실제 ProjectStatus에는 "작가가 마지막에 납품 버튼을 누르는" 상태가 없으므로(reviewing_v1/v2 →
 * delivered로 고객 승인 시 직접 전환) 06 납품은 delivered일 때만 도달하고, current-action으로
 * 표시되는 경우는 존재하지 않는다.
 */
export function getSixStepPosition(status: ProjectStatus, revisionRound?: number): SixStepPosition {
  const actor = getProjectActor(status);
  switch (status) {
    case "preparing":
      return { step: 1, actor };
    case "selecting":
      return { step: 2, actor };
    case "confirmed":
    case "editing":
    case "reviewing_v1":
      return { step: 3, actor };
    case "editing_v2":
    case "reviewing_v2":
      return { step: revisionRound === 2 ? 5 : 4, actor };
    case "delivered":
      return { step: 6, actor };
  }
}

export function ProjectStepperHeader() {
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: TRACK_COLS }}>
      {STEP_PARTS.map(([num, label], i) => {
        const col = DOT_COL[i];
        const isFirst = i === 0;
        const isLast = i === STEP_PARTS.length - 1;
        return (
          <span
            key={num}
            className="flex flex-col whitespace-nowrap gap-0.5"
            style={{ gridColumn: col, justifySelf: isFirst ? "start" : isLast ? "end" : "center" }}
          >
            <b className="text-[12px] font-bold leading-[17px] tracking-[-0.45px] text-subtle-foreground not-italic">{num}</b>
            <span className="text-[16px] font-bold leading-[22.4px] tracking-[-0.45px] text-muted-foreground">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ProjectStepper({ project }: { project: Project }) {
  const { step, actor } = getSixStepPosition(project.status, project.revisionRound);
  const isCompleted = actor === "completed";
  const disabledSteps = getDisabledSteps(project.maxRevisionCount);

  return (
    <div
      // Completed(delivered) Row의 dimming은 이제 Row 전체 레벨의 opacity-50(page.tsx)이 통일해서
      // 담당한다 — 여기서 opacity-70을 추가로 얹으면 두 배로 흐려져 Row의 다른 요소보다 스테퍼만
      // 더 흐리게 보이므로 제거한다(Figma #56057: Row 전체가 균일한 하나의 투명도).
      className="grid items-center min-w-0"
      style={{ gridTemplateColumns: TRACK_COLS, gridTemplateRows: "auto auto", rowGap: 8.5 }}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const stepNum = i + 1;
        const dotCol = DOT_COL[i];
        const isDone = isCompleted || stepNum < step;
        const isCurrent = !isCompleted && stepNum === step;
        // maxRevisionCount상 이 프로젝트가 절대 도달하지 않는 미래 단계 — done/current인 적은 없으므로
        // 항상 future 쪽에서만 갈린다.
        const isDisabled = !isCompleted && !isDone && !isCurrent && disabledSteps.includes(stepNum);
        const visualState = isDone ? "done" : isCurrent ? "current" : isDisabled ? "unavailable" : "future";

        // Completed(delivered) Row는 강조가 필요 없는 상태이므로 done dot/line을 진행중 Row의 done보다
        // 한 단계 더 낮은 대비로 가라앉힌다 — "Completed Row가 진행중 Row보다 튀지 않게"(승인 §9).
        // Geometry(크기)는 Figma #56056 실측(약 23px)에 맞춰 모든 state 공통 통일하고, 상태 구분은
        // 아래 dotTone(색/채움)만으로 표현한다 — "Geometry=Figma, Semantic=Design System"(승인 §1).
        const dotSizeCls = "w-[23px] h-[23px]";
        const dotTone = isCompleted
          ? "bg-[var(--stepper-completed-node)] border-[var(--stepper-completed-node)]"
          : isDone
          ? "bg-[var(--stepper-done-node)] border-[var(--stepper-done-node)]"
          : isCurrent && actor === "photographer"
          ? "bg-accent border-accent shadow-[0_0_0_4px_rgba(var(--accent-rgb),0.22)]"
          : isCurrent && actor === "customer"
          ? "bg-[var(--cyan)] border-[var(--cyan)] shadow-[0_0_0_4px_var(--customer-soft)]"
          // future: 안쪽을 페이지 배경색으로 불투명하게 채워 "테두리만 있는 빈 원"처럼 보이게 하면서도
          // 뒤로 지나가는 line은 완전히 가려지도록 한다(bg-transparent였을 때 line이 그대로 비치던 문제 수정).
          : isDisabled
          ? "bg-surface-raised border-border-subtle"
          : "bg-background border-border-strong/90";
        const lineTone = isCompleted
          ? "bg-disabled-foreground/40"
          : isDone
          ? "bg-muted-foreground/70"
          : "bg-border-strong";

        return (
          <Fragment key={stepNum}>
            {/* Line이 dot 컬럼까지 겹쳐 들어가 dot "뒤"를 지나가도록 span을 3칸(dot-line-dot)으로
                넓힌다 — dot은 z-10으로 항상 위에 그려져 겹치는 구간을 자연스럽게 가려준다. */}
            {i < 5 && (
              <span
                className={`h-px w-full ${lineTone}`}
                style={{ gridColumn: `${dotCol} / span 3`, gridRow: 1 }}
              />
            )}
            <span
              data-step-state={visualState}
              className={`relative z-10 flex items-center justify-center rounded-full border transition-colors ${dotSizeCls} ${dotTone}`}
              style={{ gridColumn: dotCol, gridRow: 1 }}
            >
              {isDone && <Check size={10} strokeWidth={3} className="text-background" />}
              {isDisabled && <span className="w-2 h-px rounded-full bg-disabled-foreground" aria-hidden="true" />}
            </span>
          </Fragment>
        );
      })}

      {/* Turn Indicator — 현재 단계 dot과 같은 grid column에만, 과거/미래 단계엔 없음. 완료(actor==="completed")면 아예 렌더하지 않는다. */}
      {!isCompleted && (
        <div
          className="flex items-center whitespace-nowrap"
          style={{
            gridColumn: DOT_COL[step - 1],
            gridRow: 2,
            justifySelf: step === 1 ? "start" : step === 6 ? "end" : "center",
          }}
        >
          {/* Actor color는 바로 위 current node가 이미 Orange/Teal로 전달한다. 같은 색의 작은 dot을
              반복하지 않고 label만 남겨 현재 node를 Stepper의 단일 강조점으로 유지한다.
              Figma 실측: Pretendard Medium 10px/lh14px/-0.36px이지만 "의미있는 텍스트 최소 12px"
              Design System 규칙 우선 적용(Intentional Design System Override) — font-size만
              12px 유지하고 나머지(weight/line-height/letter-spacing)는 Figma를 그대로 따른다. */}
          <span className="text-[12px] font-medium leading-[14px] tracking-[-0.36px] text-foreground">
            {actor === "photographer" ? "작가" : "고객"}
          </span>
        </div>
      )}
    </div>
  );
}
