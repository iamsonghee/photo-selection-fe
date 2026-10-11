export const WORKSPACES = {
  studio: { label: "작가·스튜디오", path: "/app/studio/dashboard" },
  select: { label: "내 사진 셀렉", path: "/app/select" },
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
  if (/^\/photographer(?:\/|$)/.test(pathname)) return pathname.replace("/photographer", "/app/studio");
  if (/^\/customer-select(?:\/|$)/.test(pathname) && !/^\/customer-select\/result(?:\/|$)/.test(pathname)) {
    return pathname.replace("/customer-select", "/app/select");
  }
  return pathname;
}
