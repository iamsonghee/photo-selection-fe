"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useDialogAccessibility } from "@/hooks/useDialogAccessibility";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { usePhotographerModalRegister } from "@/contexts/PhotographerModalContext";
import { isPhotographerLightRoute } from "@/lib/photographer-sidebar-routes";
import lightThemeStyles from "@/styles/PhotographerLightTheme.module.css";

export function PhotographerModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 560,
  variant = "standard",
  mobilePresentation = "card",
  confirmationDensity = "default",
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  /** 파괴적 확인에서 넘기지만 제목색은 바꾸지 않는다 — 빨강은 확인 버튼 하나에만 쓴다(DESIGN.md). */
  titleAccent?: "danger";
  variant?: "standard" | "confirmation" | "workflow";
  mobilePresentation?: "card" | "fullscreen";
  confirmationDensity?: "default" | "compact";
  closeDisabled?: boolean;
}) {
  const registerOpen = usePhotographerModalRegister();
  const pathname = usePathname();
  const isLightRoute = isPhotographerLightRoute(pathname) || pathname?.startsWith("/customer-select");
  const portalThemeClass = isLightRoute ? lightThemeStyles.lightTheme : "";

  useLayoutEffect(() => {
    if (!open) return;
    const unregister = registerOpen?.();
    return () => unregister?.();
  }, [open, registerOpen]);

  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogAccessibility({ open, rootRef, onClose, closeDisabled });

  if (!open || typeof document === "undefined") return null;

  const overlayTone = isLightRoute ? "bg-black/40" : "bg-black/70";
  const mobileFullscreen = variant === "standard" && mobilePresentation === "fullscreen";

  /* 모든 팝업은 한 틀을 쓴다(2026-10-08) — 왼쪽 정렬 제목·닫기 버튼·16px 모서리·DESIGN.md Overlay 그림자.
   * variant는 쓰는 쪽의 의도(확인/작업/일반)와 테스트 훅으로만 남고 모양을 바꾸지 않는다. 폭은 maxWidth로 정한다. */
  return createPortal(
    <div
      ref={rootRef}
      className={`${portalThemeClass} fixed inset-0 z-[100000] flex items-center justify-center ${overlayTone} ${mobileFullscreen ? "p-0 md:p-4" : "p-3 sm:p-4"}`}
      onClick={(event) => {
        if (!closeDisabled && event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        data-modal-variant={variant}
        data-confirmation-density={variant === "confirmation" ? confirmationDensity : undefined}
        data-mobile-presentation={variant === "standard" ? mobilePresentation : undefined}
        className={`flex w-full min-w-0 flex-col overflow-hidden bg-surface shadow-[0_12px_32px_rgba(2,56,82,0.18)] md:max-h-[calc(100dvh-32px)] md:max-w-[var(--modal-max-width)] md:rounded-2xl md:border md:border-border-subtle ${
          mobileFullscreen
            ? "h-[100dvh] max-h-[100dvh] rounded-none border-0"
            : "max-h-[calc(100dvh-24px)] rounded-2xl border border-border-subtle"
        }`}
        style={{ "--modal-max-width": `${maxWidth}px`, maxWidth: mobileFullscreen ? undefined : maxWidth } as React.CSSProperties}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header
          className="flex shrink-0 items-start justify-between gap-4 px-5 pb-1 pt-5 md:px-6 md:pt-6"
          style={mobileFullscreen ? { paddingTop: "max(20px, env(safe-area-inset-top, 0px))" } : undefined}
        >
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="break-keep text-[20px] font-bold leading-7 tracking-[-0.5px] text-foreground">
              {title}
            </h3>
            {description ? <p id={descriptionId} className="mt-1 break-keep text-[14px] leading-[21px] tracking-[-0.35px] text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="닫기"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-subtle-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 md:px-6 md:py-5">{children}</div>

        {footer ? (
          <footer
            className="shrink-0 border-t border-border-subtle px-5 py-4 md:px-6"
            style={mobileFullscreen ? { paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" } : undefined}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
