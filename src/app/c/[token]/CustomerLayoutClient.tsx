"use client";

import { SelectionProvider } from "@/contexts/SelectionContext";
import { ReviewProvider } from "@/contexts/ReviewContext";

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SelectionProvider>
      <ReviewProvider>
        <div className="customer-app-shell relative min-h-[100dvh] bg-[#050505] text-zinc-100">
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
            <div className="absolute -left-24 top-[6%] h-72 w-72 rounded-full bg-[#4f7eff]/12 blur-[100px]" />
            <div className="absolute right-[-12%] top-[32%] h-64 w-64 rounded-full bg-violet-500/8 blur-[90px]" />
          </div>
          <div className="relative z-10">{children}</div>
        </div>
      </ReviewProvider>
    </SelectionProvider>
  );
}
