"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import styles from "./PhotographerLightButton.module.css";

export type PhotographerLightButtonVariant = "primary" | "secondary" | "danger" | "outline";

export type PhotographerLightButtonSize = "regular" | "toolbar" | "confirmation" | "work-panel";

interface PhotographerLightButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PhotographerLightButtonVariant;
  size?: PhotographerLightButtonSize;
  pending?: boolean;
  pendingLabel?: string;
}

// Size owns typography/geometry, variant owns tone, CSS module owns PC interaction.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg whitespace-nowrap transition-colors " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const SIZE_CLASSES: Record<PhotographerLightButtonSize, string> = {
  regular: "px-5 py-2.5 text-[13px] leading-[18px] tracking-[-0.28px] active:scale-[0.98]",
  toolbar: "h-11 shrink-0 border px-4 text-[14px] leading-6 tracking-[-0.45px]",
  confirmation: "h-14 px-6 text-[16px] leading-6 tracking-[-0.32px] active:scale-[0.98]",
  "work-panel": "h-12 px-4 text-[14px] leading-5 tracking-[-0.35px]",
};

const VARIANT_CLASSES: Record<PhotographerLightButtonVariant, string> = {
  primary:
    "border-accent bg-accent hover:bg-accent/90 text-[var(--accent-foreground)] focus-visible:ring-accent/40",
  secondary:
    "bg-surface-raised hover:bg-border-subtle border border-border-subtle text-foreground focus-visible:ring-border-strong/50",
  outline:
    "bg-surface border border-border-subtle md:border-border text-foreground hover:bg-surface-raised hover:border-border-strong focus-visible:ring-accent/30",
  danger:
    "bg-danger hover:bg-danger/90 text-white focus-visible:ring-danger/35",
};

export const PhotographerLightButton = forwardRef<HTMLButtonElement, PhotographerLightButtonProps>(
  ({ variant = "primary", size = "regular", pending = false, pendingLabel, children, disabled, type = "button", className = "", ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || pending}
      aria-label={pending && pendingLabel ? pendingLabel : props["aria-label"]}
      aria-busy={pending || props["aria-busy"] || undefined}
      data-variant={variant}
      data-button-size={size}
      className={`${styles.button} relative ${BASE} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${
        size === "toolbar" ? "font-semibold" : size === "work-panel" || variant === "primary" || variant === "danger" ? "font-bold" : "font-normal"
      } ${className}`}
    >
      {pending && pendingLabel ? <>
        <span aria-hidden className="invisible">{children}</span>
        <span className="absolute inset-0 flex items-center justify-center gap-2" aria-hidden>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingLabel}
        </span>
      </> : children}
    </button>
  )
);
PhotographerLightButton.displayName = "PhotographerLightButton";
