"use client";
import type { ReactNode } from "react";

export function CustomerFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-5 py-3 bg-[#0a0a0c]/95 backdrop-blur-md border-t border-[#1a1a1e]"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom,0px))" }}
    >
      {children}
    </div>
  );
}
