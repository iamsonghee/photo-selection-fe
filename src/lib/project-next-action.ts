import type { Project } from "@/types";

// 프로젝트 목록과 대시보드는 같은 작업 이름과 목적지를 사용한다.
export type DesktopNextAction =
  | { kind: "primary"; label: string; href: string }
  | { kind: "secondary"; label: string; href: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "waiting" }
  | { kind: "none" };

export function getDesktopNextAction(project: Project): DesktopNextAction {
  const base = `/photographer/projects/${project.id}`;
  switch (project.status) {
    case "preparing":    return { kind: "link",    label: "원본 업로드",   href: `${base}/upload` };
    case "selecting":    return { kind: "waiting" };
    case "confirmed":    return { kind: "primary", label: "보정 시작",     href: `${base}/assets/retouched` };
    case "editing":      return { kind: "link",    label: "보정본 업로드", href: `${base}/assets/retouched` };
    case "reviewing_v1": return { kind: "waiting" };
    case "editing_v2":   return {
      kind: "primary",
      label: project.revisionRound === 2 ? "2차 재보정 업로드" : "1차 재보정 업로드",
      href: `${base}/assets/retouched`,
    };
    case "reviewing_v2": return { kind: "waiting" };
    // 완료 작업은 최종 납품 사진을 바로 열며 보조 버튼으로 표시한다.
    case "delivered":    return { kind: "secondary", label: "최종본 보기", href: `${base}/assets/final` };
  }
}
