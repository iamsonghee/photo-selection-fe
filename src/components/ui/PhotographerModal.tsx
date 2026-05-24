"use client";

import { useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePhotographerModalRegister } from "@/contexts/PhotographerModalContext";

export function PhotographerModal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 560,
  titleAccent,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  titleAccent?: "danger";
}) {
  const registerOpen = usePhotographerModalRegister();

  useLayoutEffect(() => {
    if (!open) return;
    const unregister = registerOpen?.();
    return () => unregister?.();
  }, [open, registerOpen]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const borderCls = titleAccent === "danger" ? "border-rose-500/25" : "border-[#1a1a1e]";

  return createPortal(
    <>
      {/* Mobile: full-screen — bottom sheet 대신 전체 화면으로 chrome 겹침 방지 */}
      <div
        className="md:hidden fixed inset-0 z-[100000] flex flex-col bg-[#121215]"
        style={{ height: "100dvh", maxHeight: "100dvh" }}
        role="dialog"
        aria-modal="true"
      >
        <header
          className="shrink-0 flex items-center justify-between px-5 border-b border-[#1a1a1e] bg-[#121215]"
          style={{
            paddingTop: "max(12px, env(safe-area-inset-top, 0px))",
            paddingBottom: 12,
          }}
        >
          <h3 className="text-base font-bold text-white flex items-center gap-2 min-w-0 pr-2">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-[#1a1a1e] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {footer ? (
          <footer
            className="shrink-0 border-t border-[#1a1a1e] px-5 pt-4 bg-[#121215]"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </footer>
        ) : null}
      </div>

      {/* Desktop: centered dialog */}
      <div
        className="hidden md:flex fixed inset-0 z-[100000] items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="presentation"
      >
        <div
          className={`bg-[#121215] border ${borderCls} rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] overflow-hidden`}
          style={{ maxWidth }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <header className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[#1a1a1e]">
            <h3 className="text-base font-bold text-white flex items-center gap-2 min-w-0 pr-2">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-[#1a1a1e] hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6">{children}</div>

          {footer ? (
            <footer className="shrink-0 border-t border-[#1a1a1e] px-6 pt-4 pb-4 bg-[#121215]">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  );
}
