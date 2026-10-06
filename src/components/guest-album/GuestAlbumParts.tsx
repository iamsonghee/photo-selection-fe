"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageIcon, Play, X } from "lucide-react";
import { useDialogAccessibility } from "@/hooks/useDialogAccessibility";
import { formatDuration, formatUploadedAt, type GuestMedia } from "@/lib/guest-album";

export function MediaThumb({ media, className = "" }: { media: GuestMedia; className?: string }) {
  // 썸네일을 못 만든 사진은 원본을, 영상은 아이콘을 보인다.
  const src = media.thumbUrl ?? (media.kind === "photo" ? media.originalUrl : null);
  return (
    <span className={`relative block overflow-hidden bg-surface-raised ${className}`}>
      {src
        ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        )
        : <span className="grid size-full place-items-center text-subtle-foreground"><ImageIcon size={24} /></span>}
      {media.kind === "video" ? (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">
          <Play size={11} fill="currentColor" aria-hidden />{media.durationSeconds ? formatDuration(media.durationSeconds) : "영상"}
        </span>
      ) : null}
    </span>
  );
}

/** 사진·영상 크게 보기. 영상은 원본을 바로 재생한다. */
export function GuestMediaViewer({ media, onClose, onPrev, onNext, actions, showUploader = true }: {
  media: GuestMedia;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  actions?: ReactNode;
  showUploader?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility({ open: true, rootRef, onClose });
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={`${media.fileName} 크게 보기`} className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
      onKeyDown={(event) => { if (event.key === "ArrowLeft") onPrev?.(); if (event.key === "ArrowRight") onNext?.(); }}>
      <div className="flex h-14 shrink-0 items-center gap-3 px-3">
        <button type="button" onClick={onClose} aria-label="닫기" className="grid size-11 place-items-center rounded-full hover:bg-white/10"><X size={22} /></button>
        <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/70">{media.fileName}</p>
        {media.kind === "photo" ? <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">{media.isOriginal ? "원본" : "줄인 사진"}</span> : null}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {media.kind === "video"
          ? <video key={media.id} src={media.originalUrl} poster={media.previewUrl ?? undefined} controls playsInline preload="metadata" className="max-h-full max-w-full" />
          : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={media.id} src={media.previewUrl ?? media.originalUrl} alt={media.fileName} className="max-h-full max-w-full object-contain" />
          )}
        {onPrev ? <button type="button" onClick={onPrev} aria-label="이전" className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60"><ChevronLeft size={24} /></button> : null}
        {onNext ? <button type="button" onClick={onNext} aria-label="다음" className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60"><ChevronRight size={24} /></button> : null}
      </div>
      <div className="shrink-0 px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-[720px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {showUploader ? (
            <div className="min-w-0">
              <p className="text-[14px] font-bold">{media.guestName}</p>
              {media.guestMessage ? <p className="mt-1 text-[14px] leading-6 text-white/80">“{media.guestMessage}”</p> : null}
              <p className="mt-1 text-[12px] text-white/50">{formatUploadedAt(media.uploadedAt)}에 올림</p>
            </div>
          ) : <p className="text-[12px] text-white/50">{formatUploadedAt(media.uploadedAt)}에 보냄</p>}
          {actions}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 썸네일 그리드 + 누르면 크게 보기. */
export function GuestMediaGrid({ media, showUploader = true, className = "grid-cols-3" }: { media: GuestMedia[]; showUploader?: boolean; className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? media[openIndex] : undefined;
  return (
    <>
      <ul className={`grid gap-1.5 ${className}`}>
        {media.map((item, index) => (
          <li key={item.id}>
            <button type="button" onClick={() => setOpenIndex(index)} aria-label={`${showUploader ? `${item.guestName}님이 올린 ` : ""}${item.kind === "video" ? "영상" : "사진"} 크게 보기`}
              className="block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <MediaThumb media={item} className="aspect-square" />
            </button>
          </li>
        ))}
      </ul>
      {open && openIndex !== null ? (
        <GuestMediaViewer
          media={open}
          showUploader={showUploader}
          onClose={() => setOpenIndex(null)}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
          onNext={openIndex < media.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
        />
      ) : null}
    </>
  );
}
