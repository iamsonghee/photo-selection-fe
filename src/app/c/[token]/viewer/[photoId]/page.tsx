"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { getProjectByToken, getPhotosByProject } from "@/lib/mock-data";
import type { Photo, StarRating, ColorTag } from "@/types";
import { differenceInDays } from "date-fns";

const COLOR_OPTIONS: { key: ColorTag; color: string; label: string }[] = [
  { key: "red", color: "#ff4757", label: "빨강" },
  { key: "yellow", color: "#f5a623", label: "노랑" },
  { key: "green", color: "#2ed573", label: "초록" },
  { key: "blue", color: "#4f7eff", label: "파랑" },
  { key: "purple", color: "#9c27b0", label: "보라" },
];

const MODAL_QUICK_COMMENTS = [
  "밝기 올려주세요",
  "피부톤 보정",
  "배경 흐리게",
  "색감 따뜻하게",
  "전체적으로 밝게",
  "대비 높여주세요",
];

function getTestImageUrl(photoId: string | number, size = "1200/800") {
  const seed = typeof photoId === "string" ? photoId.replace(/\D/g, "") || "1" : String(photoId);
  return `https://picsum.photos/seed/${seed}/${size}`;
}

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const photoId = (params?.photoId as string) ?? "";
  const project = getProjectByToken(token);
  const photos = getPhotosByProject(project?.id ?? "").sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIndex = photos.findIndex((p) => p.id === photoId);
  const current = currentIndex >= 0 ? photos[currentIndex] : null;

  const { Y, toggle, photoStates, updatePhotoState } = useSelection();
  const star = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color : undefined;
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [starPressRing, setStarPressRing] = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [comment, setComment] = useState(current?.comment ?? "");
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const setStar = useCallback(
    (s: StarRating) => {
      if (current) updatePhotoState(current.id, { rating: s });
    },
    [current, updatePhotoState]
  );
  const setColor = useCallback(
    (c: ColorTag | undefined) => {
      if (current) updatePhotoState(current.id, { color: c });
    },
    [current, updatePhotoState]
  );

  const N = project?.requiredCount ?? 0;
  const daysLeft = project ? differenceInDays(new Date(project.deadline), new Date()) : 0;

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    router.push(`/c/${token}/viewer/${photos[currentIndex - 1].id}`);
  }, [currentIndex, photos, router, token]);

  const goNext = useCallback(() => {
    if (currentIndex >= photos.length - 1) return;
    router.push(`/c/${token}/viewer/${photos[currentIndex + 1].id}`);
  }, [currentIndex, photos.length, router, token]);

  const toggleSelect = useCallback(() => {
    if (!current) return;
    toggle(current.id);
  }, [current, toggle]);

  const openCommentModal = useCallback(() => {
    setDraftComment(comment);
    setCommentModalOpen(true);
  }, [comment]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed" || project.status === "editing") {
      router.replace(`/c/${token}/locked`);
    }
  }, [project?.status, project, token, router]);

  // 사진이 바뀔 때 코멘트만 로컬 동기화 (태그는 Context photoStates에서 읽음)
  useEffect(() => {
    if (!current) return;
    setComment(current.comment ?? "");
  }, [current?.id]);

  // e.code 사용 → 한글(ㅂㅈㄷㄱㅅ) / 영문(qwert) 모두 동작
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (commentModalOpen) return;

      switch (e.code) {
        case "Digit1":
          setStar(1);
          setStarPressRing(1);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit2":
          setStar(2);
          setStarPressRing(2);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit3":
          setStar(3);
          setStarPressRing(3);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit4":
          setStar(4);
          setStarPressRing(4);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "Digit5":
          setStar(5);
          setStarPressRing(5);
          setTimeout(() => setStarPressRing(null), 200);
          break;
        case "KeyQ":
          setColor("red");
          setColorPressRing("red");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyW":
          setColor("yellow");
          setColorPressRing("yellow");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyE":
          setColor("green");
          setColorPressRing("green");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyR":
          setColor("blue");
          setColorPressRing("blue");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "KeyT":
          setColor("purple");
          setColorPressRing("purple");
          setTimeout(() => setColorPressRing(null), 200);
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        default:
          break;
      }
    },
    [commentModalOpen, goPrev, goNext]
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
          <span className="font-mono text-zinc-400">
            #{current.orderIndex} / {photos.length}
          </span>
          <span className="text-zinc-500">기한까지 {daysLeft}일</span>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <img
          src={getTestImageUrl(current.id)}
          alt={`사진 ${current.orderIndex}`}
          className="w-full h-full object-contain"
          style={{ maxHeight: "60vh" }}
        />
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
          disabled={currentIndex === photos.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2.5 text-white/60 hover:text-white hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      <div className="border-t border-zinc-800/80 bg-[#111318] p-5">
        <div className="mx-auto max-w-3xl space-y-4">
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

          {/* 코멘트 추가 버튼 (배경 있는 세련된 스타일) */}
          <div className="flex justify-center">
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
              {comment ? `코멘트 있음 (${comment.length}자)` : "코멘트 추가"}
            </button>
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
              <li>[Space] 선택 / 해제</li>
              <li>← →: 이전/다음</li>
            </ul>
          )}
        </div>
      </div>

      {/* 코멘트 모달 */}
      {commentModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCommentModalOpen(false);
          }}
        >
          <div className="bg-[#1a1d24] border border-zinc-700 rounded-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-white">코멘트 추가</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  사진 #{current.orderIndex} · 작가에게 전달됩니다
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommentModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {MODAL_QUICK_COMMENTS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    setDraftComment((prev) =>
                      (prev ? `${prev}, ${chip}` : chip).slice(0, 500)
                    )
                  }
                  className="px-3 py-1.5 rounded-full text-xs border border-zinc-600 text-zinc-300 hover:border-primary hover:text-primary transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value.slice(0, 500))}
              maxLength={500}
              placeholder="보정 요청이나 피드백을 자유롭게 남겨주세요..."
              autoFocus
              className="w-full bg-[#0a0b0d] border border-zinc-700 focus:border-primary rounded-xl p-4 text-sm text-white resize-none outline-none h-32 transition-colors"
            />
            <div className="text-right text-xs text-zinc-500 mt-1 mb-4">
              {draftComment.length} / 500
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setDraftComment(comment);
                  setCommentModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500"
              >
                취소
              </button>
              {comment && (
                <button
                  type="button"
                  onClick={() => {
                    setComment("");
                    setDraftComment("");
                    setCommentModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-red-400 border border-red-900 hover:bg-red-900/20"
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setComment(draftComment);
                  setCommentModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!draftComment.trim()}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
