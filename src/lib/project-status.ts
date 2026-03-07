import type { ProjectStatus } from "@/types";

/** DB/앱 공통 상태값 */
export const PROJECT_STATUSES: ProjectStatus[] = [
  "preparing",
  "selecting",
  "confirmed",
  "editing",
  "reviewing_v1",
  "editing_v2",
  "reviewing_v2",
  "delivered",
];

/** 상태 한글명 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "업로드 전",
  selecting: "셀렉 중",
  confirmed: "셀렉 완료",
  editing: "보정 중",
  reviewing_v1: "v1 검토 중",
  editing_v2: "v2 재보정 중",
  reviewing_v2: "v2 검토 중",
  delivered: "납품 완료",
};

/** 대시보드 그룹: 대기중 = preparing */
export const GROUP_WAITING: ProjectStatus[] = ["preparing"];

/** 대시보드 그룹: 진행중 = selecting, confirmed, editing, reviewing_*, editing_v2 */
export const GROUP_IN_PROGRESS: ProjectStatus[] = [
  "selecting",
  "confirmed",
  "editing",
  "reviewing_v1",
  "editing_v2",
  "reviewing_v2",
];

/** 대시보드 그룹: 완료 = delivered */
export const GROUP_COMPLETED: ProjectStatus[] = ["delivered"];

/**
 * 상태 전환 규칙
 * - preparing → selecting: 사진 업로드 완료 후 (M >= N)
 * - selecting → confirmed: 고객 최종확정
 * - confirmed → editing: 작가 보정 시작
 * - confirmed → selecting: 고객 확정 취소 (제한 횟수 내)
 * - editing → reviewing_v1: 작가 보정본 업로드 후 고객에게 전달
 * - reviewing_v1 → delivered: 고객 전부 확정
 * - reviewing_v1 → editing_v2: 고객 재보정 요청
 * - editing_v2 → reviewing_v2: 작가 v2 업로드 후 전달
 * - reviewing_v2 → delivered: 고객 전부 확정
 * - reviewing_v2 → editing_v2: 고객 재보정 요청 (1회 남은 경우)
 */
export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  const allowed: Record<ProjectStatus, ProjectStatus[]> = {
    preparing: ["selecting"],
    selecting: ["confirmed"],
    confirmed: ["editing", "selecting"],
    editing: ["reviewing_v1"],
    reviewing_v1: ["delivered", "editing_v2"],
    editing_v2: ["reviewing_v2"],
    reviewing_v2: ["delivered", "editing_v2"],
    delivered: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function getStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}
