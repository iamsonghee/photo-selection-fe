"use client";

import Link from "next/link";
import { memo } from "react";

/** 작가 사이드바(`Sidebar`)와 동일 톤 */
const ACCENT = "#ff4d00";
const MARK_FONT = "'JetBrains Mono', 'Space Mono', ui-monospace, monospace";
const WORD_FONT = "'Space Grotesk', 'Pretendard Variable', system-ui, sans-serif";

export type BrandLogoSize = "sm" | "md" | "lg";

const BAR: Record<BrandLogoSize, { mark: number; markFont: number; text: number; gap: number }> = {
  sm: { mark: 20, markFont: 11, text: 14, gap: 8 },
  md: { mark: 24, markFont: 14, text: 18, gap: 12 },
  lg: { mark: 28, markFont: 16, text: 22, gap: 12 },
};

function LogoMark({ size, fontSize }: { size: number; fontSize: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ACCENT,
        color: "#000",
        fontWeight: 700,
        fontSize,
        borderRadius: 2,
        fontFamily: MARK_FONT,
        lineHeight: 1,
      }}
    >
      A
    </div>
  );
}

function LogoWordmark({ fontSize }: { fontSize: number }) {
  return (
    <span
      style={{
        fontFamily: WORD_FONT,
        fontWeight: 700,
        fontSize,
        letterSpacing: "-0.05em",
        color: "#fff",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      A-CUT<span style={{ color: ACCENT }}>.</span>
    </span>
  );
}

/** 가로형 로고 — 작가 대시보드 사이드바 상단과 동일 락업 */
export const BrandLogoBar = memo(function BrandLogoBar({
  size = "md",
  className = "",
  href,
  priority = false,
}: {
  size?: BrandLogoSize;
  className?: string;
  href?: string;
  priority?: boolean;
}) {
  void priority;
  const s = BAR[size];
  const inner = (
    <div
      role="img"
      aria-label="A-CUT"
      className={`inline-flex shrink-0 items-center ${className}`}
      style={{ gap: s.gap }}
    >
      <LogoMark size={s.mark} fontSize={s.markFont} />
      <LogoWordmark fontSize={s.text} />
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
        <LogoMark size={s.mark} fontSize={s.markFont} />
        <LogoWordmark fontSize={s.text} />
      </div>
    </div>
  );
}
