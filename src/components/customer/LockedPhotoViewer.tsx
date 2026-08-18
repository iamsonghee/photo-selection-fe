"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PrevNextButton } from "@/components/PrevNextButton";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import type { Photo } from "@/types";

type Props = {
  token: string;
  photos: Photo[];
  initialIndex: number;
  sectionLabel: string;
  selected: boolean;
  onClose: () => void;
};

type PresignedPreview = { url: string; expiresAt: number };

function displayName(photo: Photo): string {
  return photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
}

export function LockedPhotoViewer({ token, photos, initialIndex, sectionLabel, selected, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [presignedPreviews, setPresignedPreviews] = useState<Map<string, PresignedPreview>>(new Map());
  const presignedPreviewCacheRef = useRef<Map<string, PresignedPreview>>(new Map());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const current = photos[activeIndex] ?? null;

  const goPrev = useCallback(() => {
    setActiveIndex((index) => (index - 1 + photos.length) % photos.length);
  }, [photos.length]);
  const goNext = useCallback(() => {
    setActiveIndex((index) => (index + 1) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (!token || photos.length === 0) return;
    const controller = new AbortController();
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const offsets = saveData ? [0] : isMobile ? [-1, 0, 1] : [-1, 0, 1, 2];
    const now = Math.floor(Date.now() / 1000);
    const ids = [...new Set(offsets.map((offset) => photos[(activeIndex + offset + photos.length) % photos.length]?.id).filter(Boolean))];
    const missingIds = ids.filter((id) => {
      const cached = presignedPreviewCacheRef.current.get(id);
      return !cached || cached.expiresAt <= now + 60;
    });
    if (missingIds.length === 0) return;

    void fetch(`/api/c/presign-preview?token=${encodeURIComponent(token)}&photoIds=${encodeURIComponent(missingIds.join(","))}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { presignedUrls?: Record<string, PresignedPreview> } | null) => {
        if (!data?.presignedUrls) return;
        setPresignedPreviews((currentMap) => {
          const next = new Map(currentMap);
          Object.entries(data.presignedUrls ?? {}).forEach(([photoId, info]) => {
            if (info?.url && info.expiresAt > now) {
              next.set(photoId, info);
              presignedPreviewCacheRef.current.set(photoId, info);
            }
          });
          return next;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [activeIndex, photos, token]);

  const preloadUrlGroups = useMemo(
    () => photos.map((photo) => [presignedPreviews.get(photo.id)?.url ?? viewerImageUrl(photo)]),
    [photos, presignedPreviews],
  );
  useAdjacentImagePreload(preloadUrlGroups, current ? activeIndex : null, { wrap: true });

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && photos.length > 1) {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight" && photos.length > 1) {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      previouslyFocused?.focus();
    };
  }, [goNext, goPrev, onClose, photos.length]);

  if (!current || typeof document === "undefined") return null;

  const filename = displayName(current);
  const hasMultiple = photos.length > 1;
  const currentSrc = presignedPreviews.get(current.id)?.url ?? viewerImageUrl(current);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${sectionLabel} 상세보기`}
      className="fixed inset-0 z-[300] flex flex-col bg-black/95 text-white backdrop-blur-sm"
      onTouchStart={(event) => {
        if (zoomed || event.touches.length !== 1) {
          touchStartRef.current = null;
          return;
        }
        touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || zoomed || event.touches.length > 0 || !hasMultiple) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy)) return;
        if (dx > 0) goPrev();
        else goNext();
      }}
    >
      <header className="relative z-10 flex min-h-14 items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{filename}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selected ? "border-accent/45 bg-accent/15 text-accent" : "border-white/15 bg-white/5 text-white/55"}`}>
              {selected ? "선택됨" : "미선택"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-white/45">{sectionLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="상세보기 닫기"
        >
          <X size={20} />
        </button>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <MobileViewerPinchPhoto
          key={current.id}
          src={currentSrc}
          alt={filename}
          showBadge={selected}
          onZoomStateChange={setZoomed}
        />
        {hasMultiple && (
          <>
            <PrevNextButton direction="prev" onClick={goPrev} size="lg" align="edge" />
            <PrevNextButton direction="next" onClick={goNext} size="lg" align="edge" />
          </>
        )}
      </main>

      <footer className="relative z-10 flex min-h-12 items-center justify-center border-t border-white/10 bg-black/70 px-4 text-xs text-white/55">
        <span>{activeIndex + 1} / {photos.length}</span>
        {hasMultiple && <span className="ml-3 hidden text-white/35 sm:inline">← → 이전·다음</span>}
      </footer>
    </div>,
    document.body,
  );
}
