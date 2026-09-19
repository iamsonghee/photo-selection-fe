"use client";

/**
 * 고객 직접 셀렉 — 단계 6(실제 API 연동). mock-store.tsx와 같은 Provider/훅 모양을 유지해
 * 화면 컴포넌트 쪽 변경을 최소화했다. 참가자 식별은 계정이 아니라 "이 브라우저가 이
 * 프로젝트에서 어떤 색으로 참여 중인가"를 localStorage에 남기는 방식이다(단계 1 결정 —
 * 공유 링크 참가자는 로그인하지 않음).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColorTag, Photo, StarRating } from "@/types";

export const COLOR_PALETTE: { id: ColorTag; hex: string }[] = [
  { id: "red", hex: "#ef4444" },
  { id: "blue", hex: "#3b82f6" },
  { id: "green", hex: "#22c55e" },
  { id: "yellow", hex: "#f59e0b" },
  { id: "purple", hex: "#8b5cf6" },
];

export interface ProjectView {
  id: string;
  name: string;
  shootType: string;
  target: number;
  photoCount: number;
  uploaded: boolean;
  photos: Photo[];
  selectedIds: string[];
  photoStates: Record<string, { rating?: StarRating; color?: ColorTag[]; comment?: string }>;
  participantDone: Record<string, boolean>;
  participantNicknames: Record<string, string>;
  exported: boolean;
  shareToken: string;
}

function emptyProject(id: string): ProjectView {
  return {
    id,
    name: "",
    shootType: "",
    target: 30,
    photoCount: 0,
    uploaded: false,
    photos: [],
    selectedIds: [],
    photoStates: {},
    participantDone: {},
    participantNicknames: {},
    exported: false,
    shareToken: "",
  };
}

function identityKey(projectId: string) {
  return `acut:customer-select:identity:${projectId}`;
}

function loadStoredIdentity(projectId: string): ColorTag | null {
  try {
    return (window.localStorage.getItem(identityKey(projectId)) as ColorTag) || null;
  } catch {
    return null;
  }
}

function saveStoredIdentity(projectId: string, color: ColorTag) {
  try {
    window.localStorage.setItem(identityKey(projectId), color);
  } catch {
    /* 저장소 접근 불가 — 다음 방문에서 다시 슬롯을 배정받는다 */
  }
}

interface StoreValue {
  project: ProjectView;
  hydrated: boolean;
  isOwner: boolean;
  currentIdentity: ColorTag;
  shareUrl: string;
  update: (patch: { exported?: boolean }) => void;
  toggleSelect: (photoId: string) => void;
  toggleLike: (photoId: string, identity: ColorTag) => void;
  setStar: (photoId: string, star: StarRating | 0) => void;
  setComment: (photoId: string, text: string) => void;
  toggleDone: (identity: ColorTag) => void;
  setNickname: (nickname: string) => void;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function CustomerSelectStoreProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("share_token");
  const [project, setProject] = useState<ProjectView>(() => emptyProject(projectId));
  const [hydrated, setHydrated] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentIdentity, setCurrentIdentityState] = useState<ColorTag>("red");
  const claimedRef = useRef(false);

  const apiGet = useCallback(async () => {
    const qs = shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : "";
    const res = await fetch(`/api/customer-select/projects/${projectId}${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { project: ProjectView; isOwner: boolean };
  }, [projectId, shareToken]);

  const apiPost = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      await fetch(`/api/customer-select/projects/${projectId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shareToken ? { ...body, share_token: shareToken } : body),
      }).catch(() => {});
    },
    [projectId, shareToken]
  );

  const refresh = useCallback(async () => {
    const data = await apiGet();
    if (!data) return;
    setProject(data.project);
    setIsOwner(data.isOwner);
    return;
  }, [apiGet]);

  // 마운트 시 한 번: 프로젝트를 불러오고, 이 브라우저의 참가자 슬롯(색)을 정하거나 새로 배정한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await apiGet();
      if (cancelled || !data) {
        setHydrated(true);
        return;
      }
      setProject(data.project);
      setIsOwner(data.isOwner);

      const stored = loadStoredIdentity(projectId);
      if (stored) {
        setCurrentIdentityState(stored);
      } else if (!claimedRef.current) {
        claimedRef.current = true;
        const taken = new Set(Object.keys(data.project.participantNicknames));
        const next = COLOR_PALETTE.find((c) => !taken.has(c.id))?.id ?? "red";
        saveStoredIdentity(projectId, next);
        setCurrentIdentityState(next);
        await apiPost("/participants", { color: next, nickname: "" });
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const update = useCallback(
    (patch: { exported?: boolean }) => {
      setProject((prev) => ({ ...prev, ...patch }));
      if (typeof patch.exported === "boolean") {
        fetch(`/api/customer-select/projects/${projectId}${shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : ""}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exported: patch.exported }),
        }).catch(() => {});
      }
    },
    [projectId, shareToken]
  );

  const toggleSelect = useCallback(
    (photoId: string) => {
      setProject((prev) => {
        const has = prev.selectedIds.includes(photoId);
        const next = has ? prev.selectedIds.filter((id) => id !== photoId) : [...prev.selectedIds, photoId];
        apiPost("/selections", { photo_id: photoId, is_selected: !has });
        return { ...prev, selectedIds: next };
      });
    },
    [apiPost]
  );

  const toggleLike = useCallback(
    (photoId: string, identity: ColorTag) => {
      setProject((prev) => {
        const current = prev.photoStates[photoId]?.color ?? [];
        const has = current.includes(identity);
        const nextColor = has ? current.filter((c) => c !== identity) : [...current, identity];
        apiPost("/selections", { photo_id: photoId, color_op: { color: identity, add: !has } });
        return { ...prev, photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], color: nextColor } } };
      });
    },
    [apiPost]
  );

  const setStar = useCallback(
    (photoId: string, star: StarRating | 0) => {
      setProject((prev) => ({
        ...prev,
        photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], rating: star === 0 ? undefined : star } },
      }));
      apiPost("/selections", { photo_id: photoId, rating: star === 0 ? null : star });
    },
    [apiPost]
  );

  const setComment = useCallback(
    (photoId: string, text: string) => {
      const trimmed = text.trim() || undefined;
      setProject((prev) => ({
        ...prev,
        photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], comment: trimmed } },
      }));
      apiPost("/selections", { photo_id: photoId, comment: trimmed ?? null });
    },
    [apiPost]
  );

  const toggleDone = useCallback(
    (identity: ColorTag) => {
      setProject((prev) => {
        const next = !prev.participantDone[identity];
        apiPost("/participants", { color: identity, done: next });
        return { ...prev, participantDone: { ...prev.participantDone, [identity]: next } };
      });
    },
    [apiPost]
  );

  const setNickname = useCallback(
    (nickname: string) => {
      setProject((prev) => ({ ...prev, participantNicknames: { ...prev.participantNicknames, [currentIdentity]: nickname } }));
      apiPost("/participants", { color: currentIdentity, nickname });
    },
    [apiPost, currentIdentity]
  );

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !project.shareToken) return "";
    return `${window.location.origin}/customer-select/${projectId}/select?share_token=${project.shareToken}`;
  }, [projectId, project.shareToken]);

  const value = useMemo<StoreValue>(
    () => ({ project, hydrated, isOwner, currentIdentity, shareUrl, update, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, refresh }),
    [project, hydrated, isOwner, currentIdentity, shareUrl, update, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, refresh]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCustomerSelectStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useCustomerSelectStore must be used within CustomerSelectStoreProvider");
  return ctx;
}

/* ── 파생 계산 — mock-store.tsx와 동일 규칙, 참가자 목록만 고정 2명이 아니라 실제 참여자 기준 ── */

function activeColors(project: ProjectView): ColorTag[] {
  return Object.keys(project.participantNicknames) as ColorTag[];
}

export function activeParticipants(project: ProjectView): { id: ColorTag; name: string; hex: string }[] {
  return activeColors(project).map((id) => ({
    id,
    name: project.participantNicknames[id] || "참가자",
    hex: COLOR_PALETTE.find((c) => c.id === id)?.hex ?? "#999",
  }));
}

export function reviewedPhotoIds(project: ProjectView): string[] {
  const set = new Set<string>(project.selectedIds);
  Object.entries(project.photoStates).forEach(([id, s]) => {
    if (s.rating || s.comment || (s.color && s.color.length > 0)) set.add(id);
  });
  return Array.from(set);
}

export function likedBy(project: ProjectView, identity: ColorTag): string[] {
  return Object.entries(project.photoStates)
    .filter(([, s]) => s.color?.includes(identity))
    .map(([id]) => id);
}

export function likedByEither(project: ProjectView): string[] {
  const set = new Set<string>();
  activeColors(project).forEach((id) => likedBy(project, id).forEach((pid) => set.add(pid)));
  return Array.from(set);
}

export function likedByAll(project: ProjectView): string[] {
  const colors = activeColors(project);
  if (colors.length === 0) return [];
  return likedByEither(project).filter((id) => colors.every((c) => project.photoStates[id]?.color?.includes(c)));
}

export function disagreementIds(project: ProjectView): string[] {
  const both = new Set(likedByAll(project));
  return likedByEither(project).filter((id) => !both.has(id));
}

export function tasteMatchPct(project: ProjectView): number | null {
  if (activeColors(project).length < 2) return null;
  const either = likedByEither(project).length;
  if (either === 0) return null;
  return Math.round((likedByAll(project).length / either) * 100);
}

export function bothDone(project: ProjectView): boolean {
  const colors = activeColors(project);
  return colors.length > 0 && colors.every((c) => project.participantDone[c]);
}

export function requestedPhotoIds(project: ProjectView): string[] {
  return Object.entries(project.photoStates)
    .filter(([, s]) => !!s.comment)
    .map(([id]) => id);
}
