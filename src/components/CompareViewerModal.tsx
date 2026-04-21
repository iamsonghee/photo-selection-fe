"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  initialTab?: "original" | "v1" | "v2";
};

export default function CompareViewerModal({ isOpen, onClose, photos, initialIndex, initialTab }: Props) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(initialIndex);
  const [tab, setTab] = useState<"original" | "v1" | "v2">("original");
  const [splitMode, setSplitMode] = useState(false);
  const total = photos.length;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)));
    if (initialTab) setTab(initialTab);
  }, [isOpen, initialIndex, total, initialTab]);

  const current = useMemo(() => {
    if (!isOpen || total === 0) return null;
    return photos[index] ?? null;
  }, [isOpen, photos, total, index]);

  // Navigation fallback: only downgrade tab if current photo lacks that version
  useEffect(() => {
    if (!current) return;
    const v1 = current.v1 ?? current.retouched;
    setTab((prev) => {
      if (prev === "v2" && !current.v2?.url) return v1?.url ? "v1" : "original";
      if (prev === "v1" && !v1?.url) return "original";
      return prev;
    });
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
  if (!mounted) return null;

  const v1 = current.v1 ?? current.retouched;
  const hasV1 = Boolean(v1?.url);
  const hasV2 = Boolean(current.v2?.url);
  const canSplit = hasV1 || hasV2; // split 버튼 표시 조건
  const activeImage =
    tab === "original" ? current.original : tab === "v1" ? (v1 ?? current.original) : (current.v2 ?? current.original);
  const activeLabel = tab === "original" ? "원본" : tab === "v1" ? "보정본 v1" : "보정본 v2";

  // split 모드: 항상 원본 → v1 → v2 순서로 왼쪽=이전버전, 오른쪽=이후버전
  const splitLeft =
    tab === "v2" ? (v1 ?? current.original) : current.original;
  const splitLeftLabel =
    tab === "v2" ? (hasV1 ? "보정본 v1" : "원본") : "원본";
  const splitRight =
    tab === "original" ? (v1 ?? current.v2)
    : tab === "v1"     ? (v1 ?? current.original)
    :                    (current.v2 ?? current.original);
  const splitRightLabel =
    tab === "original" ? (hasV1 ? "보정본 v1" : "보정본 v2")
    : tab === "v1"     ? "보정본 v1"
    :                    "보정본 v2";

  /** document.body에 붙여 작가 레이아웃(main z-10)·사이드바(z-30)·하단 고정바(z-100) 스택 위에 표시 */
  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/95" onClick={onClose}>
      <div
        className="absolute inset-0 flex min-h-0 flex-col overflow-hidden px-4 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 shrink-0 flex items-center justify-between gap-3">
          <div className="text-sm text-zinc-200">
            <span className="font-semibold">{current.original.filename}</span>
            <span className="ml-2 text-zinc-500">{index + 1} / {total}</span>
          </div>
          <div className="flex items-center gap-2">
            {canSplit && (
              <button
                type="button"
                onClick={() => setSplitMode((s) => !s)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  splitMode
                    ? "border-zinc-400 bg-zinc-200 text-zinc-900"
                    : "border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                }`}
              >
                ⊞ 비교
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-200 hover:bg-zinc-800"
              onClick={onClose}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-2 shrink-0 flex flex-wrap items-center gap-2">
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

        <div className="relative min-h-0 flex-1">
          <div
            className={`grid h-full min-h-0 w-full overflow-hidden ${
              splitMode ? "grid-cols-1 gap-3 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {!splitMode ? (
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="mb-2 shrink-0 text-xs font-semibold text-zinc-300">{activeLabel}</div>
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-zinc-900">
                  <img
                    src={activeImage.url}
                    alt=""
                    className="max-h-full max-w-full cursor-zoom-in object-contain"
                    draggable={false}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="mb-2 shrink-0 text-xs font-semibold text-zinc-300">{splitLeftLabel}</div>
                  <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-zinc-900">
                    <img
                      src={splitLeft.url}
                      alt=""
                      className="max-h-full max-w-full cursor-zoom-in object-contain"
                      draggable={false}
                    />
                  </div>
                </div>
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="mb-2 shrink-0 text-xs font-semibold text-zinc-300">{splitRightLabel}</div>
                  <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-zinc-900">
                    <img
                      src={(splitRight ?? current.original).url}
                      alt=""
                      className="max-h-full max-w-full cursor-zoom-in object-contain"
                      draggable={false}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="이전"
            disabled={index <= 0}
            onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/90 p-2 text-zinc-100 shadow-lg disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="다음"
            disabled={index >= total - 1}
            onClick={() => setIndex((prev) => Math.min(total - 1, prev + 1))}
            className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/90 p-2 text-zinc-100 shadow-lg disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
