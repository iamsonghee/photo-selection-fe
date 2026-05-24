"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const borderCls = titleAccent === "danger" ? "border-rose-500/25" : "border-[#1a1a1e]";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-[#121215] border ${borderCls} rounded-t-2xl md:rounded-2xl shadow-2xl w-full flex flex-col max-h-[min(92dvh,100%)] md:max-h-[90vh] overflow-hidden`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-[#1a1a1e]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-[#1a1a1e] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6">{children}</div>

        {footer ? (
          <footer className="shrink-0 border-t border-[#1a1a1e] px-6 pt-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] md:pb-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
