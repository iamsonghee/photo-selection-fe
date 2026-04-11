/** 프로젝트 상세(루트)만 — /upload, /results 등 하위 경로는 제외 */
export function isProjectDetailRootPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+$/.test(pathname);
}
