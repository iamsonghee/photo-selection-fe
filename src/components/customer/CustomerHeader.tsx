"use client";
import type { ReactNode } from "react";

/**
 * 고객 상태 화면 공통 헤더.
 *
 * 기본은 Dark Photo Workspace 톤이고, 격자/목록 화면(갤러리·보정본 검토 목록)은
 * `theme="customerLight"`로 고객 라이트 팔레트를 쓴다 — `SelectionConfirmFooter`와 같은
 * opt-in 방식이라 기존 호출부(confirmed·delivered·locked 등)의 동작은 그대로 둔다.
 */
export function CustomerHeader({
  children,
  theme = "workspace",
}: {
  children: ReactNode;
  theme?: "workspace" | "customerLight";
}) {
  const isLight = theme === "customerLight";
  return (
    <header
      className={`sticky top-0 z-50 flex items-center justify-between px-5 py-3 backdrop-blur-md border-b ${
        isLight ? "" : "bg-[#0a0a0c]/90 border-[#1a1a1e]"
      }`}
      style={{
        paddingTop: "calc(12px + env(safe-area-inset-top,0px))",
        /* color-mix()는 iOS Safari 16.2 미만에서 선언째 무효가 되어 배경이 사라진다 — rgba로 직접 쓴다 */
        ...(isLight
          ? {
              background: "rgba(255,255,255,0.92)",
              borderColor: "var(--customer-divider)",
              color: "var(--customer-ink)",
            }
          : {}),
      }}
    >
      {children}
    </header>
  );
}
