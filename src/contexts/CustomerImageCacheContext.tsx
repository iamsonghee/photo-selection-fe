"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createThumbLoadQueue, type ThumbLoadQueue } from "@/lib/thumb-load-queue";

export type PresignedThumb = { url: string; expiresAt: number };

type CustomerImageCacheContextValue = {
  thumbUrls: ReadonlyMap<string, PresignedThumb>;
  thumbQueue: ThumbLoadQueue;
  ensureThumbUrls: (photoIds: string[]) => Promise<void>;
  refreshThumbUrl: (photoId: string) => Promise<void>;
};

// UUID 200개를 GET query에 넣으면 일부 프록시의 8KB request-line 한계에 근접한다.
// API 상한은 200이지만 클라이언트 batch는 안전하게 100을 유지하고 batch끼리 병렬 처리한다.
const THUMB_PRESIGN_BATCH_MAX = 100;
const THUMB_CACHE_MAX = 500;
const THUMB_EXPIRY_SAFETY_SECONDS = 30;

const CustomerImageCacheContext = createContext<CustomerImageCacheContextValue | null>(null);

export function useCustomerImageCache() {
  const context = useContext(CustomerImageCacheContext);
  if (!context) throw new Error("useCustomerImageCache must be used within CustomerImageCacheProvider");
  return context;
}

export function CustomerImageCacheProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const cacheRef = useRef<Map<string, PresignedThumb>>(new Map());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [thumbUrls, setThumbUrls] = useState<Map<string, PresignedThumb>>(() => new Map());
  // 작가 원본 갤러리와 같은 동시성. 실제 마운트는 IntersectionObserver로 제한되므로
  // 화면 밖 수백 장이 한꺼번에 다운로드되지는 않는다.
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));

  const storeThumbUrls = useCallback((data: Record<string, PresignedThumb>) => {
    const now = Math.floor(Date.now() / 1000);
    const next = new Map(cacheRef.current);

    for (const [photoId, info] of Object.entries(data)) {
      if (!info?.url || info.expiresAt <= now + THUMB_EXPIRY_SAFETY_SECONDS) continue;
      next.delete(photoId);
      next.set(photoId, info);
    }

    for (const [photoId, info] of next) {
      if (info.expiresAt <= now + THUMB_EXPIRY_SAFETY_SECONDS) next.delete(photoId);
    }
    while (next.size > THUMB_CACHE_MAX) {
      const oldestId = next.keys().next().value as string | undefined;
      if (!oldestId) break;
      next.delete(oldestId);
    }

    cacheRef.current = next;
    setThumbUrls(next);
  }, []);

  const ensureThumbUrls = useCallback(async (photoIds: string[]) => {
    if (!token || photoIds.length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    const uniqueIds = [...new Set(photoIds)];
    const idsToFetch: string[] = [];

    for (const photoId of uniqueIds) {
      const cached = cacheRef.current.get(photoId);
      if (cached && cached.expiresAt > now + THUMB_EXPIRY_SAFETY_SECONDS) continue;
      if (cached) cacheRef.current.delete(photoId);
      if (pendingIdsRef.current.has(photoId)) continue;
      pendingIdsRef.current.add(photoId);
      idsToFetch.push(photoId);
    }
    if (idsToFetch.length === 0) return;

    try {
      const batches = Array.from(
        { length: Math.ceil(idsToFetch.length / THUMB_PRESIGN_BATCH_MAX) },
        (_, index) => idsToFetch.slice(
          index * THUMB_PRESIGN_BATCH_MAX,
          (index + 1) * THUMB_PRESIGN_BATCH_MAX
        )
      );
      await Promise.all(batches.map(async (batch) => {
        const response = await fetch(
          `/api/c/presign-thumbs?token=${encodeURIComponent(token)}&photoIds=${batch.join(",")}`
        );
        if (!response.ok) {
          console.warn("[customer-image-cache] presign-thumbs", response.status);
          return;
        }
        const data = (await response.json()) as { presignedUrls?: Record<string, PresignedThumb> };
        storeThumbUrls(data.presignedUrls ?? {});
      }));
    } catch (error) {
      console.warn("[customer-image-cache] presign batch error", error);
    } finally {
      idsToFetch.forEach((photoId) => pendingIdsRef.current.delete(photoId));
    }
  }, [storeThumbUrls, token]);

  const refreshThumbUrl = useCallback(async (photoId: string) => {
    if (!photoId) return;
    const next = new Map(cacheRef.current);
    next.delete(photoId);
    cacheRef.current = next;
    pendingIdsRef.current.delete(photoId);
    setThumbUrls(next);
    await ensureThumbUrls([photoId]);
  }, [ensureThumbUrls]);

  const value = useMemo<CustomerImageCacheContextValue>(() => ({
    thumbUrls,
    thumbQueue,
    ensureThumbUrls,
    refreshThumbUrl,
  }), [thumbUrls, thumbQueue, ensureThumbUrls, refreshThumbUrl]);

  return (
    <CustomerImageCacheContext.Provider value={value}>
      {children}
    </CustomerImageCacheContext.Provider>
  );
}
