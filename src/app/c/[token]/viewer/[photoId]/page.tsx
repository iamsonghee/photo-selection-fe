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
  { key: "red",    color: "#ff4757" },
  { key: "yellow", color: "#ffd32a" },
  { key: "green",  color: "#2ed573" },
  { key: "blue",   color: "#1e90ff" },
  { key: "purple", color: "#5352ed" },
];

const COMMENT_MAX_LENGTH = 150;

/** object-fit: contain 영역 기준 좌표 (실제 그려진 사진의 왼쪽 위) */
function getObjectFitContainOffset(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number
) {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { left: 0, top: 0 };
  }
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const drawnW = naturalW * scale;
  const drawnH = naturalH * scale;
  return {
    left: (containerW - drawnW) / 2,
    top: (containerH - drawnH) / 2,
  };
}

/** 프리뷰: 전체 영역에 fit + 실제 사진 좌상단에 체크 배지 */
function ViewerPhotoWithBadge({
  src,
  alt,
  showBadge,
}: {
  src: string;
  alt: string;
  showBadge: boolean;
}) {
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
    if (nw <= 0 || nh <= 0) {
      setBadgeOffset({ left: 5, top: 5 });
      return;
    }
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
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
      onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={measureBadge}
        {...viewerImageBlockDownloadHandlers}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
          ...viewerImageBlockDownloadStyle,
        }}
      />
      {showBadge && (
        <div
          className="pointer-events-none absolute z-[3] flex items-center justify-center rounded-full"
          style={{
            left: badgeOffset.left,
            top: badgeOffset.top,
            width: 20,
            height: 20,
            background: "#FF4D00",
            border: "2px solid white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
          aria-hidden
        >
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

  useEffect(() => {
    if (current?.id) setDraftComment(photoStates[current.id]?.comment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    setCommentSaveFeedback("idle");
  }, [current?.id]);

  const savedCommentForCurrent = current ? (photoStates[current.id]?.comment ?? "") : "";
  const hasUnsavedComment =
    Boolean(current) && draftComment.trim() !== savedCommentForCurrent.trim();

  useEffect(() => {
    if (commentSaveFeedback === "saved" && hasUnsavedComment) {
      setCommentSaveFeedback("idle");
    }
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

  // ── Touch swipe (모바일: 이미지 핀치 확대 중에는 다음/이전 스와이프 비활성화) ──
  const touchStartXRef = useRef(0);
  const mobileImageZoomedRef = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mobileImageZoomedRef.current) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNextWrap() : goPrevWrap(); }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

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

  const displayRating     = hoverStar || star || 0;
  const isCurrentSelected = selectedIds.has(current.id);
  const filename          = getPhotoDisplayName(current);
  const viewerSrc         = viewerImageUrl(current);
  const galleryHref       = buildGalleryHrefWithFocus(token, searchParams, photoId);
  const shotSeq           = String(currentIndex + 1).padStart(3, "0");
  const totalSeq          = String(filteredPhotos.length).padStart(3, "0");
  const bracketColor      = isCurrentSelected ? "#FF4D00" : "#555555";
  const bracketShadow     = isCurrentSelected ? "0 0 16px rgba(255,77,0,0.55)" : "none";
  const bracketBorder     = `2px solid ${bracketColor}`;

  return (
    <div
      style={{ background: "#030303", minHeight: "100vh", overflow: "hidden" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        .vw-hud {
          background: rgba(5,5,5,0.82);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .vw-mono {
          font-family: 'Space Mono', 'JetBrains Mono', monospace;
        }
        .vw-nav-btn {
          background: rgba(5,5,5,0.82);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .vw-nav-btn:hover:not(:disabled) {
          background: rgba(255,77,0,0.12);
          border-color: rgba(255,77,0,0.4);
          color: #FF4D00;
        }
        .vw-nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .vw-close-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          color: rgba(255,255,255,0.65);
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-decoration: none;
          transition: color 0.2s, border-color 0.2s;
        }
        .vw-close-btn:hover {
          color: #FF4D00;
          border-color: rgba(255,77,0,0.35);
        }
        .vw-star-btn {
          background: none; border: none; cursor: pointer;
          line-height: 1; padding: 2px; user-select: none;
          transition: transform 0.1s;
        }
        .vw-star-btn:hover { transform: scale(1.15); }
        .vw-color-dot {
          border-radius: 50%; cursor: pointer;
          position: relative; flex-shrink: 0;
          transition: transform 0.1s;
        }
        .vw-color-dot:hover { transform: scale(1.1); }
        .vw-textarea {
          width: 100%; padding: 8px 10px;
          background: rgba(16,16,16,0.9);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e0e0e0; font-size: 11px;
          font-family: 'Pretendard', system-ui, sans-serif;
          resize: none; outline: none;
          transition: border-color 0.2s;
          border-radius: 0;
          line-height: 1.5;
        }
        .vw-textarea:focus { border-color: rgba(255,77,0,0.4); }
        .vw-textarea::placeholder { color: #444; }
        .vw-select-btn {
          width: 100%; padding: 10px 14px;
          font-family: 'Space Mono', monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: all 0.15s;
          clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
          border: none;
        }
      `}</style>

      {/* Grid background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(to right,#1a1a1a 1px,transparent 1px),linear-gradient(to bottom,#1a1a1a 1px,transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Corner brackets */}
      <div style={{ position: "fixed", top: 20, left: 20, width: 32, height: 32, zIndex: 50, pointerEvents: "none", transition: "border-color 0.3s, box-shadow 0.3s", borderTop: bracketBorder, borderLeft: bracketBorder, borderRight: "none", borderBottom: "none", boxShadow: bracketShadow }} />
      <div style={{ position: "fixed", top: 20, right: 20, width: 32, height: 32, zIndex: 50, pointerEvents: "none", transition: "border-color 0.3s, box-shadow 0.3s", borderTop: bracketBorder, borderRight: bracketBorder, borderLeft: "none", borderBottom: "none", boxShadow: bracketShadow }} />
      <div style={{ position: "fixed", bottom: 20, left: 20, width: 32, height: 32, zIndex: 50, pointerEvents: "none", transition: "border-color 0.3s, box-shadow 0.3s", borderBottom: bracketBorder, borderLeft: bracketBorder, borderRight: "none", borderTop: "none", boxShadow: bracketShadow }} />
      <div style={{ position: "fixed", bottom: 20, right: 20, width: 32, height: 32, zIndex: 50, pointerEvents: "none", transition: "border-color 0.3s, box-shadow 0.3s", borderBottom: bracketBorder, borderRight: bracketBorder, borderLeft: "none", borderTop: "none", boxShadow: bracketShadow }} />

      {/* ════ DESKTOP (md+) ════ */}
      <div className="hidden md:block">

        {/* Full-bleed image */}
        <div style={{ position: "fixed", inset: 0, zIndex: 1 }}>
          {viewerSrc
            ? <ViewerPhotoWithBadge src={viewerSrc} alt={filename} showBadge={false} />
            : <div style={{ color: "#3a5a6e", padding: 16 }}>사진 없음</div>
          }
        </div>

        {/* Top-center: close + counter */}
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 30, display: "flex", alignItems: "center", gap: 8,
        }}>
          <Link href={galleryHref} className="vw-hud vw-close-btn">
            <X style={{ width: 11, height: 11 }} />
            CLOSE
          </Link>
          <div className="vw-hud vw-mono" style={{
            padding: "8px 14px", fontSize: 10,
            color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em",
          }}>
            {shotSeq} / {totalSeq}
          </div>
        </div>

        {/* Top-left: ASSET info */}
        <div className="vw-hud" style={{
          position: "fixed", top: 20, left: 72, zIndex: 20,
          padding: "12px 16px", minWidth: 190, maxWidth: 260,
        }}>
          <div className="vw-mono" style={{ fontSize: 9, color: "#FF4D00", letterSpacing: "0.1em", marginBottom: 8 }}>
            ASSET :: INFO
          </div>
          <div className="vw-mono" style={{
            fontSize: 11, color: "#ffffff", marginBottom: 4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {filename}
          </div>
          <div className="vw-mono" style={{ fontSize: 9, color: "#8C8C8C", letterSpacing: "0.06em", marginBottom: 2 }}>
            SHOT_{shotSeq} — SEQ.{String(currentIndex + 1).padStart(4, "0")}
          </div>
          <div className="vw-mono" style={{ fontSize: 9, color: "#444", marginTop: 4 }}>
            ENCODE :: SECURE_STREAM
          </div>
        </div>

        {/* Top-right: rating + colors + select */}
        <div className="vw-hud" style={{
          position: "fixed", top: 20, right: 72, zIndex: 20,
          padding: "14px 16px", minWidth: 220,
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Rating */}
          <div>
            <div className="vw-mono" style={{ fontSize: 9, color: "#FF4D00", letterSpacing: "0.1em", marginBottom: 8 }}>RATING</div>
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= displayRating;
                return (
                  <button key={s} type="button" className="vw-star-btn"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{
                      fontSize: 22,
                      color: filled ? "#FF4D00" : "#333",
                      transform: starPressRing === s ? "scale(1.25)" : undefined,
                    }}>
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color labels */}
          <div>
            <div className="vw-mono" style={{ fontSize: 9, color: "#FF4D00", letterSpacing: "0.1em", marginBottom: 8 }}>COLOR LABEL</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color?.includes(opt.key) ?? false;
                const showRing = isActive || colorPressRing === opt.key;
                return (
                  <button key={opt.key} type="button" className="vw-color-dot"
                    onClick={() => setColor(opt.key)}
                    style={{
                      width: 26, height: 26, background: opt.color,
                      border: showRing ? "2px solid white" : "2px solid transparent",
                      boxShadow: showRing ? "0 0 0 2px rgba(255,255,255,0.25)" : "none",
                    }}>
                    {isActive && (
                      <Check style={{ position: "absolute", inset: 0, margin: "auto", width: 11, height: 11, color: "white" }} strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select button */}
          <button type="button" onClick={toggleSelect} className="vw-select-btn"
            style={isCurrentSelected
              ? { background: "#FF4D00", color: "#fff" }
              : { background: "rgba(255,255,255,0.05)", color: "#8C8C8C", outline: "1px solid rgba(255,255,255,0.1)" }
            }>
            {isCurrentSelected ? (
              <><Check style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={3} />선택됨 ({Y}/{N})</>
            ) : (
              `선택하기 (${Y}/${N})`
            )}
          </button>
        </div>

        {/* Left nav */}
        <button type="button" onClick={goPrev} disabled={currentIndex === 0}
          className="vw-nav-btn"
          style={{ position: "fixed", left: 20, top: "50%", transform: "translateY(-50%)", zIndex: 30, width: 44, height: 44 }}>
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>

        {/* Right nav */}
        <button type="button" onClick={goNext} disabled={currentIndex === filteredPhotos.length - 1}
          className="vw-nav-btn"
          style={{ position: "fixed", right: 20, top: "50%", transform: "translateY(-50%)", zIndex: 30, width: 44, height: 44 }}>
          <ChevronRight style={{ width: 20, height: 20 }} />
        </button>

        {/* Bottom-left: LOC_DATA decorative */}
        <div className="vw-mono" style={{
          position: "fixed", bottom: 30, left: 72, zIndex: 20,
          fontSize: 9, color: "#333", letterSpacing: "0.1em", lineHeight: 1.9,
          pointerEvents: "none",
        }}>
          <div>LOC_DATA :: CLIENT.VIEW</div>
          <div>ENCODE :: SECURE_STREAM</div>
          <div>© {new Date().getFullYear()} A컷 · Acut</div>
        </div>

        {/* Bottom-center: shortcut hint */}
        <div className="vw-mono" style={{
          position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, fontSize: 9, color: "#3a3a3a", letterSpacing: "0.08em",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          PRESS ? FOR SHORTCUTS
        </div>

        {/* Bottom-right: Retouching notes */}
        <div className="vw-hud" style={{
          position: "fixed", bottom: 30, right: 72, zIndex: 20,
          padding: "14px 16px", minWidth: 240, maxWidth: 280,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div className="vw-mono" style={{ fontSize: 9, color: "#FF4D00", letterSpacing: "0.1em" }}>
            RETOUCHING NOTES
          </div>
          <textarea
            className="vw-textarea"
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
            placeholder="이 사진에 대한 메모를 남겨주세요"
            style={{ height: 68 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={saveComment} disabled={!hasUnsavedComment}
              className="vw-mono"
              style={{
                flex: 1, padding: "7px 12px", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em", cursor: hasUnsavedComment ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "all 0.15s", borderRadius: 0,
                ...(commentSaveFeedback === "saved"
                  ? { background: "rgba(46,213,115,0.12)", border: "1px solid rgba(46,213,115,0.3)", color: "#2ed573" }
                  : hasUnsavedComment
                    ? { background: "rgba(255,77,0,0.10)", border: "1px solid rgba(255,77,0,0.35)", color: "#FF4D00" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#444" }
                ),
              }}>
              {commentSaveFeedback === "saved" ? (
                <><Check style={{ width: 11, height: 11 }} strokeWidth={3} />SAVED</>
              ) : "POST"}
            </button>
            {hasUnsavedComment && commentSaveFeedback !== "saved" && (
              <span className="vw-mono" style={{ fontSize: 9, color: "#555" }}>미저장</span>
            )}
          </div>
        </div>
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
            {isCurrentSelected ? (
              <><Check style={{ width: 15, height: 15, flexShrink: 0 }} /><span>선택됨 ({Y}/{N})</span></>
            ) : (
              <span>선택하기 ({Y}/{N})</span>
            )}
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
              style={{
                flex: 1, padding: "8px 10px",
                background: "rgba(39,39,42,0.6)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, color: "#fafafa", fontSize: 12,
                fontFamily: "'Pretendard', system-ui, sans-serif", resize: "none", height: 44, lineHeight: 1.5, outline: "none",
              }}
            />
            <button
              type="button"
              onClick={saveComment}
              disabled={!hasUnsavedComment}
              aria-label={commentSaveFeedback === "saved" ? "코멘트 저장됨" : "코멘트 저장"}
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
                ? (<><Check style={{ width: 13, height: 13, flexShrink: 0 }} strokeWidth={3} />저장됨</>)
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
          <div className="vw-hud" style={{ padding: "28px 32px", minWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div className="vw-mono" style={{ fontSize: 11, color: "#FF4D00", letterSpacing: "0.1em" }}>KEYBOARD SHORTCUTS</div>
              <button type="button" onClick={() => setShowShortcuts(false)}
                style={{ background: "none", border: "none", color: "#8C8C8C", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div className="vw-mono" style={{
              fontSize: 10, color: "#8C8C8C",
              display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 24px",
            }}>
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
