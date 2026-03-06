"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
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

async function upsertSelectionApi(
  token: string,
  projectId: string,
  photoId: string,
  state: { rating?: number | null; color_tag?: string | null; comment?: string | null }
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

async function deleteSelectionApi(token: string, projectId: string, photoId: string) {
  const res = await fetch("/api/c/selections", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId, photo_id: photoId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}

async function confirmProjectApi(token: string, projectId: string) {
  const res = await fetch("/api/c/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}
import type { StarRating, ColorTag } from "@/types";

export type PhotoState = {
  rating?: StarRating;
  color?: ColorTag;
  comment?: string;
};

type SelectionContextValue = {
  project: import("@/types").Project | null;
  photos: import("@/types").Photo[];
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
  const pathname = usePathname();
  const router = useRouter();
  const token = (params?.token as string) ?? "";

  const [project, setProject] = useState<import("@/types").Project | null>(null);
  const [photos, setPhotos] = useState<import("@/types").Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setProject(null);
      setPhotos([]);
      setSelectedIds(new Set());
      setPhotoStates({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCustomerPhotos(token)
      .then((data) => {
        if (cancelled) return;
        setProject(data.project ?? null);
        setPhotos(data.photos ?? []);
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
      setPhotoStates((prev) => {
        const next = { ...prev, [photoId]: { ...prev[photoId], ...patch } };
        if (project?.id && token) {
          const state = next[photoId];
          upsertSelectionApi(token, project.id, photoId, {
            rating: state?.rating ?? null,
            color_tag: state?.color ?? null,
            comment: state?.comment ?? null,
          }).catch(console.error);
        }
        return next;
      });
    },
    [project?.id, token]
  );

  const toggle = useCallback(
    (photoId: string) => {
      if (!project?.id || !token) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(photoId)) {
          next.delete(photoId);
          deleteSelectionApi(token, project.id, photoId).catch(console.error);
        } else {
          next.add(photoId);
          upsertSelectionApi(token, project.id, photoId, {
            rating: photoStates[photoId]?.rating ?? null,
            color_tag: photoStates[photoId]?.color ?? null,
            comment: photoStates[photoId]?.comment ?? null,
          }).catch(console.error);
        }
        return next;
      });
    },
    [project?.id, token, photoStates]
  );

  const isSelected = useCallback(
    (photoId: string) => selectedIds.has(photoId),
    [selectedIds]
  );

  const Y = selectedIds.size;
  const N = project?.requiredCount ?? 0;
  const projectId = project?.id ?? null;
  const projectStatus = project?.status ?? null;

  const value = useMemo<SelectionContextValue>(
    () => ({
      project,
      photos,
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

  const showBar =
    project?.status === "selecting" &&
    (pathname?.includes("/gallery") || pathname?.includes("/viewer"));
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const canConfirm = Y === N;

  const handleFinalConfirm = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      await confirmProjectApi(token, projectId);
      setShowConfirmModal(false);
      router.push(`/c/${token}/confirmed`);
    } catch (e) {
      console.error(e);
    }
  }, [token, projectId, router]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
      {showBar && (
        <>
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-900/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-4xl flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-zinc-300">
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
                  onClick={() => setShowConfirmModal(true)}
                >
                  최종확정
                </Button>
              </div>
            </div>
          </div>
          {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <h3 className="text-lg font-semibold text-white">최종확정</h3>
                <p className="mt-2 text-sm text-zinc-400">
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
                    onClick={handleFinalConfirm}
                    disabled={!canConfirm}
                  >
                    최종확정
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </SelectionContext.Provider>
  );
}
