"use client";

/**
 * 고객 직접 셀렉 — 단계 6(실제 API 연동). mock-store.tsx와 같은 Provider/훅 모양을 유지해
 * 화면 컴포넌트 쪽 변경을 최소화했다. 참가자 식별은 계정이 아니라 "이 브라우저가 이
 * 프로젝트에서 어떤 색으로 참여 중인가"를 localStorage에 남기는 방식이다(단계 1 결정 —
 * 공유 링크 참가자는 로그인하지 않음).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  shootDate?: string | null;
  selectionDeadline?: string | null;
  studioName?: string | null;
  photographerName?: string | null;
  shootRegion?: string | null;
  shootLocation?: string | null;
  target: number;
  photoCount: number;
  uploaded: boolean;
  photos: Photo[];
  selectedIds: string[];
  photoStates: Record<string, { rating?: StarRating; color?: ColorTag[]; comment?: string }>;
  participantOpinions: Record<string, Partial<Record<ColorTag, { rating?: StarRating; comment?: string }>>>;
  participantDone: Record<string, boolean>;
  participantNicknames: Record<string, string>;
  exported: boolean;
  shareToken: string;
  shareEnabled: boolean;
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
    participantOpinions: {},
    participantDone: {},
    participantNicknames: {},
    exported: false,
    shareToken: "",
    shareEnabled: false,
  };
}

function withCurrentOpinions(project: ProjectView, identity: ColorTag): ProjectView {
  const photoStates = { ...project.photoStates };
  for (const [photoId, opinions] of Object.entries(project.participantOpinions)) {
    const own = opinions[identity];
    if (!own) continue;
    photoStates[photoId] = { ...photoStates[photoId], rating: own.rating, comment: own.comment };
  }
  return { ...project, photoStates };
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
  participantReady: boolean;
  accessDenied: boolean;
  shareUrl: string;
  update: (patch: { exported?: boolean }) => void;
  toggleSelect: (photoId: string) => void;
  toggleLike: (photoId: string, identity: ColorTag) => void;
  setStar: (photoId: string, star: StarRating | 0) => void;
  setComment: (photoId: string, text: string) => void;
  toggleDone: (identity: ColorTag) => void;
  setNickname: (nickname: string) => void;
  joinParticipant: (nickname: string, color: ColorTag) => Promise<string | null>;
  refresh: () => Promise<ProjectView | undefined>;
  saveError: string | null;
  clearSaveError: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function CustomerSelectStoreProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [project, setProject] = useState<ProjectView>(() => emptyProject(projectId));
  const [hydrated, setHydrated] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentIdentity, setCurrentIdentityState] = useState<ColorTag>("red");
  const [participantReady, setParticipantReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const claimedRef = useRef(false);

  const apiGet = useCallback(async () => {
    const res = await fetch(`/api/customer-select/projects/${projectId}`, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) setAccessDenied(true);
      return null;
    }
    setAccessDenied(false);
    return (await res.json()) as { project: ProjectView; isOwner: boolean };
  }, [projectId]);

  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * 저장 실패 시 최대 2회 재시도(짧은 backoff) 후에도 실패하면 낙관적 업데이트를
   * 되돌리고 사용자에게 알린다 — 네트워크가 끊겨도 변경이 조용히 유실되지 않게 하는
   * 최소한의 보장이다(SelectionContext.tsx의 flushPatch/flushSelection과 같은 원칙,
   * 다만 폴링·버전 관리 없이 "이번 요청 하나"의 성공/실패만 다룬다 — 1차 범위에 맞춘 축소판).
   */
  const apiPost = useCallback(
    async (path: string, body: Record<string, unknown>, onFinalFailure?: () => void) => {
      const payload = JSON.stringify(body);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/customer-select/projects/${projectId}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
          if (res.ok) return;
        } catch {
          /* 네트워크 오류 — 아래에서 재시도 */
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      onFinalFailure?.();
      setSaveError("저장하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    },
    [projectId]
  );

  const refresh = useCallback(async () => {
    const data = await apiGet();
    if (!data) return;
    setProject(withCurrentOpinions(data.project, currentIdentity));
    setIsOwner(data.isOwner);
    return data.project;
  }, [apiGet, currentIdentity]);

  // 마운트 시 한 번: 프로젝트를 불러오고, 이 브라우저의 참가자 슬롯(색)을 정하거나 새로 배정한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await apiGet();
      if (cancelled || !data) {
        setHydrated(true);
        return;
      }
      setIsOwner(data.isOwner);

      const stored = loadStoredIdentity(projectId);
      const storedIsActive = Boolean(stored && Object.prototype.hasOwnProperty.call(data.project.participantNicknames, stored));
      if (!data.isOwner && !storedIsActive) {
        setProject(data.project);
        setParticipantReady(false);
        setHydrated(true);
        return;
      }
      let identity = stored;
      if (!identity && !claimedRef.current) {
        claimedRef.current = true;
        const taken = new Set(Object.keys(data.project.participantNicknames));
        identity = COLOR_PALETTE.find((c) => !taken.has(c.id))?.id ?? "red";
        saveStoredIdentity(projectId, identity);
      }
      identity ??= "red";
      setCurrentIdentityState(identity);
      setProject(withCurrentOpinions(data.project, identity));
      // 저장된 색도 서버 참가자 행이 삭제됐을 수 있으므로 멱등적으로 복구한다.
      await apiPost("/participants", { color: identity });
      setParticipantReady(true);
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const update = useCallback(
    (patch: { exported?: boolean }) => {
      if (!isOwner) return;
      setProject((prev) => ({ ...prev, ...patch }));
      if (typeof patch.exported === "boolean") {
        fetch(`/api/customer-select/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exported: patch.exported }),
        }).catch(() => {});
      }
    },
    [isOwner, projectId]
  );

  const toggleSelect = useCallback(
    (photoId: string) => {
      if (!isOwner) return;
      const hadBefore = project.selectedIds.includes(photoId);
      setProject((prev) => {
        const has = prev.selectedIds.includes(photoId);
        const next = has ? prev.selectedIds.filter((id) => id !== photoId) : [...prev.selectedIds, photoId];
        return { ...prev, selectedIds: next };
      });
      apiPost("/selections", { photo_id: photoId, is_selected: !hadBefore }, () => {
        setProject((prev) => ({
          ...prev,
          selectedIds: hadBefore ? [...prev.selectedIds, photoId] : prev.selectedIds.filter((id) => id !== photoId),
        }));
      });
    },
    [apiPost, isOwner, project.selectedIds]
  );

  const toggleLike = useCallback(
    (photoId: string, identity: ColorTag) => {
      const hadBefore = project.photoStates[photoId]?.color?.includes(identity) ?? false;
      setProject((prev) => {
        const current = prev.photoStates[photoId]?.color ?? [];
        const nextColor = hadBefore ? current.filter((c) => c !== identity) : [...current, identity];
        return { ...prev, photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], color: nextColor } } };
      });
      // 색상은 서버 RPC가 원자적으로 병합하므로 최종 실패해도 "이번 시도"만 되돌린다 —
      // 그 사이 다른 색을 추가했을 수 있는 다른 필드는 건드리지 않는다.
      apiPost("/selections", { photo_id: photoId, color_op: { color: identity, add: !hadBefore } }, () => {
        setProject((prev) => {
          const current = prev.photoStates[photoId]?.color ?? [];
          const reverted = hadBefore ? [...current, identity] : current.filter((c) => c !== identity);
          return { ...prev, photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], color: reverted } } };
        });
      });
    },
    [apiPost, project.photoStates]
  );

  const setStar = useCallback(
    (photoId: string, star: StarRating | 0) => {
      const prevRating = project.photoStates[photoId]?.rating;
      setProject((prev) => ({
        ...prev,
        photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], rating: star === 0 ? undefined : star } },
        participantOpinions: {
          ...prev.participantOpinions,
          [photoId]: { ...prev.participantOpinions[photoId], [currentIdentity]: { ...prev.participantOpinions[photoId]?.[currentIdentity], rating: star === 0 ? undefined : star } },
        },
      }));
      apiPost("/selections", { photo_id: photoId, participant_color: currentIdentity, rating: star === 0 ? null : star }, () => {
        setProject((prev) => ({
          ...prev,
          photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], rating: prevRating } },
          participantOpinions: {
            ...prev.participantOpinions,
            [photoId]: { ...prev.participantOpinions[photoId], [currentIdentity]: { ...prev.participantOpinions[photoId]?.[currentIdentity], rating: prevRating } },
          },
        }));
      });
    },
    [apiPost, currentIdentity, project.photoStates]
  );

  const setComment = useCallback(
    (photoId: string, text: string) => {
      const prevComment = project.photoStates[photoId]?.comment;
      const trimmed = text.trim() || undefined;
      setProject((prev) => ({
        ...prev,
        photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], comment: trimmed } },
        participantOpinions: {
          ...prev.participantOpinions,
          [photoId]: { ...prev.participantOpinions[photoId], [currentIdentity]: { ...prev.participantOpinions[photoId]?.[currentIdentity], comment: trimmed } },
        },
      }));
      apiPost("/selections", { photo_id: photoId, participant_color: currentIdentity, comment: trimmed ?? null }, () => {
        setProject((prev) => ({
          ...prev,
          photoStates: { ...prev.photoStates, [photoId]: { ...prev.photoStates[photoId], comment: prevComment } },
          participantOpinions: {
            ...prev.participantOpinions,
            [photoId]: { ...prev.participantOpinions[photoId], [currentIdentity]: { ...prev.participantOpinions[photoId]?.[currentIdentity], comment: prevComment } },
          },
        }));
      });
    },
    [apiPost, currentIdentity, project.photoStates]
  );

  const toggleDone = useCallback(
    (identity: ColorTag) => {
      const prevDone = project.participantDone[identity];
      setProject((prev) => ({ ...prev, participantDone: { ...prev.participantDone, [identity]: !prevDone } }));
      apiPost("/participants", { color: identity, done: !prevDone }, () => {
        setProject((prev) => ({ ...prev, participantDone: { ...prev.participantDone, [identity]: prevDone } }));
      });
    },
    [apiPost, project.participantDone]
  );

  const setNickname = useCallback(
    (nickname: string) => {
      setProject((prev) => ({ ...prev, participantNicknames: { ...prev.participantNicknames, [currentIdentity]: nickname } }));
      apiPost("/participants", { color: currentIdentity, nickname });
    },
    [apiPost, currentIdentity]
  );

  const joinParticipant = useCallback(async (nickname: string, color: ColorTag) => {
    try {
      const response = await fetch(`/api/customer-select/projects/${projectId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, nickname, claim: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const latest = await apiGet();
        if (latest) setProject(latest.project);
        return typeof result.error === "string" ? result.error : "참여 정보를 저장하지 못했어요.";
      }
      saveStoredIdentity(projectId, color);
      setCurrentIdentityState(color);
      setProject((prev) => withCurrentOpinions({
        ...prev,
        participantNicknames: { ...prev.participantNicknames, [color]: nickname.trim() },
        participantDone: { ...prev.participantDone, [color]: false },
      }, color));
      setParticipantReady(true);
      return null;
    } catch {
      return "인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
  }, [apiGet, projectId]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !project.shareEnabled || !project.shareToken) return "";
    return `${window.location.origin}/customer-select/${projectId}/select?share_token=${project.shareToken}`;
  }, [projectId, project.shareEnabled, project.shareToken]);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  const value = useMemo<StoreValue>(
    () => ({
      project, hydrated, isOwner, currentIdentity, participantReady, accessDenied, shareUrl, update, toggleSelect, toggleLike,
      setStar, setComment, toggleDone, setNickname, joinParticipant, refresh, saveError, clearSaveError,
    }),
    [project, hydrated, isOwner, currentIdentity, participantReady, accessDenied, shareUrl, update, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, joinParticipant, refresh, saveError, clearSaveError]
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
  Object.entries(project.participantOpinions).forEach(([id, opinions]) => {
    if (Object.values(opinions).some((opinion) => opinion?.rating || opinion?.comment)) set.add(id);
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
  const ids = new Set(Object.entries(project.photoStates).filter(([, state]) => Boolean(state.comment)).map(([id]) => id));
  Object.entries(project.participantOpinions)
    .filter(([, opinions]) => Object.values(opinions).some((opinion) => Boolean(opinion?.comment)))
    .forEach(([id]) => ids.add(id));
  return Array.from(ids);
}
