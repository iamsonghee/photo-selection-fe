"use client";
import type { ReactNode } from "react";

export function CustomerHeader({ children }: { children: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-[#1a1a1e]"
      style={{ paddingTop: "calc(12px + env(safe-area-inset-top,0px))" }}
    >
      {children}
    </header>
  );
}
