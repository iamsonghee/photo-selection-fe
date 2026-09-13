import type { ProjectStatus } from "@/types";

export type RetouchedVersionApiRow = {
  id: string;
  photo_id: string;
  version: 1 | 2;
  r2_url: string;
  r2_thumb_url: string | null;
  review_status: "approved" | "revision_requested" | null;
  customer_comment: string | null;
  version_filename: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type RetouchedVersionHistoryApiRow = {
  id: string;
  photo_id: string;
  version: 1 | 2;
  revision_no: number;
  r2_url: string;
  r2_thumb_url: string | null;
  file_size: number | null;
  review_status: "approved" | "revision_requested" | null;
  customer_comment: string | null;
  version_filename: string | null;
  created_at: string;
  superseded_at: string;
  reviewed_at: string | null;
};

export type RetouchedVersionsPayload = {
  project_status: ProjectStatus;
  versions: RetouchedVersionApiRow[];
  version_history: RetouchedVersionHistoryApiRow[];
};

export type RetouchedVersionDataCacheEntry = {
  payload: RetouchedVersionsPayload;
  fetchedAt: number;
};

export const RETOUCHED_VERSION_DATA_STALE_MS = 60_000;

const versionDataCache = new Map<string, RetouchedVersionDataCacheEntry>();
const versionDataRequests = new Map<string, Promise<RetouchedVersionsPayload>>();

export function getCachedRetouchedVersionData(projectId: string) {
  return versionDataCache.get(projectId);
}

export async function fetchRetouchedVersionData(
  projectId: string,
  force = false,
): Promise<RetouchedVersionsPayload> {
  if (!force) {
    const pending = versionDataRequests.get(projectId);
    if (pending) return pending;

    const cached = versionDataCache.get(projectId);
    if (cached && Date.now() - cached.fetchedAt < RETOUCHED_VERSION_DATA_STALE_MS) {
      return cached.payload;
    }
  }

  const request = (async () => {
    const response = await fetch(
      force
        ? `/api/photographer/projects/${projectId}/versions?refresh=${Date.now()}`
        : `/api/photographer/projects/${projectId}/versions`,
      { cache: force ? "no-store" : "no-cache" },
    );
    const payload = (await response.json()) as RetouchedVersionsPayload & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "보정본 정보를 불러오지 못했습니다.");
    }
    versionDataCache.set(projectId, { payload, fetchedAt: Date.now() });
    return payload;
  })();

  versionDataRequests.set(projectId, request);
  try {
    return await request;
  } finally {
    if (versionDataRequests.get(projectId) === request) {
      versionDataRequests.delete(projectId);
    }
  }
}

/** 보정본 화면 진입 전에 동일한 캐시와 진행 중 요청을 예열한다. */
export function prefetchRetouchedVersionData(projectId: string) {
  return fetchRetouchedVersionData(projectId).catch((error: unknown) => {
    // 백그라운드 예열 실패는 실제 탭 진입 시 정상 오류 UI에서 다시 처리한다.
    console.warn("[retouched versions prefetch]", error);
    return null;
  });
}
