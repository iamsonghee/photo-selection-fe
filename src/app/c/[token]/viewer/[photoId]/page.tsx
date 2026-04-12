"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import {
  parseFilterFromSearchParams,
  buildGalleryHrefWithFocus,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import {
  viewerImageBlockDownloadHandlers,
  viewerImageBlockDownloadStyle,
  viewerImageDownloadBlocked,
} from "@/lib/viewer-image-guard";
import type { StarRating, ColorTag } from "@/types";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";

const COLOR_OPTIONS: { key: ColorTag; color: string }[] = [
  { key: "red",    color: "#ef4444" },
  { key: "yellow", color: "#f97316" },
  { key: "green",  color: "#22c55e" },
  { key: "blue",   color: "#3b82f6" },
  { key: "purple", color: "#a855f7" },
];

const COMMENT_MAX_LENGTH = 150;

function getObjectFitContainOffset(
  containerW: number, containerH: number,
  naturalW: number, naturalH: number
) {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0)
    return { left: 0, top: 0 };
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  return {
    left: (containerW - naturalW * scale) / 2,
    top: (containerH - naturalH * scale) / 2,
  };
}

function ViewerPhotoWithBadge({ src, alt, showBadge }: { src: string; alt: string; showBadge: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [badgeOffset, setBadgeOffset] = useState({ left: 5, top: 5 });

  const measureBadge = useCallback(() => {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const nw = img?.naturalWidth ?? 0;
    const nh = img?.naturalHeight ?? 0;
    if (nw <= 0 || nh <= 0) { setBadgeOffset({ left: 5, top: 5 }); return; }
    const { left, top } = getObjectFitContainOffset(cw, ch, nw, nh);
    setBadgeOffset({ left: left + 5, top: top + 5 });
  }, []);

  useEffect(() => {
    measureBadge();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureBadge());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureBadge, src]);

  useEffect(() => {
    const onResize = () => measureBadge();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureBadge]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}
      onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}>
      <img ref={imgRef} src={src} alt={alt} onLoad={measureBadge}
        {...viewerImageBlockDownloadHandlers}
        style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block", ...viewerImageBlockDownloadStyle }}
      />
      {showBadge && (
        <div className="pointer-events-none absolute z-[3] flex items-center justify-center rounded-full"
          style={{ left: badgeOffset.left, top: badgeOffset.top, width: 20, height: 20, background: "#FF4D00", border: "2px solid white", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} aria-hidden>
          <Check style={{ width: 10, height: 10, color: "white" }} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

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
  const current = currentIndex >= 0
    ? filteredPhotos[currentIndex]
    : (contextPhotos ?? []).find((p) => p.id === photoId) ?? null;

  const star  = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color  : undefined;

  const [hoverStar,      setHoverStar]      = useState(0);
  const [starPressRing,  setStarPressRing]  = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [draftComment,   setDraftComment]   = useState("");
  const [commentSaveFeedback, setCommentSaveFeedback] = useState<"idle" | "saved">("idle");
  const [showShortcuts,  setShowShortcuts]  = useState(false);

  const N = project?.requiredCount ?? 0;
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const filmstripRef   = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  useEffect(() => {
    if (current?.id) setDraftComment(photoStates[current.id]?.comment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => { setCommentSaveFeedback("idle"); }, [current?.id]);

  const savedCommentForCurrent = current ? (photoStates[current.id]?.comment ?? "") : "";
  const hasUnsavedComment = Boolean(current) && draftComment.trim() !== savedCommentForCurrent.trim();

  useEffect(() => {
    if (commentSaveFeedback === "saved" && hasUnsavedComment) setCommentSaveFeedback("idle");
  }, [draftComment, commentSaveFeedback, hasUnsavedComment]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setStar = useCallback((s: StarRating) => {
    if (!current) return;
    const raw = photoStates[current.id]?.rating;
    const cur = raw != null ? (Number(raw) as StarRating) : undefined;
    updatePhotoState(current.id, { rating: cur === s ? undefined : s });
    setHoverStar(0);
    window.setTimeout(() => setHoverStar(0), 0);
  }, [current, photoStates, updatePhotoState]);

  const setColor = useCallback((c: ColorTag) => {
    if (!current) return;
    const cur = photoStates[current.id]?.color ?? [];
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    updatePhotoState(current.id, { color: next.length ? next : undefined });
  }, [current, photoStates, updatePhotoState]);

  const saveComment = useCallback(() => {
    if (!current || !hasUnsavedComment) return;
    updatePhotoState(current.id, { comment: draftComment.trim() });
    setCommentSaveFeedback("saved");
    window.setTimeout(() => setCommentSaveFeedback("idle"), 2500);
  }, [current, draftComment, hasUnsavedComment, updatePhotoState]);

  const toggleSelect = useCallback(() => { if (current) toggle(current.id); }, [current, toggle]);

  // ── Navigation ───────────────────────────────────────────────────────────

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[currentIndex - 1].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goNext = useCallback(() => {
    if (currentIndex >= filteredPhotos.length - 1) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[currentIndex + 1].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goPrevWrap = useCallback(() => {
    if (!filteredPhotos.length) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[(currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  const goNextWrap = useCallback(() => {
    if (!filteredPhotos.length) return;
    router.push(`/c/${token}/viewer/${filteredPhotos[(currentIndex + 1) % filteredPhotos.length].id}${queryString}`);
  }, [currentIndex, filteredPhotos, router, token, queryString]);

  // ── Touch swipe ───────────────────────────────────────────────────────────

  const touchStartXRef      = useRef(0);
  const mobileImageZoomedRef = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mobileImageZoomedRef.current) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNextWrap() : goPrevWrap(); }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (e.key === "?" || (e.shiftKey && e.key === "/")) { setShowShortcuts(s => !s); return; }
    if (e.key === "Escape") { setShowShortcuts(false); return; }
    switch (e.code) {
      case "Digit1": setStar(1); setStarPressRing(1); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit2": setStar(2); setStarPressRing(2); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit3": setStar(3); setStarPressRing(3); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit4": setStar(4); setStarPressRing(4); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit5": setStar(5); setStarPressRing(5); setTimeout(() => setStarPressRing(null), 200); break;
      case "KeyQ": setColor("red");    setColorPressRing("red");    setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyW": setColor("yellow"); setColorPressRing("yellow"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyE": setColor("green");  setColorPressRing("green");  setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyR": setColor("blue");   setColorPressRing("blue");   setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyT": setColor("purple"); setColorPressRing("purple"); setTimeout(() => setColorPressRing(null), 200); break;
      case "ArrowLeft":  e.preventDefault(); goPrevWrap(); break;
      case "ArrowRight": e.preventDefault(); goNextWrap(); break;
    }
  }, [setStar, setColor, goPrevWrap, goNextWrap]);

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); toggleSelect(); }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, toggleSelect]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed" || project.status === "editing") router.replace(`/c/${token}/locked`);
  }, [project?.status, project, token, router]);

  if (!project || !current) return null;
  if (project.status === "confirmed" || project.status === "editing") return null;

  const displayRating      = hoverStar || star || 0;
  const isCurrentSelected  = selectedIds.has(current.id);
  const filename           = getPhotoDisplayName(current);
  const viewerSrc          = viewerImageUrl(current);
  const galleryHref        = buildGalleryHrefWithFocus(token, searchParams, photoId);
  const shotSeq            = String(currentIndex + 1).padStart(3, "0");

  return (
    <div
      style={{ background: "#000", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;900&family=Space+Mono:wght@400;700&display=swap');

        .fs-grid-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.15;
          background-image: linear-gradient(#1A1A1A 1px, transparent 1px), linear-gradient(90deg, #1A1A1A 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .fs-hud {
          background: rgba(5,5,5,0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .fs-nav-btn {
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          border: 1px solid #1A1A1A;
          color: white;
          transition: all 0.2s ease;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .fs-nav-btn:hover { background: #FF4D00; color: black; border-color: #FF4D00; }
        .fs-nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .fs-nav-btn:disabled:hover { background: rgba(0,0,0,0.4); color: white; border-color: #1A1A1A; }
        .fs-bracket { position: absolute; width: 16px; height: 16px; border-color: #FF4D00; pointer-events: none; z-index: 10; }
        .fs-b-tl { top: -2px; left: -2px; border-top: 2px solid; border-left: 2px solid; }
        .fs-b-tr { top: -2px; right: -2px; border-top: 2px solid; border-right: 2px solid; }
        .fs-b-bl { bottom: -2px; left: -2px; border-bottom: 2px solid; border-left: 2px solid; }
        .fs-b-br { bottom: -2px; right: -2px; border-bottom: 2px solid; border-right: 2px solid; }
        .fs-thumb {
          height: 100px; width: 150px; flex-shrink: 0;
          border: 1px solid #1A1A1A;
          filter: grayscale(1); opacity: 0.5;
          transition: all 0.3s ease; cursor: pointer; position: relative; overflow: hidden;
        }
        .fs-thumb.active {
          filter: grayscale(0); opacity: 1;
          border-color: #FF4D00; transform: scale(1.05); z-index: 5;
        }
        .fs-thumb:not(.active):hover { opacity: 0.75; filter: grayscale(0.4); }
        .fs-hide-scrollbar::-webkit-scrollbar { display: none; }
        .fs-hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .fs-comment-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          outline: none; font-size: 10px; color: #d1d5db;
          font-family: 'Pretendard', sans-serif;
        }
        .fs-comment-input::placeholder { color: #555; }
        .fs-comment-input:focus { border-color: rgba(255,77,0,0.4); }
        .fs-btn-clip {
          clip-path: polygon(0 0, 100% 0, 100% 70%, 90% 100%, 0 100%);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          cursor: pointer; border: none;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 900; letter-spacing: -0.02em; transition: opacity 0.15s;
        }
        .fs-btn-clip:hover { opacity: 0.85; }
        .fs-star { cursor: pointer; transition: transform 0.1s; }
        .fs-star:hover { transform: scale(1.2); }
      `}</style>

      {/* Grid background */}
      <div className="fs-grid-bg" />

      {/* ════ DESKTOP (md+) ════ */}
      <div className="hidden md:flex flex-col" style={{ height: "100vh" }}>

        {/* Main image area */}
        <main style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 10, overflow: "hidden", minHeight: 0 }}>

          {/* Top HUD bar */}
          <div className="fs-hud" style={{
            position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 40, padding: "12px 24px", borderRadius: 2,
            display: "flex", alignItems: "center", gap: 24,
            width: "calc(100% - 128px)", maxWidth: 960,
          }}>
            {/* Back link */}
            <Link href={galleryHref} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.4)", textDecoration: "none", flexShrink: 0, transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FF4D00")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
              <X style={{ width: 12, height: 12 }} />
            </Link>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />

            {/* Filename + seq */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 130, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, background: "#FF4D00", flexShrink: 0 }} />
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 11, letterSpacing: "-0.04em", textTransform: "uppercase", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {filename}
                </h2>
              </div>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: "-0.04em", margin: 0 }}>
                {shotSeq} // {project?.name ?? "PROJECT"}
              </p>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />

            {/* Star rating */}
            <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= displayRating;
                return (
                  <span key={s} className="fs-star"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{
                      fontSize: 14, lineHeight: 1, userSelect: "none",
                      color: filled ? "#FF4D00" : "#333",
                      transform: starPressRing === s ? "scale(1.25)" : undefined,
                    }}>
                    {filled ? "★" : "☆"}
                  </span>
                );
              })}
            </div>

            {/* Color dots */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color?.includes(opt.key) ?? false;
                const showRing = isActive || colorPressRing === opt.key;
                return (
                  <button key={opt.key} type="button"
                    onClick={() => setColor(opt.key)}
                    style={{
                      width: 12, height: 12, borderRadius: "50%", background: opt.color, cursor: "pointer",
                      border: showRing ? "1.5px solid white" : "1.5px solid transparent",
                      boxShadow: showRing ? "0 0 0 1.5px rgba(255,255,255,0.25)" : "none",
                      flexShrink: 0, position: "relative", transition: "transform 0.1s",
                    }}>
                    {isActive && (
                      <Check style={{ position: "absolute", inset: 0, margin: "auto", width: 6, height: 6, color: "white" }} strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />

            {/* Comment input + Post */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <input
                type="text"
                className="fs-comment-input"
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                onKeyDown={(e) => { if (e.key === "Enter") saveComment(); }}
                placeholder="Retouching notes..."
                style={{ flex: 1, padding: "4px 12px", borderRadius: 2, minWidth: 0 }}
              />
              <button type="button" onClick={saveComment} disabled={!hasUnsavedComment}
                className="fs-btn-clip"
                style={{
                  height: 28, padding: "0 12px", fontSize: 9, flexShrink: 0,
                  ...(commentSaveFeedback === "saved"
                    ? { background: "#22c55e", color: "black" }
                    : hasUnsavedComment
                      ? { background: "#FF4D00", color: "black" }
                      : { background: "rgba(255,255,255,0.06)", color: "#555", cursor: "not-allowed" }
                  ),
                }}>
                {commentSaveFeedback === "saved" ? (
                  <Check style={{ width: 10, height: 10 }} strokeWidth={3} />
                ) : "Post"}
              </button>
            </div>

            {/* Final (select) button */}
            <button type="button" onClick={toggleSelect}
              className="fs-btn-clip"
              style={{
                height: 28, padding: "0 14px", fontSize: 10, flexShrink: 0,
                ...(isCurrentSelected
                  ? { background: "rgba(255,77,0,0.15)", color: "#FF4D00", outline: "1px solid rgba(255,77,0,0.4)" }
                  : { background: "#FF4D00", color: "black" }
                ),
              }}>
              <Check style={{ width: 10, height: 10 }} strokeWidth={4} />
              <span style={{ fontStyle: "italic" }}>
                {isCurrentSelected ? `${Y}/${N}` : "Final"}
              </span>
            </button>
          </div>

          {/* Left nav */}
          <button type="button" onClick={goPrev} disabled={currentIndex === 0}
            className="fs-nav-btn"
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 48, height: 48, borderRadius: "50%" }}>
            <ChevronLeft style={{ width: 24, height: 24 }} />
          </button>

          {/* Right nav */}
          <button type="button" onClick={goNext} disabled={currentIndex === filteredPhotos.length - 1}
            className="fs-nav-btn"
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 48, height: 48, borderRadius: "50%" }}>
            <ChevronRight style={{ width: 24, height: 24 }} />
          </button>

          {/* Image frame */}
          <div style={{ position: "relative" }}
            onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}>
            <div className="fs-bracket fs-b-tl" />
            <div className="fs-bracket fs-b-tr" />
            <div className="fs-bracket fs-b-bl" />
            <div className="fs-bracket fs-b-br" />
            {viewerSrc ? (
              <img
                src={viewerSrc}
                alt={filename}
                {...viewerImageBlockDownloadHandlers}
                style={{
                  maxHeight: "calc(100vh - 240px)",
                  maxWidth: "calc(100vw - 140px)",
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                  boxShadow: "0 25px 50px rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  ...viewerImageBlockDownloadStyle,
                }}
              />
            ) : (
              <div style={{ color: "#3a5a6e", padding: 16 }}>사진 없음</div>
            )}
            {/* EXIF decorative */}
            <div style={{
              position: "absolute", bottom: -28, left: 0,
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              textTransform: "uppercase", letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap",
              pointerEvents: "none",
            }}>
              SHOT_{shotSeq} // {filename}
            </div>
          </div>
        </main>

        {/* Filmstrip footer */}
        <footer style={{
          height: 160, background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.08)",
          zIndex: 30, display: "flex", alignItems: "center", padding: "0 32px",
          position: "relative", flexShrink: 0,
        }}>
          <div
            ref={filmstripRef}
            className="fs-hide-scrollbar"
            style={{ display: "flex", gap: 16, overflowX: "auto", width: "100%", padding: "16px 0", alignItems: "center" }}
          >
            {filteredPhotos.map((photo, i) => {
              const isActive  = i === currentIndex;
              const thumbSrc  = viewerImageUrl(photo);
              const thumbName = getPhotoDisplayName(photo);
              const isSelected = selectedIds.has(photo.id);
              return (
                <div
                  key={photo.id}
                  ref={isActive ? activeThumbRef : null}
                  className={`fs-thumb${isActive ? " active" : ""}`}
                  onClick={() => router.push(`/c/${token}/viewer/${photo.id}${queryString}`)}
                >
                  <img
                    src={thumbSrc}
                    alt={thumbName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <span style={{
                    position: "absolute", bottom: 4, right: 4,
                    fontFamily: "'Space Mono', monospace", fontSize: 8,
                    background: "rgba(0,0,0,0.8)", padding: "0 4px", color: "white",
                  }}>
                    {String(i + 1).padStart(3, "0")}
                  </span>
                  {isSelected && (
                    <div style={{
                      position: "absolute", top: 4, left: 4, width: 14, height: 14,
                      background: "#FF4D00", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check style={{ width: 8, height: 8, color: "black" }} strokeWidth={4} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Decorative lat/lng */}
          <div style={{
            position: "absolute", bottom: 8, right: 24,
            opacity: 0.3, pointerEvents: "none",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, textAlign: "right", color: "white" }}>
              <p style={{ margin: 0 }}>37.5665° N</p>
              <p style={{ margin: 0 }}>126.9780° E</p>
            </div>
            <div style={{ width: 16, height: 16, border: "1px solid rgba(255,255,255,0.2)" }} />
          </div>
        </footer>
      </div>

      {/* ════ MOBILE (<md): fullscreen stack ════ */}
      <div className="md:hidden fixed inset-0 flex flex-col" style={{ background: "#030303" }}>

        {/* Topbar */}
        <div style={{
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0, zIndex: 20, paddingTop: 40,
        }}>
          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "0 12px" }}>
            <Link href={galleryHref}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, color: "rgba(255,255,255,0.75)", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>
              ← 갤러리
            </Link>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {filename}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
              {currentIndex + 1} / {filteredPhotos.length}
            </span>
          </div>
        </div>

        {/* Image */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, minWidth: 0 }}>
          {viewerSrc
            ? (
              <MobileViewerPinchPhoto
                src={viewerSrc}
                alt={filename}
                showBadge={isCurrentSelected}
                onZoomStateChange={(z) => { mobileImageZoomedRef.current = z; }}
              />
            )
            : <div style={{ color: "#3a5a6e", padding: 16 }}>사진 없음</div>
          }
          <button type="button" onClick={goPrevWrap}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.35)", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft style={{ width: 18, height: 18 }} />
          </button>
          <button type="button" onClick={goNextWrap}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.35)", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Bottom overlay */}
        <div style={{ background: "rgba(10,10,11,0.96)", backdropFilter: "blur(12px)", padding: "12px 16px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Select button */}
          <button type="button" onClick={toggleSelect}
            style={{
              width: "100%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Pretendard', system-ui, sans-serif", transition: "all 0.15s", padding: "10px 12px",
              ...(isCurrentSelected
                ? { background: "rgba(255,77,0,0.12)", border: "none", color: "#FF4D00" }
                : { background: "rgba(255,255,255,0.06)", border: "none", color: "#a1a1aa" }
              ),
            }}>
            {isCurrentSelected
              ? <><Check style={{ width: 15, height: 15, flexShrink: 0 }} /><span>선택됨 ({Y}/{N})</span></>
              : <span>선택하기 ({Y}/{N})</span>
            }
          </button>

          {/* Stars + Colors */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= (hoverStar || star || 0);
                return (
                  <button key={s} type="button"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{ fontSize: 22, lineHeight: 1, padding: "2px 3px", color: filled ? "#FF4D00" : "#3a5a6e", background: "none", border: "none", cursor: "pointer" }}>
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color?.includes(opt.key) ?? false;
                return (
                  <button key={opt.key} type="button" onClick={() => setColor(opt.key)}
                    style={{ width: 26, height: 26, borderRadius: "50%", background: opt.color, border: isActive ? "2px solid white" : "2px solid transparent", boxShadow: isActive ? "0 0 0 2px rgba(255,255,255,0.3)" : "none", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                    {isActive && <Check style={{ position: "absolute", inset: 0, margin: "auto", width: 11, height: 11, color: "white" }} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
              placeholder="코멘트..."
              style={{ flex: 1, padding: "8px 10px", background: "rgba(39,39,42,0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fafafa", fontSize: 12, fontFamily: "'Pretendard', system-ui, sans-serif", resize: "none", height: 44, lineHeight: 1.5, outline: "none" }}
            />
            <button type="button" onClick={saveComment} disabled={!hasUnsavedComment}
              style={{
                height: 44, minWidth: 88, padding: "0 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, flexShrink: 0,
                fontFamily: "'Pretendard', system-ui, sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "background 0.2s, color 0.2s, border-color 0.2s",
                ...(commentSaveFeedback === "saved"
                  ? { background: "rgba(46,213,115,0.15)", border: "1px solid rgba(46,213,115,0.35)", color: "#2ed573", cursor: "default" }
                  : hasUnsavedComment
                    ? { background: "rgba(255,77,0,0.12)", border: "1px solid rgba(255,77,0,0.4)", color: "#FF4D00", cursor: "pointer" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "#52525b", cursor: "not-allowed", opacity: 0.85 }
                ),
              }}>
              {commentSaveFeedback === "saved"
                ? <><Check style={{ width: 13, height: 13, flexShrink: 0 }} strokeWidth={3} />저장됨</>
                : "저장"
              }
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowShortcuts(false)}
        >
          <div className="fs-hud" style={{ padding: "28px 32px", minWidth: 320, borderRadius: 2 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#FF4D00", letterSpacing: "0.1em" }}>KEYBOARD SHORTCUTS</div>
              <button type="button" onClick={() => setShowShortcuts(false)}
                style={{ background: "none", border: "none", color: "#8C8C8C", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8C8C8C", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 24px" }}>
              <span style={{ color: "#FF4D00" }}>← →</span><span>이전 / 다음 사진</span>
              <span style={{ color: "#FF4D00" }}>SPACE</span><span>선택 / 선택 해제</span>
              <span style={{ color: "#FF4D00" }}>1 – 5</span><span>별점 설정</span>
              <span style={{ color: "#FF4D00" }}>Q W E R T</span><span>색상 태그</span>
              <span style={{ color: "#FF4D00" }}>?</span><span>단축키 보기 / 닫기</span>
              <span style={{ color: "#FF4D00" }}>ESC</span><span>창 닫기</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
