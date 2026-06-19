import type { ProjectStatus } from "@/types";

export type DeadlineInfo = {
  date: string;   // ISO date string (YYYY-MM-DD or ISO datetime)
  label: string;  // "셀렉 기한" | "검토 기한"
} | null;

/**
 * 프로젝트 상태에 맞는 현재 기한 정보를 반환한다.
 * - preparing / selecting  → 셀렉 기한 (deadline)
 * - reviewing_v1/v2        → 검토 기한 (reviewDeadline, 설정된 경우)
 * - 그 외 (confirmed, editing, delivered 등) → null (표시 안 함)
 */
export function getActiveDeadline(project: {
  status: ProjectStatus;
  deadline: string;
  reviewDeadline?: string | null;
}): DeadlineInfo {
  const { status, deadline, reviewDeadline } = project;

  if (status === "delivered") return null;

  if (status === "reviewing_v1" || status === "reviewing_v2") {
    if (reviewDeadline) return { date: reviewDeadline, label: "검토 기한" };
    return null;
  }

  if (status === "preparing" || status === "selecting") {
    if (deadline) return { date: deadline, label: "셀렉 기한" };
  }

  // confirmed / editing / editing_v2 → 표시 안 함
  return null;
}
