"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useSelection, SelectionConfirmBar } from "@/contexts/SelectionContext";
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
  const { project, photos: contextPhotos, selectedIds, Y, toggle, photoStates, updatePhotoState } =
    useSelection();

  const filterState = useMemo(
    () => parseFilterFromSearchParams(searchParams),
    [searchParams]
  );
  const filteredPhotos = useMemo(
    () =>
      getFilteredPhotos(
        contextPhotos ?? [],
        selectedIds,
        photoStates,
        filterState
      ),
    [contextPhotos, selectedIds, photoStates, filterState]
  );
  const currentIndex = filteredPhotos.findIndex((p) => p.id === photoId);
  const current =
    currentIndex >= 0
      ? filteredPhotos[currentIndex]
      : (contextPhotos ?? []).find((p) => p.id === photoId) ?? null;

  const star = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color : undefined;
  const comment = current ? (photoStates[current.id]?.comment ?? "") : "";
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [starPressRing, setStarPressRing] = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const setStar = useCallback(
    (s: StarRating) => {
      if (current) updatePhotoState(current.id, { rating: s });
    },
    [current, updatePhotoState]
  );

  const toggleStarFromKey = useCallback(
    (s: StarRating) => {
      if (!current) return;
      const currentRating = photoStates[current.id]?.rating;
      if (currentRating === s) {
        updatePhotoState(current.id, { rating: undefined });
      } else {
        updatePhotoState(current.id, { rating: s });
      }
    },
    [current, photoStates, updatePhotoState]
  );

  const setColor = useCallback(
    (c: ColorTag | undefined) => {
      if (current) updatePhotoState(current.id, { color: c });
    },
    [current, updatePhotoState]
  );

  const toggleColorFromKey = useCallback(
    (c: ColorTag) => {
      if (!current) return;
      const currentColor = photoStates[current.id]?.color;
      if (currentColor === c) {
        updatePhotoState(current.id, { color: undefined });
      } else {
        updatePhotoState(current.id, { color: c });
      }
    },
    [current, photoStates, updatePhotoState]
  );

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
    const nextIndex = (currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length;
    router.push(`/c/${token}/viewer/${filteredPhotos[nextIndex].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goNextWrap = useCallback(() => {
    if (!filteredPhotos.length) return;
    const nextIndex = (currentIndex + 1) % filteredPhotos.length;
    router.push(`/c/${token}/viewer/${filteredPhotos[nextIndex].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const toggleSelect = useCallback(() => {
    if (!current) return;
    toggle(current.id);
  }, [current, toggle]);

  const openCommentModal = useCallback(() => {
    setDraftComment(comment);
    setCommentModalOpen(true);
    setCommentSheetVisible(false);
  }, [comment]);

  const closeCommentModal = useCallback(() => {
    setCommentSheetVisible(false);
    setTimeout(() => setCommentModalOpen(false), 200);
  }, []);

  useEffect(() => {
    if (!commentModalOpen) return;
    const frame = requestAnimationFrame(() => setCommentSheetVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [commentModalOpen]);

  const saveCommentAndClose = useCallback(() => {
    if (current) updatePhotoState(current.id, { comment: draftComment.trim() });
    setCommentSheetVisible(false);
    setTimeout(() => setCommentModalOpen(false), 200);
  }, [current, draftComment, updatePhotoState]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed" || project.status === "editing") {
      router.replace(`/c/${token}/locked`);
    }
  }, [project?.status, project, token, router]);

  useEffect(() => {
    if (commentModalOpen && current) {
      setDraftComment(photoStates[current.id]?.comment ?? "");
    }
  }, [commentModalOpen, current?.id, photoStates]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
        default: break;
      }
    },
    [
      commentModalOpen, goPrevWrap, goNextWrap, toggleStarFromKey, toggleColorFromKey,
      openCommentModal, closeCommentModal, saveCommentAndClose,
    ]
  );

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
    <div className="flex min-h-screen flex-col bg-[#09090d]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#1e2236] bg-[#111318]/95 px-4 py-3 backdrop-blur">
        <Link
          href={`/c/${token}/gallery${queryString}`}
          className="flex items-center gap-1 text-[#8b90a8] hover:text-[#e8eaf0] active:opacity-70"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="text-[13px] font-medium">{project.name}</span>
        </Link>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="font-mono text-[#e8eaf0]">{Y}/{N}</span>
          <span className="text-[#5a5f78]">
            {currentIndex + 1}/{filteredPhotos.length}
          </span>
          <span className="text-[#5a5f78]">기한 {daysLeft}일</span>
        </div>
      </header>

      {/* Image area */}
      <div className="relative flex flex-1 items-center justify-center bg-black">
        {current.url ? (
          <img
            src={current.url}
            alt={getPhotoDisplayName(current)}
            className="h-full w-full object-contain"
            style={{ maxHeight: "60vh" }}
          />
        ) : (
          <div className="flex aspect-video w-full max-w-2xl items-center justify-center rounded-lg bg-[#1a1d24] text-[#5a5f78]" style={{ maxHeight: "60vh" }}>
            사진 없음
          </div>
        )}
        {/* Prev/Next */}
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/60 transition-all hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === filteredPhotos.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/60 transition-all hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Controls panel */}
      <div className="border-t border-[#1e2236] bg-[#111318] p-4 pb-28">
        <div className="mx-auto max-w-lg space-y-4">
          {/* Select toggle */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={toggleSelect}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl px-6 py-2.5 text-[13px] font-medium transition-all ${
                isCurrentSelected
                  ? "border border-[#2ed573] bg-[#2ed573]/15 text-[#2ed573]"
                  : "border border-[#252b3d] bg-[#1a1d24] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
              }`}
            >
              {isCurrentSelected ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  선택됨
                </>
              ) : (
                "선택"
              )}
            </button>
          </div>

          {/* Star + Color tags */}
          <div className="flex flex-wrap items-center justify-center gap-6">
            {/* Stars */}
            <div className="flex items-center gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= displayRating;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className={`min-h-[44px] min-w-[36px] rounded-lg p-1 text-[28px] transition-all ${
                      starPressRing === s ? "scale-125" : "hover:scale-110"
                    } ${
                      filled
                        ? "bg-[#f5a623]/20 text-[#f5a623]"
                        : "border border-[#252b3d] bg-transparent text-[#3a3f55] hover:border-[#3a3f55]"
                    }`}
                  >
                    ★
                  </button>
                );
              })}
            </div>

            <div className="h-6 w-px bg-[#1e2236] hidden sm:block" />

            {/* Color dots */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color === opt.key;
                const showRing = isActive || colorPressRing === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setColor(isActive ? undefined : opt.key)}
                    className="flex min-h-[44px] flex-col items-center gap-1"
                  >
                    <span
                      className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                        showRing ? "ring-2 ring-white ring-offset-2 ring-offset-[#111318]" : ""
                      }`}
                      style={{
                        width: isActive ? 40 : 32,
                        height: isActive ? 40 : 32,
                        backgroundColor: opt.color,
                        opacity: isActive ? 1 : 0.55,
                        transform: isActive ? "scale(1.1)" : "scale(1)",
                      }}
                    >
                      {isActive && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                    </span>
                    <span className={`text-[10px] ${isActive ? "text-[#e8eaf0]" : "text-[#5a5f78]"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={openCommentModal}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all ${
                comment
                  ? "border border-[#4f7eff]/30 bg-[#4f7eff]/10 text-[#4f7eff]"
                  : "border border-[#252b3d] bg-[#1a1d24] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
              }`}
            >
              <span>💬</span>
              {comment ? `코멘트 (${comment.length}자)` : "코멘트"}
            </button>
            {comment && (
              <p className="line-clamp-2 max-w-md text-center text-[11px] text-[#8b90a8]">{comment}</p>
            )}
          </div>

          {/* Shortcuts */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShortcutsOpen((o) => !o)}
              className="text-[11px] text-[#5a5f78] transition-colors hover:text-[#8b90a8]"
            >
              {shortcutsOpen ? "단축키 접기 ▲" : "단축키 펼치기 ▼"}
            </button>
          </div>
          {shortcutsOpen && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#1e2236] pt-2 text-[11px] text-[#5a5f78]">
              <li>1~5: 별점</li>
              <li>Q,W,E,R,T: 색상</li>
              <li>C: 코멘트</li>
              <li>Space: 선택/해제</li>
              <li>← →: 이전/다음</li>
            </ul>
          )}
        </div>
      </div>

      {/* Comment bottom sheet */}
      {commentModalOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 transition-opacity"
            onClick={closeCommentModal}
            aria-hidden
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[#252b3d] bg-[#111318] p-5 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out ${
              commentSheetVisible ? "translate-y-0" : "translate-y-full"
            }`}
            role="dialog"
            aria-label="코멘트 입력"
          >
            <div className="mx-auto max-w-lg">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] text-[#8b90a8]">
                  {getPhotoDisplayName(current)} · 작가에게 전달됩니다
                </p>
                <button
                  type="button"
                  onClick={closeCommentModal}
                  className="rounded-full p-1.5 text-[#8b90a8] hover:bg-[#1e2236] hover:text-[#e8eaf0]"
                  aria-label="닫기"
                >
                  <span className="text-[18px] leading-none">×</span>
                </button>
              </div>
              <div className="relative">
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                  maxLength={COMMENT_MAX_LENGTH}
                  placeholder="보정 요청이나 피드백을 자유롭게 남겨주세요..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); closeCommentModal(); }
                    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveCommentAndClose(); }
                  }}
                  className="min-h-[120px] w-full resize-none rounded-xl border border-[#252b3d] bg-[#09090d] p-4 pb-8 pr-14 text-[13px] text-[#e8eaf0] outline-none transition-colors placeholder:text-[#5a5f78] focus:border-[#4f7eff]"
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[#5a5f78]">
                  {draftComment.length}/{COMMENT_MAX_LENGTH}
                </span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={saveCommentAndClose}
                  disabled={!draftComment.trim()}
                  className="rounded-xl bg-[#4f7eff] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <SelectionConfirmBar />
    </div>
  );
}
