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
    // Figma #56057 실측: 납품 완료 Row는 다음 작업 칸이 빈 값("–")이 아니라 결과 확인용 버튼을
    // 보여준다 — 이미 존재하는 results 페이지로 연결. 단, "결과보기"는 "지금 당장 해야 할 작업"이
    // 아니라 "이미 끝난 프로젝트의 결과를 다시 보는" 열람 액션이라 Primary(Orange Filled)가 아닌
    // Secondary(Neutral Raised Surface)로 구분한다(CTA Hierarchy 정정).
    case "delivered":    return { kind: "secondary", label: "결과보기", href: `${base}/results` };
  }
}

