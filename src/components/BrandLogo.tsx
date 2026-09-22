"use client";

import Link from "next/link";
import { memo } from "react";

/** 작가 사이드바(`Sidebar`)와 동일 톤 */
const ACCENT = "var(--accent)";
const MARK_FONT = "'JetBrains Mono', 'Space Mono', ui-monospace, monospace";
const WORD_FONT = "'Space Grotesk', 'Pretendard Variable', system-ui, sans-serif";

export type BrandLogoSize = "sm" | "md" | "lg";
export type BrandLogoVariant = "default" | "customerEntry";

const BAR: Record<BrandLogoSize, { mark: number; markFont: number; text: number; gap: number }> = {
  sm: { mark: 20, markFont: 11, text: 14, gap: 8 },
  md: { mark: 24, markFont: 14, text: 18, gap: 12 },
  lg: { mark: 28, markFont: 16, text: 22, gap: 12 },
};

function LogoMark({
  size,
  fontSize,
  variant,
}: {
  size: number;
  fontSize: number;
  variant: BrandLogoVariant;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: variant === "customerEntry" ? "#ff4d00" : ACCENT,
        color: "#fff",
        fontWeight: variant === "customerEntry" ? 800 : 700,
        fontSize,
        borderRadius: variant === "customerEntry" ? 6.72 : 2,
        fontFamily: variant === "customerEntry" ? "Pretendard, sans-serif" : MARK_FONT,
        lineHeight: 1,
      }}
    >
      A
    </div>
  );
}

function LogoWordmark({
  fontSize,
  variant,
}: {
  fontSize: number;
  variant: BrandLogoVariant;
}) {
  return (
    <span
      style={{
        fontFamily: variant === "customerEntry" ? "Pretendard, sans-serif" : WORD_FONT,
        fontWeight: variant === "customerEntry" ? 800 : 700,
        fontSize,
        letterSpacing: variant === "customerEntry" ? "-0.04em" : "-0.05em",
        color: variant === "customerEntry" ? "#191918" : "var(--foreground)",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      A-CUT{variant === "default" && <span style={{ color: ACCENT }}>.</span>}
    </span>
  );
}

/** 가로형 로고 — 작가 대시보드 사이드바 상단과 동일 락업 */
export const BrandLogoBar = memo(function BrandLogoBar({
  size = "md",
  className = "",
  href,
  priority = false,
  variant = "default",
}: {
  size?: BrandLogoSize;
  className?: string;
  href?: string;
  priority?: boolean;
  variant?: BrandLogoVariant;
}) {
  void priority;
  const s = variant === "customerEntry"
    ? { mark: 24.96, markFont: 13.44, text: 18.24, gap: 7.2 }
    : BAR[size];
  const inner = (
    <div
      role="img"
      aria-label="A-CUT"
      className={`inline-flex shrink-0 items-center ${className}`}
      style={{ gap: s.gap }}
    >
      <LogoMark size={s.mark} fontSize={s.markFont} variant={variant} />
      <LogoWordmark fontSize={s.text} variant={variant} />
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
});

/** 히어로 등 — 동일 락업을 더 크게 */
export function BrandLogoFull({
  className = "",
  maxWidth = 280,
  priority = false,
}: {
  className?: string;
  maxWidth?: number;
  priority?: boolean;
}) {
  void priority;
  const s = { mark: 40, markFont: 22, text: 28, gap: 14 };
  return (
    <div className={className} style={{ maxWidth }}>
      <div className="inline-flex items-center" style={{ gap: s.gap }} role="img" aria-label="A-CUT">
        <LogoMark size={s.mark} fontSize={s.markFont} variant="default" />
        <LogoWordmark fontSize={s.text} variant="default" />
      </div>
    </div>
  );
}
