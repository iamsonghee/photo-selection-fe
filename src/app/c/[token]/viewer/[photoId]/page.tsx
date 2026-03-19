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

  // 숫자키(1~5): 같은 점수면 해제(0), 다르면 해당 점수로 변경
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

  // 컬러 태그 단축키(Q/W/E/R/T): 같은 색이면 해제, 다르면 해당 색으로 변경
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

  // 키보드 방향키용: 순환 이동 (첫 장 ← 마지막, 마지막 → 첫 장)
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

  // 모달 열릴 때 draftComment를 현재 코멘트로 동기화
  useEffect(() => {
    if (commentModalOpen && current) {
      setDraftComment(photoStates[current.id]?.comment ?? "");
    }
  }, [commentModalOpen, current?.id, photoStates]);

  // e.code 사용 → 한글(ㅂㅈㄷㄱㅅ) / 영문(qwert) 모두 동작
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (commentModalOpen) {
        if (tag === "TEXTAREA" || tag === "INPUT") {
          if (e.key === "Escape") {
            e.preventDefault();
            closeCommentModal();
          }
          if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            saveCommentAndClose();
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeCommentModal();
        }
        return;
      }
      if (tag === "TEXTAREA" || tag === "INPUT") return;

      switch (e.code) {
        case "KeyC":
          e.preventDefault();
          openCommentModal();
          break;
        case "Digit1":
          toggleStarFromKey(1);
          setStarPressRing(1);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit2":
          toggleStarFromKey(2);
          setStarPressRing(2);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit3":
          toggleStarFromKey(3);
          setStarPressRing(3);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit4":
          toggleStarFromKey(4);
          setStarPressRing(4);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit5":
          toggleStarFromKey(5);
          setStarPressRing(5);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "KeyQ":
          toggleColorFromKey("red");
          setColorPressRing("red");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyW":
          toggleColorFromKey("yellow");
          setColorPressRing("yellow");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyE":
          toggleColorFromKey("green");
          setColorPressRing("green");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyR":
          toggleColorFromKey("blue");
          setColorPressRing("blue");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyT":
          toggleColorFromKey("purple");
          setColorPressRing("purple");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrevWrap();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNextWrap();
          break;
        default:
          break;
      }
    },
    [
      commentModalOpen,
      goPrevWrap,
      goNextWrap,
      toggleStarFromKey,
      toggleColorFromKey,
      openCommentModal,
      closeCommentModal,
      saveCommentAndClose,
    ]
  );

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (commentModalOpen) return;

      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        toggleSelect();
      }
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

  // 별점 UI: 채워진 별 = hover 중이면 hoverRating, 아니면 star state (키보드/클릭 반영)
  const displayRating = hoverRating || star || 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b0d] pb-28">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <Link href={`/c/${token}/gallery`} className="flex items-center gap-2 text-zinc-400 hover:text-white">
          <ChevronLeft className="h-5 w-5" />
          <span className="font-medium">{project.name}</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-mono text-zinc-300">
            선택 {Y}/{N}
          </span>
          <span className="max-w-[140px] truncate text-zinc-400" title={getPhotoDisplayName(current)}>
            {getPhotoDisplayName(current)} / {filteredPhotos.length}
          </span>
          <span className="text-zinc-500">기한까지 {daysLeft}일</span>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center min-h-0">
        {current.url ? (
          <img
            src={current.url}
            alt={getPhotoDisplayName(current)}
            className="w-full h-full object-contain"
            style={{ maxHeight: "60vh" }}
          />
        ) : (
          <div
            className="w-full max-w-2xl aspect-video bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-500"
            style={{ maxHeight: "60vh" }}
          >
            사진 없음
          </div>
        )}
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-white/60 hover:text-white hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === filteredPhotos.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-white/60 hover:text-white hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      <div className="border-t border-zinc-800/80 bg-[#111318] p-5">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* 선택/해제 버튼 */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={toggleSelect}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                selectedIds.has(current.id)
                  ? "bg-primary text-white border border-primary hover:bg-primary/90"
                  : "bg-zinc-800/80 text-zinc-300 border border-zinc-700 hover:bg-zinc-700/80"
              }`}
            >
              {selectedIds.has(current.id) ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  선택됨
                </>
              ) : (
                "선택"
              )}
            </button>
          </div>

          {/* 한 줄: 별점 + 색상 태그 (이미지 바로 아래 중앙 정렬) */}
          <div className="flex flex-wrap items-center justify-center gap-8">
            {/* 별점 */}
            <div className="flex items-center gap-2">
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= displayRating;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className={`text-4xl transition-all duration-150 rounded-lg p-1 ${
                      starPressRing === s ? "scale-125" : "hover:scale-110"
                    } ${
                      filled
                        ? "text-[#f5a623] bg-[#f5a623]/20"
                        : "text-zinc-500 bg-transparent border border-zinc-600 hover:border-zinc-500"
                    }`}
                  >
                    ★
                  </button>
                );
              })}
              {star != null && star > 0 && (
                <span className="ml-1 text-sm text-zinc-400 tabular-nums">{star}점</span>
              )}
              <span className="ml-1 text-xs text-zinc-600">[1–5]</span>
            </div>

            {/* 구분선 */}
            <div className="h-8 w-px bg-zinc-700/80 hidden sm:block" />

            {/* 색상 태그 */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {COLOR_OPTIONS.map((opt) => {
                const isSelected = color === opt.key;
                const showRing = isSelected || colorPressRing === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setColor(isSelected ? undefined : opt.key)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={`rounded-full transition-all duration-200 flex items-center justify-center ${
                        showRing ? "ring-2 ring-white ring-offset-2 ring-offset-[#111318]" : ""
                      } ${colorPressRing === opt.key ? "ring-4" : ""}`}
                      style={{
                        width: isSelected ? 44 : 36,
                        height: isSelected ? 44 : 36,
                        backgroundColor: opt.color,
                        opacity: isSelected ? 1 : 0.6,
                        transform: isSelected ? "scale(1.15)" : "scale(1)",
                      }}
                    >
                      {isSelected && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
                    </span>
                    <span className={`text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
              <span className="text-xs text-zinc-600 ml-0.5">[Q W E R T]</span>
            </div>
          </div>

          {/* 코멘트 버튼 + 미리보기 */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={openCommentModal}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                comment
                  ? "bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20"
                  : "bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 hover:bg-zinc-700/80 hover:border-zinc-600"
              }`}
            >
              <span>💬</span>
              {comment ? `코멘트 (${comment.length}자)` : "코멘트"}
            </button>
            {comment ? (
              <p
                className="text-center text-xs text-zinc-400 max-w-md line-clamp-2"
                title={comment}
              >
                {comment}
              </p>
            ) : null}
          </div>

          {/* 하단: 단축키 펼치기만 (기본 숨김) */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setShortcutsOpen((o) => !o)}
              className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              {shortcutsOpen ? "단축키 접기 ▲" : "단축키 안내 펼치기 ▼"}
            </button>
          </div>
          {shortcutsOpen && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 pt-1 border-t border-zinc-800/80 mt-2">
              <li>1~5: 별점</li>
              <li>Q,W,E,R,T: 색상</li>
              <li>C: 코멘트</li>
              <li>[Space] 선택 / 해제</li>
              <li>← →: 이전/다음</li>
            </ul>
          )}
        </div>
      </div>

      {/* 코멘트 Bottom Sheet */}
      {commentModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 transition-opacity"
            onClick={closeCommentModal}
            aria-hidden
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-zinc-700 bg-[#1a1d24] p-5 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out ${
              commentSheetVisible ? "translate-y-0" : "translate-y-full"
            }`}
            role="dialog"
            aria-label="코멘트 입력"
          >
            <div className="mx-auto max-w-lg">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-zinc-400">
                  {getPhotoDisplayName(current)} · 작가에게 전달됩니다
                </p>
                <button
                  type="button"
                  onClick={closeCommentModal}
                  className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                  aria-label="닫기"
                >
                  <span className="text-lg leading-none">×</span>
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
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeCommentModal();
                    }
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      saveCommentAndClose();
                    }
                  }}
                  className="w-full bg-[#0a0b0d] border border-zinc-700 focus:border-primary rounded-xl p-4 pb-8 pr-14 text-sm text-white resize-none outline-none min-h-[120px] transition-colors"
                />
                <span className="absolute bottom-2 right-3 text-xs text-zinc-500 tabular-nums pointer-events-none">
                  {draftComment.length}/{COMMENT_MAX_LENGTH}
                </span>
              </div>
              <div className="flex gap-2 justify-end mt-3">
                <button
                  type="button"
                  onClick={saveCommentAndClose}
                  disabled={!draftComment.trim()}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
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
