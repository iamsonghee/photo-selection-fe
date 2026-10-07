export type CustomerProjectSummary = {
  id: string;
  name: string;
  shoot_type: string | null;
  shoot_date: string | null;
  selection_deadline: string | null;
  studio_name: string | null;
  photographer_name: string | null;
  shoot_region: string | null;
  shoot_location: string | null;
  target_count: number;
  photo_count: number;
  exported: boolean;
  delivery_count: number;
  last_delivered_at: string | null;
  retouch_done: boolean;
  selection_completed_at?: string | null;
  retouched_count?: number | null;
  created_at: string;
};

/** 단계 판단에 필요한 값만 — 프로젝트 상세는 목록 요약 대신 불러온 프로젝트로 같은 판단을 한다. */
type ProjectStage = Pick<CustomerProjectSummary, "id" | "photo_count" | "retouch_done" | "selection_completed_at" | "retouched_count">;

/** 작가에게 보낸 적이 있는 프로젝트 — 목록 카드가 상세와 같은 기준으로 '전달함' 단계를 판단한다. */
export function customerProjectSent(project: Pick<CustomerProjectSummary, "exported" | "delivery_count">) {
  return project.exported || project.delivery_count > 0;
}

/** 지금 할 단계 화면 — 목록 카드(본문·행동 링크)와 `/customer-select/[projectId]` 리다이렉트가 쓴다. */
export function customerProjectDestination(project: ProjectStage, sent = false) {
  if (project.retouched_count) return `/customer-select/${project.id}/retouch/compare`;
  if (project.selection_completed_at) return `/customer-select/${project.id}/review`;
  if (project.retouch_done) return `/customer-select/${project.id}/done`;
  if (sent) return `/customer-select/${project.id}/review`;
  if (project.photo_count > 0) return `/customer-select/${project.id}/select`;
  return `/customer-select/${project.id}/upload`;
}

export function customerProjectStatus(project: Omit<ProjectStage, "id">, selectedCount?: number | null, sent = false) {
  if (project.retouched_count) return `보정본 ${project.retouched_count}장`;
  if (project.selection_completed_at) return "셀렉 완료";
  if (project.retouch_done) return "완료";
  if (sent) return "작가에게 전달함";
  if (project.photo_count > 0) return selectedCount === 0 ? "고르기 전" : "고르는 중";
  return "사진 올리기 전";
}

export function customerProjectAction(project: Omit<ProjectStage, "id">, selectedCount?: number | null, sent = false) {
  if (project.retouched_count) return "보정본 비교하기";
  if (project.selection_completed_at) return "선택 결과 보기";
  if (project.retouch_done) return "완료 내용 보기";
  if (sent) return "선택 결과 보기";
  if (project.photo_count === 0) return "사진 올리기";
  return selectedCount === 0 ? "사진 고르기" : "이어서 고르기";
}

export type CustomerProjectFilter = "all" | "active" | "done";

export function filterCustomerProjects<T extends CustomerProjectSummary>(projects: T[], query: string, status: CustomerProjectFilter): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  return projects.filter((project) => {
    const matchesQuery = !normalizedQuery || [project.name, project.studio_name, project.photographer_name]
      .some((value) => value?.toLocaleLowerCase("ko").includes(normalizedQuery));
    const matchesStatus = status === "all"
      || (status === "active" && !project.retouch_done)
      || (status === "done" && project.retouch_done);
    return matchesQuery && matchesStatus;
  });
}

/** 마감 D-day 계산용 KST 기준 오늘(YYYY-MM-DD). */
export function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 셀렉 마감 칩(목록 카드·상세 공용). 3일 이내·오늘·지남은 urgent로 강조한다. 보정 완료면 보이지 않는다. */
export function selectionDeadlineBadge(deadline: string | null | undefined, today: string, done = false) {
  if (!deadline || done) return null;
  const days = Math.round((Date.parse(deadline.slice(0, 10)) - Date.parse(today)) / 86400_000);
  return { label: days < 0 ? "마감 지남" : days === 0 ? "오늘 마감" : `마감 D-${days}`, urgent: days <= 3 };
}
