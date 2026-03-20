"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReviewStatus } from "@/types";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";

export type ReviewStateItem = {
  status: ReviewStatus;
  comment?: string | null;
};

type ReviewContextValue = {
  /** 네비게이션 간 유지되는 리뷰 사진 목록 */
  reviewPhotos: ReviewPhotoItem[];
  loadReviewPhotos: (token: string, projectId: string, status: string) => void;
  reviewPhotosLoading: boolean;
  /** photoId → { status, comment } (임시 저장, 갤러리에서 최종 제출 시 사용) */
  reviewState: Record<string, ReviewStateItem>;
  setReview: (photoId: string, status: ReviewStatus, comment?: string | null) => void;
  getReview: (photoId: string) => ReviewStateItem | null;
  clearReview: (photoId: string) => void;
  /** 제출 후 로컬 상태 초기화용 */
  resetAll: () => void;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within ReviewProvider");
  return ctx;
}

export function useReviewOptional() {
  return useContext(ReviewContext);
}

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [reviewPhotos, setReviewPhotos] = useState<ReviewPhotoItem[]>([]);
  const [reviewPhotosLoading, setReviewPhotosLoading] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);

  const loadReviewPhotos = useCallback((token: string, projectId: string, status: string) => {
    const key = `${projectId}:${status}`;
    if (loadedKeyRef.current === key) return;
    if (!token || !projectId) return;
    if (status !== "reviewing_v1" && status !== "reviewing_v2") return;
    loadedKeyRef.current = key;
    setReviewPhotosLoading(true);
    fetch(`/api/c/review?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReviewPhotos(data?.photos ?? []))
      .catch(() => setReviewPhotos([]))
      .finally(() => setReviewPhotosLoading(false));
  }, []);

  const [reviewState, setReviewState] = useState<Record<string, ReviewStateItem>>({});

  const setReview = useCallback((photoId: string, status: ReviewStatus, comment?: string | null) => {
    setReviewState((prev) => ({
      ...prev,
      [photoId]: { status, comment: comment ?? null },
    }));
  }, []);

  const getReview = useCallback(
    (photoId: string): ReviewStateItem | null => {
      return reviewState[photoId] ?? null;
    },
    [reviewState]
  );

  const clearReview = useCallback((photoId: string) => {
    setReviewState((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setReviewState({});
  }, []);

  const value = useMemo<ReviewContextValue>(
    () => ({
      reviewPhotos,
      loadReviewPhotos,
      reviewPhotosLoading,
      reviewState,
      setReview,
      getReview,
      clearReview,
      resetAll,
    }),
    [reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, setReview, getReview, clearReview, resetAll]
  );

  return (
    <ReviewContext.Provider value={value}>
      {children}
    </ReviewContext.Provider>
  );
}
