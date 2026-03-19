"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Side = "original" | "version";

export default function FullScreenCompareModal({
  open,
  initialSide,
  originalUrl,
  versionUrl,
  versionLabel,
  onClose,
}: {
  open: boolean;
  initialSide: Side;
  originalUrl: string;
  versionUrl: string;
  versionLabel: string;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSide(initialSide);
  }, [open, initialSide]);

  const current = useMemo(() => {
    return side === "original"
      ? { src: originalUrl, label: "원본" }
      : { src: versionUrl, label: versionLabel };
  }, [side, originalUrl, versionUrl, versionLabel]);

  const toggle = () => setSide((s) => (s === "original" ? "version" : "original"));

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent page-level navigation handlers while modal is open.
      // Use capture + stopImmediatePropagation so underlying listeners don't run.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown, { capture: true } as AddEventListenerOptions);
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
        // Only close when clicking the backdrop itself.
        if (e.target === overlayRef.current) onClose();
      }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 60) return;
        if (Math.abs(dx) < Math.abs(dy)) return;
        toggle();
      }}
    >
      <div
        className="absolute inset-0 flex flex-col"
        onClick={(e) => {
          // Prevent clicks inside modal from bubbling to backdrop/page.
          e.stopPropagation();
        }}
      >
        {/* top bar */}
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <div className="text-sm font-semibold tracking-tight">
            {current.label}
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

        {/* image */}
        <div className="flex-1 px-4 pb-4">
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-black/20">
            <img
              src={current.src}
              alt={current.label}
              className="h-full w-full object-contain select-none"
              draggable={false}
            />
          </div>
        </div>

        {/* controls */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between px-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:opacity-80"
            aria-label="이전(원본/보정본 전환)"
          >
            ←
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:opacity-80"
            aria-label="다음(원본/보정본 전환)"
          >
            →
          </button>
        </div>

        {/* dot indicator */}
        <div className="pb-5">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white">
            <span className={side === "original" ? "" : "opacity-40"}>●</span>
            <span className={side === "version" ? "" : "opacity-40"}>●</span>
          </div>
        </div>
      </div>
    </div>
  );
}

