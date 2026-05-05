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
 * opts.maxRevisionCount (0|1|2): 재보정 허용 횟수
 * opts.revisionRound: 현재까지 진행된 재보정 라운드 수
 *
 * - maxRevisionCount=0: reviewing_v1 → delivered 만 허용
 * - maxRevisionCount>=1: reviewing_v1 → editing_v2 허용 (round=0→1)
 * - revisionRound < maxRevisionCount: reviewing_v2 → editing_v2 허용
 * - revisionRound >= maxRevisionCount: reviewing_v2 → delivered 만 허용
 */
export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  opts?: { maxRevisionCount?: number; revisionRound?: number }
): boolean {
  const max = opts?.maxRevisionCount ?? 2;
  const round = opts?.revisionRound ?? 0;

  const allowed: Record<ProjectStatus, ProjectStatus[]> = {
    preparing:    ["selecting"],
    selecting:    ["confirmed"],
    confirmed:    ["editing", "selecting"],
    editing:      ["reviewing_v1"],
    reviewing_v1: max > 0 ? ["delivered", "editing_v2"] : ["delivered"],
    editing_v2:   ["reviewing_v2"],
    reviewing_v2: round < max ? ["delivered", "editing_v2"] : ["delivered"],
    delivered:    [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function getStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

/** preparing일 때 photoCount에 따라 "업로드 전" | "업로드 중" 반환. 그 외는 getStatusLabel과 동일. */
export function getDisplayStatusLabel(status: ProjectStatus, photoCount?: number): string {
  if (status === "preparing") {
    return (photoCount ?? 0) >= 1 ? "업로드 중" : "업로드 전";
  }
  return getStatusLabel(status);
}
