"use client";

import Link from "next/link";
import { memo } from "react";

const BRAND_ORANGE = "#ff4d00";
const FONT = "Pretendard, sans-serif";

export type BrandLogoSize = "sm" | "md";

/** md = 랜딩 헤더 기준 락업, sm은 같은 비율로 축소 */
const BAR: Record<BrandLogoSize, { mark: number; markFont: number; radius: number; text: number; gap: number }> = {
  sm: { mark: 20, markFont: 11, radius: 5.4, text: 14.5, gap: 6 },
  md: { mark: 24.96, markFont: 13.44, radius: 6.72, text: 18.24, gap: 7.2 },
};

/** 가로형 로고 — 서비스 전체 공통 락업. 어두운 배경에서는 `--brand-logo-ink`로 워드마크 색을 바꾼다. */
export const BrandLogoBar = memo(function BrandLogoBar({
  size = "md",
  className = "",
  href,
}: {
  size?: BrandLogoSize;
  className?: string;
  href?: string;
}) {
  const s = BAR[size];
  const inner = (
    <div
      role="img"
      aria-label="A-CUT"
      className={`inline-flex shrink-0 items-center ${className}`}
      style={{ gap: s.gap }}
    >
      <div
        style={{
          width: s.mark,
          height: s.mark,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND_ORANGE,
          color: "#fff",
          fontWeight: 800,
          fontSize: s.markFont,
          borderRadius: s.radius,
          fontFamily: FONT,
          lineHeight: 1,
        }}
      >
        A
      </div>
      <span
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: s.text,
          letterSpacing: "-0.04em",
          color: "var(--brand-logo-ink, #191918)",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        A-CUT<span style={{ color: BRAND_ORANGE }}>.</span>
      </span>
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
