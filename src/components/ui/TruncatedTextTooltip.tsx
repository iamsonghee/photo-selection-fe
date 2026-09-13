"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function TruncatedTextTooltip({ text, className }: { text: string; className?: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const element = textRef.current;
    if (!element) return false;
    if (element.scrollWidth <= element.clientWidth) return false;
    const rect = element.getBoundingClientRect();
    setCoords({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    return true;
  }, []);

  const show = useCallback(() => {
    if (updatePosition()) setOpen(true);
  }, [updatePosition]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!updatePosition()) setOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span ref={textRef} className={className} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>{text}</span>
      {open && typeof document !== "undefined" ? createPortal(
        <span
          role="tooltip"
          style={{ position: "fixed", left: coords.left, top: coords.top, transform: "translate(-50%, -100%)", zIndex: 100_001 }}
          className="pointer-events-none w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-[11px] leading-snug text-foreground shadow-lg"
        >
          {text}
        </span>,
        document.body,
      ) : null}
    </>
  );
}
