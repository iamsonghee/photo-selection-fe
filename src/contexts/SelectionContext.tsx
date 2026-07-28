"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, ProgressBar } from "@/components/ui";
/** 고객 플로우: API Route 호출 (Service Role로 selections 처리) */
async function fetchCustomerPhotos(token: string) {
  const res = await fetch(`/api/c/photos?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to load");
  }
  return res.json();
}

/** 다른 세션이 저장한 selections 변경을 반영하기 위한 경량 폴링 조회. */
async function fetchSelectionsPoll(
  token: string,
  projectId: string
): Promise<{ selectedIds: string[]; photoStates: Record<string, PhotoState> } | null> {
  const res = await fetch(
    `/api/c/selections?token=${encodeURIComponent(token)}&project_id=${encodeURIComponent(projectId)}`
  );
  if (!res.ok) return null;
  return res.json();
}

async function upsertSelectionApi(
  token: string,
  projectId: string,
  photoId: string,
  state: {
    rating?: number | null;
    color_tag?: string | null;
    comment?: string | null;
    /** 생략하면 서버가 기존 선택 상태를 그대로 유지한다 (별점/코멘트만 저장할 때). */
    is_selected?: boolean;
  }
) {
  const res = await fetch("/api/c/selections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      project_id: projectId,
      photo_id: photoId,
      ...state,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}

/**
 * patch에 실제로 존재하는 키만 API payload로 변환한다 — 로컬 캐시 전체를
 * 재전송하면 다른 세션이 그 사이 저장한 값(예: 별점)을 덮어쓰게 되므로,
 * 이번에 바뀐 필드만 서버로 보낸다.
 */
function patchToApiPayload(patch: Partial<PhotoState>): {
  rating?: number | null;
  color_tag?: string | null;
  comment?: string | null;
} {
  const payload: { rating?: number | null; color_tag?: string | null; comment?: string | null } = {};
  if ("rating" in patch) payload.rating = patch.rating ?? null;
  if ("color" in patch) payload.color_tag = serializeColorTags(patch.color);
  if ("comment" in patch) payload.comment = patch.comment ?? null;
  return payload;
}

async function confirmProjectApi(token: string, projectId: string) {
  const res = await fetch("/api/c/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId }),
  });
  console.log("[확정] API 응답", res.status, await res.clone().text());
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}
import type { StarRating, ColorTag, PhotoGroupInfo } from "@/types";
import { serializeColorTags } from "@/types";

export type PhotoState = {
  rating?: StarRating;
  color?: ColorTag[];
  comment?: string;
};

type SelectionContextValue = {
  project: import("@/types").Project | null;
  photos: import("@/types").Photo[];
  photoGroups: PhotoGroupInfo[];
  selectedIds: Set<string>;
  photoStates: Record<string, PhotoState>;
  Y: number;
  N: number;
  toggle: (photoId: string) => void;
  isSelected: (photoId: string) => boolean;
  updatePhotoState: (photoId: string, patch: Partial<PhotoState>) => void;
  projectId: string | null;
  projectStatus: string | null;
  loading: boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}

export function useSelectionOptional() {
  return useContext(SelectionContext);
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";

  const [project, setProject] = useState<import("@/types").Project | null>(null);
  const [photos, setPhotos] = useState<import("@/types").Photo[]>([]);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroupInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const [loading, setLoading] = useState(true);
  // photoId별로 왕복 중인 저장 요청 수를 센다. 0보다 크면 그 사진은 폴링 응답으로
  // 덮어쓰지 않고 로컬 값을 우선한다(방금 로컬에서 바꾼 값을 폴링이 되돌리는 것 방지).
  const pendingWritesRef = useRef<Map<string, number>>(new Map());
  const beginWrite = useCallback((photoId: string) => {
    const m = pendingWritesRef.current;
    m.set(photoId, (m.get(photoId) ?? 0) + 1);
  }, []);
  const endWrite = useCallback((photoId: string) => {
    const m = pendingWritesRef.current;
    const next = (m.get(photoId) ?? 1) - 1;
    if (next <= 0) m.delete(photoId);
    else m.set(photoId, next);
  }, []);

  useEffect(() => {
    if (!token) {
      setProject(null);
      setPhotos([]);
      setPhotoGroups([]);
      setSelectedIds(new Set());
      setPhotoStates({});
      setLoading(false);
      return;
    }
    pendingWritesRef.current = new Map();
    let cancelled = false;
    setLoading(true);
    fetchCustomerPhotos(token)
      .then((data) => {
        if (cancelled) return;
        setProject(data.project ?? null);
        setPhotos(data.photos ?? []);
        setPhotoGroups(data.photoGroups ?? []);
        setSelectedIds(new Set(data.selectedIds ?? []));
        setPhotoStates(data.photoStates ?? {});
      })
      .catch((e) => {
        if (!cancelled) console.error(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updatePhotoState = useCallback(
    (photoId: string, patch: Partial<PhotoState>) => {
      // setState 업데이터는 React가 순수성 검증을 위해 두 번 호출할 수 있으므로(Strict Mode 등),
      // 그 안에서 직접 fetch를 실행하면 매번 API가 2번씩 나간다. 업데이터는 로컬 표시용 상태
      // 계산만 하고, 실제 서버 저장은 바뀐 필드(patch)만 골라 setState 호출이 끝난 뒤 한 번만 보낸다.
      setPhotoStates((prev) => {
        const prevPhoto = prev[photoId] ?? {};
        const merged: PhotoState = { ...prevPhoto, ...patch };
        // `rating: undefined`만으로는 스프레드가 이전 값을 덮어쓰지 않는 경우가 있어 명시 제거
        if ("rating" in patch && patch.rating === undefined) {
          delete merged.rating;
        }
        return { ...prev, [photoId]: merged };
      });
      if (project?.id && token) {
        const projectId = project.id;
        // 다른 세션이 그 사이 저장한 값을 덮어쓰지 않도록, 로컬 캐시 전체가 아니라
        // 이번에 실제로 바뀐 필드만 서버로 보낸다.
        const apiPayload = patchToApiPayload(patch);
        beginWrite(photoId);
        upsertSelectionApi(token, projectId, photoId, apiPayload)
          .catch(console.error)
          .finally(() => endWrite(photoId));
      }
    },
    [project?.id, token, beginWrite, endWrite]
  );

  const toggle = useCallback(
    (photoId: string) => {
      if (!project?.id || !token) return;
      const requiredCount = project.requiredCount;
      // updatePhotoState와 동일한 이유로 API 호출을 업데이터 밖으로 뺀다.
      let changed = false;
      let nextIsSelected = false;
      setSelectedIds((prev) => {
        const isSelected = prev.has(photoId);
        // 이미 목표 장수(N)를 채운 상태면 새 사진은 추가 선택할 수 없다 —
        // 그렇지 않으면 고객이 N장을 넘겨 선택해도 확정 버튼이 계속 비활성화된 채로 남는다.
        if (!isSelected && requiredCount > 0 && prev.size >= requiredCount) {
          return prev;
        }
        const next = new Set(prev);
        if (isSelected) {
          next.delete(photoId);
        } else {
          next.add(photoId);
        }
        changed = true;
        nextIsSelected = !isSelected;
        return next;
      });
      if (changed) {
        // is_selected만 명시적으로 바꾼다 — 별점/코멘트/색상은 건드리지 않고 그대로 유지한다.
        // (과거엔 로컬 캐시의 rating/color_tag/comment까지 재전송해서, 다른 세션이 그 사이
        // 저장한 값을 덮어쓰는 문제가 있었다.)
        const projectId = project.id;
        beginWrite(photoId);
        upsertSelectionApi(token, projectId, photoId, {
          is_selected: nextIsSelected,
        })
          .catch(console.error)
          .finally(() => endWrite(photoId));
      }
    },
    [project?.id, project?.requiredCount, token, beginWrite, endWrite]
  );

  const isSelected = useCallback(
    (photoId: string) => selectedIds.has(photoId),
    [selectedIds]
  );

  const Y = selectedIds.size;
  const N = project?.requiredCount ?? 0;
  const projectId = project?.id ?? null;
  const projectStatus = project?.status ?? null;

  // 다른 세션이 저장한 변경사항을 반영하기 위한 폴링. 아직 결과를 기다리는 중인
  // 저장 요청이 있는 사진(pendingWritesRef)만 로컬 값을 유지하고, 나머지는 서버 최신값으로 교체한다.
  useEffect(() => {
    if (!token || !projectId) return;
    if (projectStatus !== "selecting" && projectStatus !== "preparing") return;
    let cancelled = false;
    const POLL_MS = 5000;
    const poll = async () => {
      if (cancelled || document.hidden) return;
      const data = await fetchSelectionsPoll(token, projectId);
      if (cancelled || !data) return;
      const pending = pendingWritesRef.current;
      setSelectedIds((prev) => {
        const next = new Set(data.selectedIds);
        for (const photoId of pending.keys()) {
          if (prev.has(photoId)) next.add(photoId);
          else next.delete(photoId);
        }
        return next;
      });
      setPhotoStates((prev) => {
        const next = { ...data.photoStates };
        for (const photoId of pending.keys()) {
          if (prev[photoId] !== undefined) next[photoId] = prev[photoId];
          else delete next[photoId];
        }
        return next;
      });
    };
    const intervalId = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, projectId, projectStatus]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      project,
      photos,
      photoGroups,
      selectedIds,
      photoStates,
      Y,
      N,
      toggle,
      isSelected,
      updatePhotoState,
      projectId,
      projectStatus,
      loading,
    }),
    [
      project,
      photos,
      photoGroups,
      selectedIds,
      photoStates,
      Y,
      N,
      toggle,
      isSelected,
      updatePhotoState,
      projectId,
      projectStatus,
      loading,
    ]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** 갤러리/뷰어 페이지에서 하단 확정 바를 보여줄 때 사용. */
export function SelectionConfirmBar() {
  const ctx = useContext(SelectionContext);
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  if (!ctx) return null;
  const status = ctx.project?.status;
  if (status !== "selecting" && status !== "preparing") return null;

  const { project, Y, N, projectId } = ctx;
  const canConfirm = Y === N;

  const handleFinalConfirm = useCallback(async () => {
    console.log("[확정] 버튼 클릭됨");
    if (!projectId || !token) return;
    try {
      console.log("[확정] API 호출 시작", token);
      await confirmProjectApi(token, projectId);
      setShowConfirmModal(false);
      console.log("[확정] 성공 분기 진입, 이동 시작");
      router.push(`/c/${token}/confirmed`);
      window.location.href = `/c/${token}/confirmed`;
    } catch (e) {
      console.log("[확정] 실패 분기 진입", e);
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Project is not in selecting status")) {
        // 서버 상태와 로컬 상태가 어긋난 경우 최신 상태를 재조회 후 올바른 화면으로 이동
        try {
          const latest = await fetchCustomerPhotos(token);
          const latestStatus = latest?.project?.status as string | undefined;
          setShowConfirmModal(false);
          if (latestStatus === "confirmed") {
            window.location.href = `/c/${token}/confirmed`;
            return;
          }
          if (
            latestStatus === "editing" ||
            latestStatus === "reviewing_v1" ||
            latestStatus === "reviewing_v2"
          ) {
            window.location.href = `/c/${token}/locked`;
            return;
          }
          if (latestStatus === "delivered") {
            window.location.href = `/c/${token}/delivered`;
            return;
          }
        } catch (refreshError) {
          console.error("[확정] 상태 재조회 실패", refreshError);
        }
      }
    }
  }, [token, projectId, router]);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface-raised/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-muted-foreground">
              선택 {Y} / {N}
            </span>
            {Y < N && (
              <span className="text-sm text-danger">
                {N - Y}개 더 선택 필요
              </span>
            )}
            {Y === N && (
              <span className="text-sm text-success">
                ✅ 정확히 {N}장 선택됨
              </span>
            )}
            {Y > N && (
              <span className="text-sm text-warning">
                {N}장 초과 선택됨
              </span>
            )}
          </div>
          <ProgressBar
            value={Y}
            max={N}
            variant={Y === N ? "success" : Y < N ? "danger" : "warning"}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!canConfirm}
              onClick={() => {
                console.log("[확정] 바 버튼 클릭됨 (모달 열림)", { canConfirm, Y, N });
                setShowConfirmModal(true);
              }}
            >
              최종확정
            </Button>
          </div>
        </div>
      </div>
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6">
            <h3 className="text-lg font-semibold text-foreground">최종확정</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              정말 이 {N}장으로 선택을 완료하시겠습니까?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  console.log("[확정] 모달 버튼 클릭됨", { canConfirm });
                  handleFinalConfirm();
                }}
                disabled={!canConfirm}
              >
                최종확정
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
