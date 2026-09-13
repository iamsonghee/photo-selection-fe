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
  titleAccent,
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
  titleAccent?: "danger";
  variant?: "standard" | "confirmation" | "workflow";
  mobilePresentation?: "card" | "fullscreen";
  confirmationDensity?: "default" | "compact";
  closeDisabled?: boolean;
}) {
  const registerOpen = usePhotographerModalRegister();
  const pathname = usePathname();
  const isLightRoute = isPhotographerLightRoute(pathname);
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

  const borderCls = titleAccent === "danger" ? "border-danger/25" : "border-border";
  const overlayTone = isLightRoute ? "bg-black/40" : "bg-black/70";

  if (variant === "workflow") {
    return createPortal(
      <div
        ref={rootRef}
        className={`${portalThemeClass} fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-3 sm:p-4`}
        onClick={(event) => {
          if (!closeDisabled && event.target === event.currentTarget) onClose();
        }}
        role="presentation"
      >
        <div
          data-modal-variant="workflow"
          className="flex min-w-0 max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface px-4 pb-4 pt-4 shadow-[0_4px_20px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[20px] sm:px-8 sm:pb-8 sm:pt-7"
          style={{ maxWidth }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
        >
          <header className="flex shrink-0 items-start justify-between gap-6">
            <div className="min-w-0">
              <h3 id={titleId} className="text-[20px] font-semibold leading-7 tracking-[-0.7px] text-foreground sm:text-[24px] sm:leading-9 sm:tracking-[-1.1px]">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[14px] font-normal leading-[21px] tracking-[-0.35px] text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="닫기"
              className="-mr-3 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </header>

          <div className="mt-4 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain sm:mt-5 sm:pr-1">{children}</div>

          {footer ? <footer className="mt-4 shrink-0 border-t border-border-subtle pt-4 sm:mt-5 sm:pt-5">{footer}</footer> : null}
        </div>
      </div>,
      document.body,
    );
  }

  if (variant === "confirmation") {
    const compactConfirmation = confirmationDensity === "compact";
    return createPortal(
      <div
        ref={rootRef}
        className={`${portalThemeClass} fixed inset-0 z-[100000] flex items-center justify-center p-4 ${overlayTone}`}
        onClick={(event) => {
          if (!closeDisabled && event.target === event.currentTarget) onClose();
        }}
        role="presentation"
      >
        <div
          data-modal-variant="confirmation"
          data-confirmation-density={confirmationDensity}
          className={`flex max-h-[90vh] w-full flex-col overflow-y-auto border border-border-subtle bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)] ${compactConfirmation ? "rounded-[20px] p-5" : "rounded-[24px] p-9"}`}
          style={{ maxWidth }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
        >
          <div className={`flex flex-col ${compactConfirmation ? "gap-3" : "gap-[18px]"}`}>
            <div className={compactConfirmation ? "text-left" : "px-4 text-center"}>
              <h3 id={titleId} className={compactConfirmation ? "text-[20px] font-semibold leading-7 tracking-[-0.7px] text-foreground" : "text-[24px] font-semibold leading-[48px] tracking-[-1.47px] text-foreground"}>
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className={`${compactConfirmation ? "mt-1 text-[13px] leading-5" : "text-[14px] leading-[21px]"} font-normal tracking-[-0.35px] text-muted-foreground`}>
                  {description}
                </p>
              ) : null}
            </div>
            {children}
          </div>
          {footer ? <footer className={`${compactConfirmation ? "mt-5" : "mt-7"} shrink-0`}>{footer}</footer> : null}
        </div>
      </div>,
      document.body,
    );
  }

  const mobileFullscreen = mobilePresentation === "fullscreen";

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
        data-modal-variant="standard"
        data-mobile-presentation={mobilePresentation}
        className={`flex w-full flex-col overflow-hidden bg-surface shadow-[0_18px_55px_rgba(2,56,82,0.16),0_0_1px_rgba(0,0,0,0.5)] md:max-h-[calc(100dvh-32px)] md:max-w-[var(--modal-max-width)] md:rounded-[20px] md:border ${borderCls} ${
          mobileFullscreen
            ? "h-[100dvh] max-h-[100dvh] rounded-none border-0"
            : "max-h-[calc(100dvh-24px)] rounded-[18px] border"
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
          className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle bg-surface-raised/55 px-5 py-4 md:px-6 md:py-5"
          style={mobileFullscreen ? { paddingTop: "max(16px, env(safe-area-inset-top, 0px))" } : undefined}
        >
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className={`break-keep text-[18px] font-bold leading-6 tracking-[-0.45px] ${titleAccent === "danger" ? "text-danger" : "text-foreground"}`}>
              {title}
            </h3>
            {description ? <p id={descriptionId} className="mt-1 break-keep text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="닫기"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-subtle-foreground transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-5 md:p-6">{children}</div>

        {footer ? (
          <footer
            className="shrink-0 border-t border-border-subtle bg-surface-raised/55 px-5 py-4 md:px-6"
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
