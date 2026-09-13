/** 프로젝트 상세(루트)만 — /upload, /results 등 하위 경로는 제외 */
export function isProjectDetailRootPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+$/.test(pathname);
}

/** 원본 업로드 경로 — /photographer/projects/[id]/upload */
export function isProjectUploadPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+\/upload$/.test(pathname);
}

/** 원본/셀렉 통합 조회 경로 — query tab과 무관하게 Light shell을 사용한다. */
export function isProjectResultsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+\/results$/.test(pathname);
}

/** 보정본 업로드/검토 경로 — 원본·셀렉과 같은 Light 자산 화면군이다. */
export function isProjectWorkflowPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+\/workflow$/.test(pathname);
}

/** 원본·셀렉·보정본·최종본을 묶는 프로젝트 자산 workspace. */
export function isProjectAssetsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/photographer\/projects\/[^/]+\/assets\/(original|selected|retouched|final)$/.test(pathname);
}

/** Light Golden Reference가 적용된 작가 운영 화면. Portal UI도 이 판별을 공유한다. */
export function isPhotographerLightRoute(pathname: string | null): boolean {
  return pathname === "/photographer/dashboard" ||
    pathname === "/photographer/projects" ||
    pathname === "/photographer/projects/new" ||
    pathname === "/photographer/settings" ||
    pathname === "/photographer/manual" ||
    isProjectDetailRootPath(pathname) ||
    isProjectUploadPath(pathname) ||
    isProjectResultsPath(pathname) ||
    isProjectWorkflowPath(pathname) ||
    isProjectAssetsPath(pathname);
}
