"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, MessageSquare } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { LockedPhotoViewer } from "@/components/customer/LockedPhotoViewer";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { hasCustomerResultComment } from "@/lib/customer-result-comments";
import { csvEscape, downloadTextFile, sanitizeFilenamePart } from "@/lib/text-file-download";
import type { Photo } from "@/types";

type Props = {
  project: { name: string; target: number };
  photos: Photo[];
  comments: Record<string, { comment?: string }>;
};

export default function ResultViewer({ project, photos, comments }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [commentOnly, setCommentOnly] = useState(false);
  const baseName = `${sanitizeFilenamePart(project.name || "사진셀렉")}_selections`;
  const commentedPhotos = photos.filter((photo) => hasCustomerResultComment(comments[photo.id]?.comment));
  const visiblePhotos = commentOnly ? commentedPhotos : photos;

  function downloadCsv() {
    const rows = photos.map((photo) => [csvEscape(getPhotoDisplayName(photo)), csvEscape(comments[photo.id]?.comment ?? "")].join(","));
    downloadTextFile(`${baseName}.csv`, ["파일명,작가 전달 메모", ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function downloadTxt() {
    downloadTextFile(`${baseName}.txt`, photos.map(getPhotoDisplayName).join("\n"), "text/plain;charset=utf-8");
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1504px] items-center justify-between gap-4 px-5 md:px-8">
          <BrandLogoBar size="sm" href="/" />
          <span className="text-xs font-semibold text-muted-foreground">작가용 · 읽기 전용</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1504px] px-5 py-7 md:px-8 md:py-10">
        <div className="flex flex-col gap-5 border-b border-border-subtle pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold text-accent">셀렉 결과</p>
            <h1 className="mt-2 text-[26px] font-bold tracking-[-0.04em] md:text-[32px]">{project.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              선택 {photos.length.toLocaleString()}장 · 작가 전달 메모 {commentedPhotos.length.toLocaleString()}장 · 셀렉 목표 장수 {project.target.toLocaleString()}장
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={downloadCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 text-sm font-bold hover:border-border-strong"><Download size={15} />CSV</button>
            <button type="button" onClick={downloadTxt} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 text-sm font-bold hover:border-border-strong"><Download size={15} />TXT</button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2" role="group" aria-label="사진 필터">
          <button type="button" aria-pressed={!commentOnly} onClick={() => setCommentOnly(false)} className={`h-9 rounded-lg border px-4 text-[13px] font-semibold transition-colors ${!commentOnly ? "border-foreground bg-foreground text-white" : "border-border-subtle bg-white text-muted-foreground hover:border-border-strong"}`}>전체 {photos.length.toLocaleString()}</button>
          <button type="button" aria-pressed={commentOnly} disabled={commentedPhotos.length === 0} onClick={() => setCommentOnly(true)} className={`h-9 rounded-lg border px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${commentOnly ? "border-accent bg-accent text-white" : "border-border-subtle bg-white text-muted-foreground hover:border-border-strong"}`}><MessageSquare size={14} className="mr-1.5 inline" aria-hidden />작가 전달 메모 있는 사진 {commentedPhotos.length.toLocaleString()}</button>
        </div>

        {/* PC는 셀프 고객 갤러리 기준(photo-grid.ts: 최소 180px·간격 12px). 모바일은 메모를 읽을 수 있게 2열(기준 3열의 예외). */}
        <section className="mt-5 grid grid-cols-2 items-start gap-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-3" aria-label="선택된 사진">
          {visiblePhotos.map((photo, index) => {
            const comment = comments[photo.id]?.comment;
            return (
              <button key={photo.id} type="button" className="group min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" onClick={() => setViewerIndex(index)} aria-label={`${getPhotoDisplayName(photo)} 상세보기${comment ? `, 작가 전달 메모 ${comment}` : ""}`}>
                <PhotoThumbnailFrame className="relative aspect-square overflow-hidden rounded-lg bg-border-subtle">
                  <Image className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" src={photo.url} alt={getPhotoDisplayName(photo)} fill unoptimized sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw" draggable={false} />
                </PhotoThumbnailFrame>
                <div className="px-0.5 pt-2">
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{getPhotoDisplayName(photo)}</p>
                  {comment ? <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-2">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><MessageSquare size={12} aria-hidden />작가 전달 메모</span>
                    <p className="mt-1 line-clamp-2 break-words text-[12px] leading-[18px] text-foreground" title={comment}>{comment}</p>
                  </div>
                  : null}
                </div>
              </button>
            );
          })}
        </section>
      </main>

      {viewerIndex !== null ? (
        <LockedPhotoViewer
          photos={visiblePhotos}
          initialIndex={viewerIndex}
          sectionLabel="셀렉 결과"
          selectedPhotoIds={new Set(visiblePhotos.map((photo) => photo.id))}
          comments={comments}
          showCommentOnDesktop
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  );
}
