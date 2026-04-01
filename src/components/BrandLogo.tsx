"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";
import { BRAND_LOGO_PNG } from "@/lib/brand-assets";

const LOGO_SRC = BRAND_LOGO_PNG;

export type BrandLogoSize = "sm" | "md" | "lg";

const BAR: Record<BrandLogoSize, { w: number; h: number }> = {
  sm: { w: 120, h: 26 },
  md: { w: 152, h: 32 },
  lg: { w: 200, h: 42 },
};

/** 가로형 로고(이미지 상단 영역) — 네비·사이드바·모바일 헤더 */
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
  const { w, h } = BAR[size];
  const inner = (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: w, height: h, contain: "paint" }}
    >
      <img
        src={LOGO_SRC}
        alt="A CUT"
        width={w}
        height={h}
        className="block select-none"
        style={{
          width: w,
          height: h,
          objectFit: "cover",
          objectPosition: "top center",
        }}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        draggable={false}
      />
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center">
        {inner}
      </Link>
    );
  }
  return inner;
});

/** 전체 이미지(가로+세로 레이아웃 포함) — 소개 푸터·히어로 등 */
export function BrandLogoFull({
  className = "",
  maxWidth = 280,
  priority = false,
}: {
  className?: string;
  maxWidth?: number;
  priority?: boolean;
}) {
  return (
    <div className={className} style={{ maxWidth }}>
      <Image
        src={LOGO_SRC}
        alt="A CUT"
        width={1024}
        height={682}
        className="h-auto w-full"
        priority={priority}
        unoptimized
      />
    </div>
  );
}
