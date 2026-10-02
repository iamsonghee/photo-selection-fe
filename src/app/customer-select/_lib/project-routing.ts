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
  created_at: string;
};

/** 단계 판단에 필요한 값만 — 프로젝트 상세는 목록 요약 대신 불러온 프로젝트로 같은 판단을 한다. */
type ProjectStage = Pick<CustomerProjectSummary, "id" | "photo_count" | "retouch_done">;

/** 프로젝트 상세(목록 카드·헤더 프로젝트명이 여는 곳). 지금 할 단계로 가는 버튼은 상세 안에 있다. */
export function customerProjectHome(projectId: string) {
  return `/customer-select/${projectId}`;
}

/** 지금 할 단계 화면 — 상세의 주 버튼과 목록 카드의 행동 링크가 쓴다. */
export function customerProjectDestination(project: ProjectStage) {
  if (project.retouch_done) return `/customer-select/${project.id}/done`;
  if (project.photo_count > 0) return `/customer-select/${project.id}/select`;
  return `/customer-select/${project.id}/upload`;
}

export function customerProjectStatus(project: Omit<ProjectStage, "id">, selectedCount?: number | null) {
  if (project.retouch_done) return "완료";
  if (project.photo_count > 0) return selectedCount === 0 ? "고르기 전" : "고르는 중";
  return "사진 올리기 전";
}

export function customerProjectAction(project: Omit<ProjectStage, "id">, selectedCount?: number | null) {
  if (project.retouch_done) return "완료 내용 보기";
  if (project.photo_count === 0) return "사진 올리기";
  return selectedCount === 0 ? "사진 고르기" : "이어서 고르기";
}

export type CustomerProjectFilter = "all" | "active" | "done";

export function filterCustomerProjects(projects: CustomerProjectSummary[], query: string, status: CustomerProjectFilter) {
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
