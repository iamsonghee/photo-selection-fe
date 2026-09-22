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

export function customerProjectDestination(project: CustomerProjectSummary) {
  if (project.retouch_done) return `/customer-select/${project.id}/done`;
  if (project.exported) return `/customer-select/${project.id}/export`;
  if (project.photo_count > 0) return `/customer-select/${project.id}/select`;
  return `/customer-select/${project.id}/upload`;
}

export function customerProjectStatus(project: CustomerProjectSummary) {
  if (project.retouch_done) return "완료";
  if (project.exported) return "전달 완료";
  if (project.delivery_count > 0) return "재선택 중";
  if (project.photo_count > 0) return "셀렉 진행";
  return "사진 업로드 전";
}
