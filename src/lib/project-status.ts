import type { ProjectStatus } from "@/types";

/** DB/앱 공통 상태값 */
export const PROJECT_STATUSES: ProjectStatus[] = [
  "preparing",
  "selecting",
  "confirmed",
  "editing",
];

/** 상태 한글명 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "업로드 전",
  selecting: "셀렉 중",
  confirmed: "셀렉 완료",
  editing: "보정 중",
};

/** 대시보드 그룹: 대기중 = preparing */
export const GROUP_WAITING: ProjectStatus[] = ["preparing"];

/** 대시보드 그룹: 진행중 = selecting, confirmed */
export const GROUP_IN_PROGRESS: ProjectStatus[] = ["selecting", "confirmed"];

/** 대시보드 그룹: 완료 = editing */
export const GROUP_COMPLETED: ProjectStatus[] = ["editing"];

/**
 * 상태 전환 규칙
 * - preparing → selecting: 사진 업로드 완료 후 (M >= N)
 * - selecting → confirmed: 고객 최종확정
 * - confirmed → editing: 작가 보정 시작
 * - confirmed → selecting: 고객 확정 취소 (제한 횟수 내)
 */
export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  const allowed: Record<ProjectStatus, ProjectStatus[]> = {
    preparing: ["selecting"],
    selecting: ["confirmed"],
    confirmed: ["editing", "selecting"],
    editing: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function getStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}
