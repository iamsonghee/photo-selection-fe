export const BETA_MAX_PROJECTS_TOTAL = 10;
export const BETA_MAX_PHOTOS_PER_PROJECT = 1500;
export const BETA_MAX_REVISION_COUNT = 2;

export interface BetaLimitError {
  error: "beta_limit_exceeded";
  limit_type: "projects_total" | "photos_per_project" | "revision_count";
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
