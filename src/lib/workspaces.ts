export const WORKSPACES = {
  studio: { label: "스튜디오", path: "/photographer/dashboard" },
  select: { label: "내 사진 셀렉", path: "/customer-select" },
} as const;

export type Workspace = keyof typeof WORKSPACES;
export const LAST_WORKSPACE_KEY = "acut_last_workspace";
export const WORKSPACE_SAVE_FAILED_COOKIE = "acut_workspace_save_failed";

/** 사용자 설정은 이동 힌트일 뿐 이용권·프로젝트 권한이 아니다. */
export function lastWorkspacePath(value: unknown): string | null {
  return value === "studio" || value === "select" ? WORKSPACES[value].path : null;
}
