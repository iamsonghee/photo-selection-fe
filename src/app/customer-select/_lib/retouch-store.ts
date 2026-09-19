"use client";

/** 단계 7(S10~S13) 전용 데이터 훅. 1차 real-store.tsx와 데이터 모양이 달라(사진마다 여러
 * 회차 보정본을 가짐) 별도로 둔다 — Provider 없이 훅 하나로 충분한 범위라 Context는 안 만든다. */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RetouchVersion {
  id: string;
  round: number;
  filename: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  decision: "pending" | "confirmed" | "redo";
  redoReason: string | null;
  createdAt: string;
}

export interface RetouchPhoto {
  id: string;
  filename: string;
  url: string;
  previewUrl: string | null;
  versions: RetouchVersion[];
}

function withShareToken(path: string, shareToken: string | null) {
  return shareToken ? `${path}${path.includes("?") ? "&" : "?"}share_token=${encodeURIComponent(shareToken)}` : path;
}

export function useRetouchData(projectId: string, shareToken: string | null) {
  const [photos, setPhotos] = useState<RetouchPhoto[]>([]);
  const [retouchDone, setRetouchDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    const res = await fetch(withShareToken(`/api/customer-select/projects/${projectId}/retouch`, shareToken), { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  }, [projectId, shareToken]);

  // 마운트/projectId 변경 시 최초 조회 — real-store.tsx와 같은 패턴(effect 안에서 직접
  // async IIFE로 fetch하고 setState, 재사용 가능한 fetchOnce는 별도 함수로 분리).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchOnce();
      if (cancelled) return;
      if (data) {
        setPhotos(data.photos ?? []);
        setRetouchDone(!!data.retouchDone);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOnce]);

  const refresh = useCallback(async () => {
    const data = await fetchOnce();
    if (data) {
      setPhotos(data.photos ?? []);
      setRetouchDone(!!data.retouchDone);
    }
  }, [fetchOnce]);

  return { photos, retouchDone, loading, refresh };
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function uploadRetouched(
  projectId: string,
  shareToken: string | null,
  files: File[],
  photoIds: string[]
): Promise<{ uploaded: number; rejected: string[] }> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  if (shareToken) formData.append("share_token", shareToken);
  files.forEach((f) => formData.append("files", f));
  photoIds.forEach((id) => formData.append("photo_ids", id));
  const res = await fetch("/api/customer-select/upload/retouched", { method: "POST", headers: await authHeaders(), body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
    throw new Error(msg ?? "업로드 실패");
  }
  return res.json();
}

export async function setRetouchDecision(
  projectId: string,
  shareToken: string | null,
  versionId: string,
  decision: "confirmed" | "redo",
  redoReason?: string
) {
  const res = await fetch(`/api/customer-select/projects/${projectId}/retouch/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId, decision, redo_reason: redoReason, share_token: shareToken ?? undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "저장 실패");
  }
}

export async function markRetouchDone(projectId: string, shareToken: string | null, retouchDone: boolean) {
  await fetch(withShareToken(`/api/customer-select/projects/${projectId}/retouch`, shareToken), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retouchDone }),
  });
}

/** 사진마다 최신 회차(가장 큰 round)의 버전만 반환 — 비교/내보내기 화면은 최신 회차 기준으로 판단한다. */
export function latestVersion(photo: RetouchPhoto): RetouchVersion | null {
  if (photo.versions.length === 0) return null;
  return photo.versions.reduce((a, b) => (b.round > a.round ? b : a));
}
