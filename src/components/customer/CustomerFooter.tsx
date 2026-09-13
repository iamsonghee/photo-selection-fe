"use client";
import type { ReactNode } from "react";

/**
 * 고객 상태 화면 공통 하단 바.
 *
 * `CustomerHeader`와 같은 opt-in 방식이다 — 기본은 Dark Photo Workspace 톤이고,
 * 라이트 화면(잠금 갤러리 등)만 `theme="customerLight"`로 고객 라이트 팔레트를 쓴다.
 */
export function CustomerFooter({
  children,
  theme = "workspace",
}: {
  children: ReactNode;
  theme?: "workspace" | "customerLight";
}) {
  const isLight = theme === "customerLight";
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-5 py-3 border-t ${
        isLight ? "" : "bg-[#0a0a0c]/95 backdrop-blur-md border-[#1a1a1e]"
      }`}
      style={{
        paddingBottom: "calc(12px + env(safe-area-inset-bottom,0px))",
        /* color-mix()는 iOS Safari 16.2 미만에서 선언째 무효가 된다 — rgba로 직접 쓴다 */
        ...(isLight
          ? {
              background: "rgba(255,255,255,0.94)",
              borderColor: "var(--customer-divider)",
              color: "var(--customer-ink-secondary)",
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}
