"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

type TooltipPlacement = "above" | "below";

export function FieldInfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement>("above");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= spaceBelow && spaceAbove > 56;
    setPlacement(placeAbove ? "above" : "below");
    setCoords({
      left: rect.left + rect.width / 2,
      top: placeAbove ? rect.top - gap : rect.bottom + gap,
    });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              transform: placement === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              zIndex: 100_001,
            }}
            className="pointer-events-none w-max max-w-[min(16rem,calc(100vw-2rem))] px-2.5 py-2 rounded-lg text-[11px] leading-snug text-foreground bg-surface-raised border border-border shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        tabIndex={0}
        className="inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full text-subtle-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 transition-colors"
        aria-label="필드 설명"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info size={12} strokeWidth={2.25} />
      </button>
      {tooltip}
    </>
  );
}
