"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type CompareItem = {
  original: { url: string; filename: string };
  retouched?: { url: string; filename: string };
  v1?: { url: string; filename: string };
  v2?: { url: string; filename: string };
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  photos: CompareItem[];
  initialIndex: number;
};

export default function CompareViewerModal({ isOpen, onClose, photos, initialIndex }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [tab, setTab] = useState<"original" | "v1" | "v2">("original");
  const total = photos.length;

  useEffect(() => {
    if (!isOpen) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)));
  }, [isOpen, initialIndex, total]);

  const current = useMemo(() => {
    if (!isOpen || total === 0) return null;
    return photos[index] ?? null;
  }, [isOpen, photos, total, index]);

  useEffect(() => {
    if (!current) return;
    if (current.v2?.url) setTab("v2");
    else if (current.v1?.url || current.retouched?.url) setTab("v1");
    else setTab("original");
  }, [current]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((prev) => Math.min(total - 1, prev + 1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, total]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || !current) return null;

  const v1 = current.v1 ?? current.retouched;
  const hasV1 = Boolean(v1?.url);
  const hasV2 = Boolean(current.v2?.url);
  const singleView = hasV2;
  const activeImage =
    tab === "original" ? current.original : tab === "v1" ? (v1 ?? current.original) : (current.v2 ?? current.original);
  const activeLabel = tab === "original" ? "원본" : tab === "v1" ? "보정본 v1" : "보정본 v2";

  return (
    <div className="fixed inset-0 z-[80] bg-black/95" onClick={onClose}>
      <div className="absolute inset-0 flex flex-col px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm text-zinc-200">
            <span className="font-semibold">{current.original.filename}</span>
            <span className="ml-2 text-zinc-500">
              {index + 1} / {total}
            </span>
          </div>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-200 hover:bg-zinc-800"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("original")}
            className={`rounded px-2 py-1 text-xs ${tab === "original" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
          >
            원본
          </button>
          {hasV1 && (
            <button
              type="button"
              onClick={() => setTab("v1")}
              className={`rounded px-2 py-1 text-xs ${tab === "v1" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
            >
              보정본 v1
            </button>
          )}
          {hasV2 && (
            <button
              type="button"
              onClick={() => setTab("v2")}
              className={`rounded px-2 py-1 text-xs ${tab === "v2" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
            >
              보정본 v2
            </button>
          )}
        </div>

        <div className={`relative min-h-0 flex-1 ${singleView ? "" : "grid grid-cols-1 gap-3 md:grid-cols-2"}`}>
          {singleView ? (
            <div className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="mb-2 text-xs font-semibold text-zinc-300">{activeLabel}</div>
              <div className="min-h-0 flex-1 overflow-hidden rounded bg-zinc-900">
                <img src={activeImage.url} alt="" className="h-full w-full cursor-zoom-in object-contain" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-300">원본</div>
                <div className="min-h-0 flex-1 overflow-hidden rounded bg-zinc-900">
                  <img src={current.original.url} alt="" className="h-full w-full cursor-zoom-in object-contain" />
                </div>
              </div>
              <div className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-300">보정본 v1</div>
                <div className="min-h-0 flex-1 overflow-hidden rounded bg-zinc-900">
                  <img src={(v1 ?? current.original).url} alt="" className="h-full w-full cursor-zoom-in object-contain" />
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            aria-label="이전"
            disabled={index <= 0}
            onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-100 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="다음"
            disabled={index >= total - 1}
            onClick={() => setIndex((prev) => Math.min(total - 1, prev + 1))}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-100 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
