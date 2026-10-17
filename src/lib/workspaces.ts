export const WORKSPACES = {
  studio: { label: "작가·스튜디오", path: "/studio/dashboard" },
  select: { label: "내 사진 셀렉", path: "/select/projects" },
} as const;

export type Workspace = keyof typeof WORKSPACES;
export const LAST_WORKSPACE_KEY = "acut_last_workspace";
export const WORKSPACE_SAVE_FAILED_COOKIE = "acut_workspace_save_failed";

/** 사용자 설정은 이동 힌트일 뿐 이용권·프로젝트 권한이 아니다. */
export function lastWorkspacePath(value: unknown): string | null {
  return value === "studio" || value === "select" ? WORKSPACES[value].path : null;
}

/** 외부 결과 공유는 기존 주소·인증 쿠키 경로를 유지한다. */
export function migrateWorkspacePath(pathname: string): string {
  const studio = pathname.match(/^\/(?:photographer|app\/studio)(\/.*)?$/);
  if (studio) return !studio[1] || studio[1] === "/" ? "/studio/dashboard" : `/studio${studio[1]}`;
  if (/^\/customer-select\/result(?:\/|$)/.test(pathname)) return pathname;
  const select = pathname.match(/^\/(?:customer-select|app\/select)(\/.*)?$/);
  if (select) return !select[1] || select[1] === "/" ? "/select/projects" : `/select${select[1]}`;
  return pathname;
}
