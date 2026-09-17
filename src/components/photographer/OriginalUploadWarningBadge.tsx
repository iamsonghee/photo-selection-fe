"use client";

import { AlertTriangle } from "lucide-react";

export function OriginalUploadWarningBadge({ count, className = "" }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-warning ${className}`}
      title={`원본 포함 프로젝트이지만 원본 ${count.toLocaleString()}장이 업로드되지 않았습니다.`}
    >
      <AlertTriangle size={11} aria-hidden />
      원본 미업로드 {count.toLocaleString()}장
    </span>
  );
}
