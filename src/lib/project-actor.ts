import type { Project, ProjectStatus } from "@/types";
import { getActiveDeadline } from "@/lib/project-deadline";

/**
 * ProjectStatus → Actor 공통 매핑. docs/design-system.md §30 Workflow Semantic — Actor Color의
 * 실제 구현체. "지금 누구 차례인가"를 여기서만 판단하고, 화면마다 각자 status를 재해석하지 않는다.
 * 매핑 근거는 src/types/index.ts의 ProjectStatus 주석(고객/작가 역할 설명)을 그대로 따른다 — 새 상태를
 * 만들거나 기존 상태의 의미를 바꾸지 않았다.
 */
export type ProjectActor = "photographer" | "customer" | "completed";

export function getProjectActor(status: ProjectStatus): ProjectActor {
  switch (status) {
    case "preparing":
    case "confirmed":
    case "editing":
    case "editing_v2":
      return "photographer";
    case "selecting":
    case "reviewing_v1":
    case "reviewing_v2":
      return "customer";
    case "delivered":
      return "completed";
  }
}

/**
 * "지금 내가/고객이 뭘 하고 있는지"를 나타내는 문장형 라벨(Turn Indicator의 Action 줄, §21.3).
 * Badge 라벨과는 표현이 다르다 — Badge는 단계 이름, 이건 지금 해야/하고 있는 일 자체.
 */
export function getCurrentActionLabel(status: ProjectStatus, revisionRound?: number): string {
  switch (status) {
    case "preparing":    return "사진 업로드";
    case "selecting":    return "셀렉 중";
    case "confirmed":
    case "editing":      return "보정본 업로드";
    case "reviewing_v1": return "확인 중";
    case "editing_v2":   return revisionRound === 2 ? "2차 재보정" : "1차 재보정";
    case "reviewing_v2": return "확인 중";
    case "delivered":    return "완료";
  }
}

/**
 * 내 작업 카드의 Metric(§20) — 실제 존재하는 필드(photoCount/requiredCount)로만 계산한다.
 * editing_v2(재보정 요청 장수)는 프로젝트 목록 레벨에서 집계할 수 있는 데이터 소스가 없어(Data Gap,
 * version_reviews를 프로젝트별로 추가 조회해야 함) 의도적으로 null을 반환한다 — Mock 숫자를 넣지 않는다.
 */
export function getWorkMetric(project: Project): { value: string; label: string } | null {
  switch (project.status) {
    case "preparing":
      return {
        value: `${project.requiredCount.toLocaleString()}/${project.photoCount.toLocaleString()}장`,
        label: "셀렉 / 원본",
      };
    case "confirmed":
    case "editing":
      return { value: `보정${project.requiredCount.toLocaleString()}장`, label: "보정 대상" };
    default:
      return null;
  }
}

// level(ok/warn/danger)은 projects/page.tsx의 dday()와 동일한 기준 — 여러 화면에서 같은 의미가
// 같은 색으로 보이도록 정렬. Dashboard 자체 로컬 함수를 여기 공통 유틸로 옮겨 재사용한다.
export function dday(deadline: string): { text: string; level: "ok" | "warn" | "danger" } {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3)   return { text: `D-${diff}`,      level: "ok" };
  if (diff > 0)   return { text: `D-${diff} 임박`,  level: "warn" };
  if (diff === 0) return { text: "D-day",           level: "danger" };
  return            { text: `D+${Math.abs(diff)}`, level: "danger" };
}

/** dday() level만 필요한 곳을 위한 헬퍼 — deadline이 없는 상태(getActiveDeadline이 null)면 null. */
export function getDeadlineLevel(project: Project): "ok" | "warn" | "danger" | null {
  const info = getActiveDeadline(project);
  if (!info) return null;
  return dday(info.date).level;
}

/**
 * "오늘 확인이 필요한 작업" 수 — Actor=photographer 전체 + (Actor=customer 이면서 마감이 실제로
 * 초과(level==="danger")된 것만). 마감 임박(warn)은 포함하지 않는다(합의된 정의, 2026-08-21).
 */
export function countNeedsAttention(projects: Project[]): number {
  let count = 0;
  for (const p of projects) {
    const actor = getProjectActor(p.status);
    if (actor === "photographer") { count++; continue; }
    if (actor === "customer" && getDeadlineLevel(p) === "danger") count++;
  }
  return count;
}

/**
 * Focus Project 우선순위(§22) — 실제 데이터로 신뢰성 있게 판별 가능한 3-tier만 사용한다.
 * 1) Customer Turn + 마감 초과(deadline level==="danger")
 * 2) status==="confirmed"(Photographer Turn) — confirmedAt 최신순
 * 3) 그 외 Photographer Turn(preparing/editing/editing_v2) — shootDate 최신순(기존 화면들과 동일한
 *    관행 재사용, 새 scoring algorithm을 만들지 않는다)
 * "editing_v2가 방금 새 재보정 요청으로 전환됐는지"와 "Photographer Turn의 마감 임박/초과"는
 * 신뢰 가능한 timestamp/필드가 없어(Data Gap) 이 랭킹에 포함하지 않는다.
 */
export function getFocusRankedProjects(projects: Project[]): Project[] {
  const byShootDateDesc = (a: Project, b: Project) =>
    new Date(b.shootDate ?? 0).getTime() - new Date(a.shootDate ?? 0).getTime();

  const tier1 = projects
    .filter((p) => getProjectActor(p.status) === "customer" && getDeadlineLevel(p) === "danger")
    .sort(byShootDateDesc);

  const tier2 = projects
    .filter((p) => p.status === "confirmed")
    .sort((a, b) => new Date(b.confirmedAt ?? 0).getTime() - new Date(a.confirmedAt ?? 0).getTime());

  const tier3 = projects
    .filter((p) => getProjectActor(p.status) === "photographer" && p.status !== "confirmed")
    .sort(byShootDateDesc);

  return [...tier1, ...tier2, ...tier3];
}
