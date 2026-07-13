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
import { useParams } from "next/navigation";
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

/** 새로고침 시 아직 제출하지 않은 검토(확정/재보정 선택)가 사라지지 않도록 탭 단위로 임시 저장 */
function reviewStateStorageKey(token: string) {
  return `review_state_${token}`;
}

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const token = (params?.token as string) ?? "";

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
      .then((data) => {
        const photos = (data?.photos ?? []) as ReviewPhotoItem[];
        setReviewPhotos(photos);
        setReviewState((prev) => {
          const next = { ...prev };
          for (const p of photos) {
            const ex = p.existingReview;
            if (ex && next[p.id] == null) {
              next[p.id] = { status: ex.status, comment: ex.customerComment ?? null };
            }
          }
          return next;
        });
      })
      .catch(() => {
        setReviewPhotos([]);
      })
      .finally(() => setReviewPhotosLoading(false));
  }, []);

  const [reviewState, setReviewState] = useState<Record<string, ReviewStateItem>>(() => {
    if (typeof window === "undefined" || !token) return {};
    try {
      const raw = sessionStorage.getItem(reviewStateStorageKey(token));
      return raw ? (JSON.parse(raw) as Record<string, ReviewStateItem>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!token) return;
    try {
      if (Object.keys(reviewState).length === 0) {
        sessionStorage.removeItem(reviewStateStorageKey(token));
      } else {
        sessionStorage.setItem(reviewStateStorageKey(token), JSON.stringify(reviewState));
      }
    } catch {
      // sessionStorage 사용 불가(시크릿 모드 등) — 로컬 state만으로 계속 동작
    }
  }, [reviewState, token]);

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
