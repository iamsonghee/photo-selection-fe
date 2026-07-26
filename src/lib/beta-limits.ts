/** 베타(참여 확정) 사용자 기본 한도 — 사용자별 override 없이 전원 동일하게 적용 */
export const BETA_MAX_PROJECTS_TOTAL = 10;
export const BETA_MAX_PHOTOS_PER_PROJECT = 2000;
export const BETA_MAX_REVISION_COUNT = 2;

/** 베타 부여 시 종료일을 지정하지 않으면 시작일로부터 이 일수만큼 자동 설정 */
export const BETA_DEFAULT_DURATION_DAYS = 30;

/** 일반(Trial) 사용자 한도 — 서비스 체험 수준 */
export const GENERAL_MAX_PROJECTS = 1;
export const GENERAL_MAX_PHOTOS_PER_PROJECT = 500;

export interface BetaLimitError {
  error: "beta_limit_exceeded";
  limit_type: "projects_total" | "photos_per_project" | "revision_count" | "beta_expired";
  current: number;
  max: number;
  message: string;
}

/** fetch 응답 body(JSON)에서 베타 제한 에러 파싱 */
export function parseBetaLimitError(body: unknown): BetaLimitError | null {
  if (typeof body !== "object" || body === null) return null;
  const detail = (body as Record<string, unknown>).detail;
  if (typeof detail !== "object" || detail === null) return null;
  const d = detail as Record<string, unknown>;
  if (d.error !== "beta_limit_exceeded") return null;
  return d as unknown as BetaLimitError;
}
