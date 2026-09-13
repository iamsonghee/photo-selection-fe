import type { Project } from "@/types";

/**
 * 고객 보정본 검토가 "판단"인지 "확인"인지 가르는 한 가지 사실.
 *
 * 남은 재보정 횟수가 0이면 고객이 고를 수 있는 답은 `확정` 하나뿐이다. 그런데도 사진마다
 * 확정을 누르게 하면, 답이 정해진 질문을 N번 반복시키는 셈이다(선택지가 하나인 선택은 선택이 아니다).
 *
 * 예전에는 이 판단이 `maxRevisionCount === 0`(= 재보정이 **없는 상품**)으로만 쓰여 있었다.
 * 그건 남은 횟수가 0이 되는 여러 경로 중 하나일 뿐이라, 마지막 라운드(`reviewing_v2`에서
 * 재보정을 이미 한 번 쓴 경우)는 똑같이 재보정이 불가능한데도 판단 화면으로 떨어졌다.
 * 판별식은 "지금 재보정할 수 있나" 하나여야 한다.
 */
export function revisionRemaining(project: Pick<Project, "maxRevisionCount" | "revisionRound">): number {
  return Math.max(0, (project.maxRevisionCount ?? 0) - (project.revisionRound ?? 0));
}

/** 재보정을 요청할 수 없는 상태 — 화면은 판단이 아니라 **수령 확인**이 되어야 한다. */
export function isReceiptMode(project: Pick<Project, "maxRevisionCount" | "revisionRound">): boolean {
  return revisionRemaining(project) === 0;
}
