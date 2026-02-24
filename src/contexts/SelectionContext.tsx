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
import { loadConfirmedData, saveConfirmedData } from "@/lib/confirmed-storage";
import { getProjectByToken, getPhotosByProject } from "@/lib/mock-data";
import type { StarRating, ColorTag } from "@/types";

export type PhotoState = {
  rating?: StarRating;
  color?: ColorTag;
};

type SelectionContextValue = {
  selectedIds: Set<string>;
  photoStates: Record<string, PhotoState>;
  Y: number;
  N: number;
  toggle: (photoId: string) => void;
  isSelected: (photoId: string) => boolean;
  updatePhotoState: (photoId: string, patch: Partial<PhotoState>) => void;
  projectId: string | null;
  projectStatus: string | null;
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
  const project = getProjectByToken(token);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});

  useEffect(() => {
    if (!project?.id) {
      setSelectedIds(new Set());
      setPhotoStates({});
      return;
    }
    const photos = getPhotosByProject(project.id);
    // 확정 취소 후 재진입 시: localStorage에 저장된 선택 복원
    if (project.status === "selecting") {
      const stored = loadConfirmedData(token);
      if (stored?.selectedIds?.length) {
        setSelectedIds(new Set(stored.selectedIds));
        setPhotoStates(stored.photoStates ?? {});
        return;
      }
    }
    setSelectedIds(new Set(photos.filter((p) => p.selected).map((p) => p.id)));
    setPhotoStates(
      photos.reduce<Record<string, PhotoState>>(
        (acc, p) => ({
          ...acc,
          [p.id]: { rating: p.tag?.star, color: p.tag?.color },
        }),
        {}
      )
    );
  }, [project?.id, project?.status, token]);

  const updatePhotoState = useCallback((photoId: string, patch: Partial<PhotoState>) => {
    setPhotoStates((prev) => ({
      ...prev,
      [photoId]: { ...prev[photoId], ...patch },
    }));
  }, []);

  const toggle = useCallback((photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (photoId: string) => selectedIds.has(photoId),
    [selectedIds]
  );

  // Y = 선택된 사진 수 (반드시 selectedIds.size 로만 계산)
  const Y = selectedIds.size;
  const N = project?.requiredCount ?? 0;
  const projectId = project?.id ?? null;
  const projectStatus = project?.status ?? null;

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedIds,
      photoStates,
      Y,
      N,
      toggle,
      isSelected,
      updatePhotoState,
      projectId,
      projectStatus,
    }),
    [selectedIds, photoStates, Y, N, toggle, isSelected, updatePhotoState, projectId, projectStatus]
  );

  const showBar =
    project?.status === "selecting" &&
    (pathname?.includes("/gallery") || pathname?.includes("/viewer"));
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const canConfirm = Y === N;

  const handleFinalConfirm = useCallback(() => {
    saveConfirmedData(token, selectedIds, photoStates);
    setShowConfirmModal(false);
    router.push(`/c/${token}/confirmed`);
  }, [token, selectedIds, photoStates, router]);

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
