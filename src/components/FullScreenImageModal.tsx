"use client";

import { useEffect, useRef } from "react";

export default function FullScreenImageModal({
  open,
  src,
  label,
  onClose,
}: {
  open: boolean;
  src: string;
  label?: string;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="absolute inset-0 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <div className="text-sm font-semibold tracking-tight">
            {label ?? ""}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:opacity-80"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 px-4 pb-4">
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-black/20">
            <img
              src={src}
              alt={label ?? "image"}
              className="h-full w-full object-contain select-none"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

