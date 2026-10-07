"use client";

import { ImagePlus, Loader2 } from "lucide-react";

export function PhotoUploadTile({ isUploading, progress, serverWorking = false, preparing = false, hasPhotos = true, onClick }: { isUploading: boolean; progress: number; serverWorking?: boolean; preparing?: boolean; hasPhotos?: boolean; onClick: () => void }) {
  const busy = isUploading || preparing;
  const label = preparing ? "사진 가져오는 중…" : isUploading ? serverWorking ? "처리 중…" : `${progress}%` : hasPhotos ? "사진 추가" : "사진 선택";
  return (
    <button type="button" disabled={busy} onClick={onClick} aria-label={isUploading ? `업로드 중 ${progress}%` : "사진 추가하기"} className="prj-upload-tile relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface transition-colors hover:border-accent/45 hover:bg-accent/[0.04] disabled:cursor-wait">
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
        <span className="grid size-[30px] place-items-center rounded-full border border-border bg-surface">
          {busy ? <Loader2 size={14} className="animate-spin text-accent" /> : <ImagePlus size={14} className="text-accent" />}
        </span>
        <span className={`max-w-full truncate text-xs font-medium ${busy ? "text-muted-foreground" : "text-subtle-foreground"}`}>{label}</span>
      </span>
    </button>
  );
}
