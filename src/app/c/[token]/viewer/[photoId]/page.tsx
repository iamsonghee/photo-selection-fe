"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import {
  parseFilterFromSearchParams,
  buildFilterQueryString,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { StarRating, ColorTag } from "@/types";
import { differenceInDays } from "date-fns";

const COLOR_OPTIONS: { key: ColorTag; color: string; label: string }[] = [
  { key: "red", color: "#ff4757", label: "빨강" },
  { key: "yellow", color: "#f5a623", label: "노랑" },
  { key: "green", color: "#2ed573", label: "초록" },
  { key: "blue", color: "#4f7eff", label: "파랑" },
  { key: "purple", color: "#9c27b0", label: "보라" },
];

const COMMENT_MAX_LENGTH = 150;

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (params?.token as string) ?? "";
  const photoId = (params?.photoId as string) ?? "";
  const { project, photos: contextPhotos, selectedIds, Y, toggle, photoStates, updatePhotoState } = useSelection();

  const filterState = useMemo(() => parseFilterFromSearchParams(searchParams), [searchParams]);
  const filteredPhotos = useMemo(
    () => getFilteredPhotos(contextPhotos ?? [], selectedIds, photoStates, filterState),
    [contextPhotos, selectedIds, photoStates, filterState]
  );
  const currentIndex = filteredPhotos.findIndex((p) => p.id === photoId);
  const current = currentIndex >= 0 ? filteredPhotos[currentIndex] : (contextPhotos ?? []).find((p) => p.id === photoId) ?? null;

  const star = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color : undefined;
  const comment = current ? (photoStates[current.id]?.comment ?? "") : "";
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [starPressRing, setStarPressRing] = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [draftComment, setDraftComment] = useState("");

  const setStar = useCallback((s: StarRating) => { if (current) updatePhotoState(current.id, { rating: s }); }, [current, updatePhotoState]);
  const toggleStarFromKey = useCallback((s: StarRating) => {
    if (!current) return;
    const cur = photoStates[current.id]?.rating;
    updatePhotoState(current.id, { rating: cur === s ? undefined : s });
  }, [current, photoStates, updatePhotoState]);
  const setColor = useCallback((c: ColorTag | undefined) => { if (current) updatePhotoState(current.id, { color: c }); }, [current, updatePhotoState]);
  const toggleColorFromKey = useCallback((c: ColorTag) => {
    if (!current) return;
    const cur = photoStates[current.id]?.color;
    updatePhotoState(current.id, { color: cur === c ? undefined : c });
  }, [current, photoStates, updatePhotoState]);

  const N = project?.requiredCount ?? 0;
  const daysLeft = project ? differenceInDays(new Date(project.deadline), new Date()) : 0;
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[currentIndex - 1].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goNext = useCallback(() => {
    if (currentIndex >= filteredPhotos.length - 1) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[currentIndex + 1].id}${queryString}`);
  }, [currentIndex, filteredPhotos.length, filteredPhotos, router, token, queryString]);

  const goPrevWrap = useCallback(() => {
    if (!filteredPhotos.length) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[(currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goNextWrap = useCallback(() => {
    if (!filteredPhotos.length) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[(currentIndex + 1) % filteredPhotos.length].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const toggleSelect = useCallback(() => { if (!current) return; toggle(current.id); }, [current, toggle]);

  const openCommentModal = useCallback(() => { setDraftComment(comment); setCommentModalOpen(true); setCommentSheetVisible(false); }, [comment]);
  const closeCommentModal = useCallback(() => { setCommentSheetVisible(false); setTimeout(() => setCommentModalOpen(false), 200); }, []);
  const saveCommentAndClose = useCallback(() => {
    if (current) updatePhotoState(current.id, { comment: draftComment.trim() });
    setCommentSheetVisible(false);
    setTimeout(() => setCommentModalOpen(false), 200);
  }, [current, draftComment, updatePhotoState]);

  useEffect(() => { if (!commentModalOpen) return; const f = requestAnimationFrame(() => setCommentSheetVisible(true)); return () => cancelAnimationFrame(f); }, [commentModalOpen]);
  useEffect(() => { if (!project) return; if (project.status === "confirmed" || project.status === "editing") router.replace(`/c/${token}/locked`); }, [project?.status, project, token, router]);
  useEffect(() => { if (commentModalOpen && current) setDraftComment(photoStates[current.id]?.comment ?? ""); }, [commentModalOpen, current?.id, photoStates]);

  // Touch swipe
  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNextWrap() : goPrevWrap(); }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (commentModalOpen) {
      if (tag === "TEXTAREA" || tag === "INPUT") {
        if (e.key === "Escape") { e.preventDefault(); closeCommentModal(); }
        if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveCommentAndClose(); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); closeCommentModal(); }
      return;
    }
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    switch (e.code) {
      case "KeyC": e.preventDefault(); openCommentModal(); break;
      case "Digit1": toggleStarFromKey(1); setStarPressRing(1); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit2": toggleStarFromKey(2); setStarPressRing(2); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit3": toggleStarFromKey(3); setStarPressRing(3); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit4": toggleStarFromKey(4); setStarPressRing(4); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit5": toggleStarFromKey(5); setStarPressRing(5); setTimeout(() => setStarPressRing(null), 200); break;
      case "KeyQ": toggleColorFromKey("red"); setColorPressRing("red"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyW": toggleColorFromKey("yellow"); setColorPressRing("yellow"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyE": toggleColorFromKey("green"); setColorPressRing("green"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyR": toggleColorFromKey("blue"); setColorPressRing("blue"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyT": toggleColorFromKey("purple"); setColorPressRing("purple"); setTimeout(() => setColorPressRing(null), 200); break;
      case "ArrowLeft": e.preventDefault(); goPrevWrap(); break;
      case "ArrowRight": e.preventDefault(); goNextWrap(); break;
    }
  }, [commentModalOpen, goPrevWrap, goNextWrap, toggleStarFromKey, toggleColorFromKey, openCommentModal, closeCommentModal, saveCommentAndClose]);

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (commentModalOpen) return;
      if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); toggleSelect(); }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, toggleSelect, commentModalOpen]);

  if (!project || !current) return null;
  if (project.status === "confirmed" || project.status === "editing") return null;

  const displayRating = hoverRating || star || 0;
  const isCurrentSelected = selectedIds.has(current.id);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 z-30 flex h-12 items-center justify-between px-4" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }}>
        <Link href={`/c/${token}/gallery${queryString}`} className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white active:opacity-70">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3 text-[12px] text-white/70">
          <span>{currentIndex + 1} / {filteredPhotos.length}</span>
          <span className="text-white/40">·</span>
          <span>{Y}/{N}</span>
          <span className="text-white/40">·</span>
          <span>{daysLeft}일</span>
        </div>
        <button type="button" onClick={() => router.push(`/c/${token}/gallery${queryString}`)} className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {current.url ? (
          <img src={current.url} alt={getPhotoDisplayName(current)} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#5a5f78]">사진 없음</div>
        )}

        {/* Prev/Next arrows */}
        <button type="button" onClick={goPrev} disabled={currentIndex === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/60 transition hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-20">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button type="button" onClick={goNext} disabled={currentIndex === filteredPhotos.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/60 transition hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-20">
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom overlay */}
      <div className="relative z-20 border-t border-white/10 bg-[#111318]/95 px-4 py-4 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-lg space-y-3">
          {/* Star + Color row */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            {/* Stars */}
            <div className="flex items-center gap-1">
              {([1, 2, 3, 4, 5] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStar(s)}
                  onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)}
                  className={`flex h-11 w-9 items-center justify-center text-[24px] transition-all ${
                    starPressRing === s ? "scale-125" : "hover:scale-110"
                  } ${s <= displayRating ? "text-[#f5a623]" : "text-[#3a3f55]"}`}>
                  ★
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-[#1e2236]" />

            {/* Colors */}
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color === opt.key;
                const showRing = isActive || colorPressRing === opt.key;
                return (
                  <button key={opt.key} type="button" onClick={() => setColor(isActive ? undefined : opt.key)}
                    className="flex h-11 w-8 flex-col items-center justify-center gap-0.5">
                    <span className={`flex items-center justify-center rounded-full transition-all duration-200 ${showRing ? "ring-2 ring-white ring-offset-1 ring-offset-[#111318]" : ""}`}
                      style={{ width: isActive ? 28 : 22, height: isActive ? 28 : 22, backgroundColor: opt.color, opacity: isActive ? 1 : 0.5 }}>
                      {isActive && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment + Select row */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={openCommentModal}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] font-medium transition-all ${
                comment ? "border border-[#4f7eff]/30 bg-[#4f7eff]/10 text-[#4f7eff]" : "border border-[#252b3d] bg-[#1a1d24] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
              }`}>
              {comment ? `코멘트 (${comment.length}자)` : "코멘트 남기기"}
            </button>
            <button type="button" onClick={toggleSelect}
              className={`flex h-11 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-all ${
                isCurrentSelected ? "bg-[#2ed573] text-white" : "bg-[#4f7eff] text-white"
              }`}>
              {isCurrentSelected ? <><Check className="h-4 w-4" /> 선택됨</> : "+ 선택"}
            </button>
          </div>
        </div>
      </div>

      {/* Comment bottom sheet */}
      {commentModalOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60" onClick={closeCommentModal} aria-hidden />
          <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[#252b3d] bg-[#111318] p-5 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out ${commentSheetVisible ? "translate-y-0" : "translate-y-full"}`}
            role="dialog" aria-label="코멘트 입력">
            <div className="mx-auto max-w-lg">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] text-[#8b90a8]">{getPhotoDisplayName(current)} · 작가에게 전달됩니다</p>
                <button type="button" onClick={closeCommentModal} className="rounded-full p-1.5 text-[#8b90a8] hover:bg-[#1e2236] hover:text-[#e8eaf0]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative">
                <textarea value={draftComment} onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                  maxLength={COMMENT_MAX_LENGTH} placeholder="보정 요청이나 피드백을 자유롭게 남겨주세요..." autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); closeCommentModal(); }
                    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveCommentAndClose(); }
                  }}
                  className="min-h-[120px] w-full resize-none rounded-xl border border-[#252b3d] bg-[#09090d] p-4 pb-8 text-[13px] text-[#e8eaf0] outline-none transition-colors placeholder:text-[#5a5f78] focus:border-[#4f7eff]" />
                <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[#5a5f78]">{draftComment.length}/{COMMENT_MAX_LENGTH}</span>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={saveCommentAndClose} disabled={!draftComment.trim()}
                  className="rounded-xl bg-[#4f7eff] px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
