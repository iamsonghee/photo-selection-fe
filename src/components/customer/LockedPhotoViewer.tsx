"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { PrevNextButton } from "@/components/PrevNextButton";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import type { Photo } from "@/types";

type Props = {
  token: string;
  photos: Photo[];
  initialIndex: number;
  sectionLabel: string;
  selectedPhotoIds: Set<string>;
  comments: Record<string, { comment?: string }>;
  onClose: () => void;
};

type PresignedPreview = { url: string; expiresAt: number };

function displayName(photo: Photo): string {
  return photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
}

export function LockedPhotoViewer({ token, photos, initialIndex, sectionLabel, selectedPhotoIds, comments, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [presignedPreviews, setPresignedPreviews] = useState<Map<string, PresignedPreview>>(new Map());
  const presignedPreviewCacheRef = useRef<Map<string, PresignedPreview>>(new Map());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const current = photos[activeIndex] ?? null;

  const [focusOpen, setFocusOpen] = useState(false);

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
      if (focusOpen) return;
      if (hasShortcutModifier(event)) return; // 윈도우 Alt+←/→(뒤로/앞으로 가기)와 겹치지 않게
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
  }, [focusOpen, goNext, goPrev, onClose, photos.length]);

  if (!current || typeof document === "undefined") return null;

  const filename = displayName(current);
  const hasMultiple = photos.length > 1;
  const currentSrc = presignedPreviews.get(current.id)?.url ?? viewerImageUrl(current);
  const selected = selectedPhotoIds.has(current.id);
  const comment = comments[current.id]?.comment?.trim() ?? "";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${sectionLabel} 상세보기`}
      className="locked-photo-viewer fixed inset-0 z-[300] flex flex-col bg-black text-white"
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
      <header className="relative z-10 flex min-h-[55px] items-center justify-between gap-1 border-b border-[#424242] bg-[#161a1d] px-5 md:min-h-14 md:gap-3 md:border-white/10 md:bg-black/70 md:px-4 md:py-2">
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="-ml-2 inline-flex h-11 w-8 shrink-0 items-center justify-center bg-transparent text-white md:hidden"
          aria-label="셀렉 상세보기로 돌아가기"
        >
          <ChevronLeft size={24} strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-normal md:text-sm md:font-semibold">{filename}</span>
          </div>
          <p className="mt-0.5 hidden text-[11px] text-white/45 md:block">{sectionLabel}</p>
        </div>
        <span className={`${selected ? "inline-flex" : "hidden md:inline-flex"} ml-auto shrink-0 text-base font-normal text-white md:rounded-full md:border md:px-2 md:py-0.5 md:text-[10px] md:font-semibold ${selected ? "md:border-accent/45 md:bg-accent/15 md:text-accent" : "md:border-white/15 md:bg-white/5 md:text-white/55"}`}>
          {selected ? "선택됨" : "미선택"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:inline-flex"
          aria-label="상세보기 닫기"
        >
          <X size={20} />
        </button>
      </header>

      <main
        className="locked-viewer-stage relative min-h-0 flex-1 overflow-hidden"
        style={{ cursor: "zoom-in" }}
        onClick={(event) => {
          /* 이전/다음 버튼 클릭이 집중 보기로 이어지지 않게 한다 */
          if ((event.target as HTMLElement).closest("button")) return;
          setFocusOpen(true);
        }}
      >
        <MobileViewerPinchPhoto
          key={current.id}
          src={currentSrc}
          alt={filename}
          showBadge={false}
          onZoomStateChange={setZoomed}
          /* 다른 고객 뷰어와 같은 동작 — 탭/클릭하면 사진만 남는 전체화면 */
          onSingleTap={() => setFocusOpen(true)}
        />
        {hasMultiple && (
          <div className="locked-viewer-arrows">
            <PrevNextButton direction="prev" onClick={goPrev} size="sm" align="edge" />
            <PrevNextButton direction="next" onClick={goNext} size="sm" align="edge" />
          </div>
        )}
      </main>

      <footer className="locked-viewer-footer relative z-10 flex items-center bg-black px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 md:min-h-12 md:justify-center md:border-t md:border-white/10 md:bg-black/70 md:px-4 md:py-0 md:text-xs md:text-white/55">
        <div className={`locked-viewer-comment ${comment ? "has-comment" : ""}`}>
          {comment || "코멘트 없음"}
        </div>
        <span className="hidden md:inline">{activeIndex + 1} / {photos.length}</span>
        {hasMultiple && <span className="ml-3 hidden text-white/35 md:inline">← → 이전·다음</span>}
      </footer>
      <PhotoFocusOverlay
        open={focusOpen}
        src={currentSrc}
        alt={filename}
        onClose={() => setFocusOpen(false)}
        onPrev={hasMultiple ? goPrev : undefined}
        onNext={hasMultiple ? goNext : undefined}
      />

      <style>{`
        .locked-viewer-comment {
          width: 100%;
          min-height: 48px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          padding: 0 16px;
          overflow: hidden;
          border: 0.8px solid #bfbfbf;
          border-radius: 8px;
          background: #181818;
          color: #c0c0c0;
          font: 400 15px/24px Pretendard, sans-serif;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .locked-viewer-comment.has-comment { border-color: #ff4d00; color: #fff; }
        .locked-viewer-arrows button { background: rgba(0,0,0,.18) !important; border-color: rgba(255,255,255,.12) !important; }
        .locked-viewer-stage { padding: 60px 0; box-sizing: border-box; }
        .locked-viewer-footer { min-height: calc(80px + env(safe-area-inset-bottom)); box-sizing: border-box; }
        @media (min-width: 768px) {
          .locked-viewer-stage { padding: 0; }
          .locked-viewer-footer { min-height: 48px; }
          .locked-viewer-comment { display: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
