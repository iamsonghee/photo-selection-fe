"use client";

/** 단계 7(S10~S13) 전용 데이터 훅. 1차 real-store.tsx와 데이터 모양이 달라(사진마다 여러
 * 회차 보정본을 가짐) 별도로 둔다 — Provider 없이 훅 하나로 충분한 범위라 Context는 안 만든다. */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMER_UPLOAD_API } from "./upload-limit";

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

export function useRetouchData(projectId: string) {
  const [photos, setPhotos] = useState<RetouchPhoto[]>([]);
  const [retouchDone, setRetouchDone] = useState(false);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    const res = await fetch(`/api/customer-select/projects/${projectId}/retouch`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "보정본 정보를 불러오지 못했어요.");
    if (!data.isOwner) throw new Error("프로젝트 소유자만 보정본을 관리할 수 있어요.");
    return data;
  }, [projectId]);

  // 마운트/projectId 변경 시 최초 조회 — real-store.tsx와 같은 패턴(effect 안에서 직접
  // async IIFE로 fetch하고 setState, 재사용 가능한 fetchOnce는 별도 함수로 분리).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchOnce();
        if (cancelled) return;
        setPhotos(data.photos ?? []);
        setRetouchDone(!!data.retouchDone);
        setIsOwner(true);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "보정본 정보를 불러오지 못했어요.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOnce]);

  const refresh = useCallback(async () => {
    const data = await fetchOnce();
    setPhotos(data.photos ?? []);
    setRetouchDone(!!data.retouchDone);
    setIsOwner(true);
    setError(null);
  }, [fetchOnce]);

  return { photos, retouchDone, isOwner, error, loading, refresh };
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function uploadRetouched(
  projectId: string,
  files: File[],
  photoIds: string[],
  // 압축하면 `이름.jpg`로 바뀐다 — 원래 이름으로 보내야 BE가 돌려주는 실패 목록·저장 파일명이 선택한 파일과 맞는다.
  filenames: string[]
): Promise<{ uploaded: number; rejected: string[]; versions?: { filename: string }[] }> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  files.forEach((f, i) => formData.append("files", f, filenames[i]));
  photoIds.forEach((id) => formData.append("photo_ids", id));
  const res = await fetch(`${CUSTOMER_UPLOAD_API}/retouched`, { method: "POST", headers: await authHeaders(), body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
    throw new Error(msg ?? "업로드 실패");
  }
  return res.json();
}

/** 잘못 연결해 올린 보정본 한 장 삭제(R2 파일까지 BE가 정리). */
export async function deleteRetouched(projectId: string, versionId: string) {
  const res = await fetch(`${CUSTOMER_UPLOAD_API}/retouched/${versionId}?project_id=${encodeURIComponent(projectId)}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // FastAPI 기본 404("Not Found")는 서버에 삭제 API가 아직 없는 경우(BE 배포 전) — 영어 원문 대신 안내한다.
    const detail = typeof data.detail === "string" && data.detail !== "Not Found" ? data.detail : null;
    throw new Error(detail ?? "지금은 보정본을 지울 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function setRetouchDecision(
  projectId: string,
  versionId: string,
  decision: "confirmed" | "redo",
  redoReason?: string
) {
  const res = await fetch(`/api/customer-select/projects/${projectId}/retouch/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId, decision, redo_reason: redoReason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "저장 실패");
  }
}

export async function markRetouchDone(projectId: string, retouchDone: boolean) {
  const res = await fetch(`/api/customer-select/projects/${projectId}/retouch`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retouchDone }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "완료 상태를 저장하지 못했어요.");
  }
}

/** 사진마다 최신 회차(가장 큰 round)의 버전만 반환 — 비교/내보내기 화면은 최신 회차 기준으로 판단한다. */
export function latestVersion(photo: RetouchPhoto): RetouchVersion | null {
  if (photo.versions.length === 0) return null;
  return photo.versions.reduce((a, b) => (b.round > a.round ? b : a));
}
