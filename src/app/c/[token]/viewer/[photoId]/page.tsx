"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import {
  parseFilterFromSearchParams,
  buildFilterQueryString,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { StarRating, ColorTag } from "@/types";

const COLOR_OPTIONS: { key: ColorTag; color: string }[] = [
  { key: "red",    color: "#ff4757" },
  { key: "yellow", color: "#ffd32a" },
  { key: "green",  color: "#2ed573" },
  { key: "blue",   color: "#1e90ff" },
  { key: "purple", color: "#5352ed" },
];

const COMMENT_MAX_LENGTH = 150;

const S = {
  panelLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: 1,
    textTransform: "uppercase" as const, color: "#3a5a6e", marginBottom: 10,
  } as React.CSSProperties,
};

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

  const [hoverStar,     setHoverStar]     = useState(0);
  const [starPressRing, setStarPressRing] = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [draftComment,  setDraftComment]  = useState("");

  const N = project?.requiredCount ?? 0;
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  // Sync draft comment when photo changes
  useEffect(() => {
    if (current?.id) setDraftComment(photoStates[current.id]?.comment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setStar = useCallback((s: StarRating) => {
    if (!current) return;
    const cur = photoStates[current.id]?.rating;
    updatePhotoState(current.id, { rating: cur === s ? undefined : s });
  }, [current, photoStates, updatePhotoState]);

  const setColor = useCallback((c: ColorTag) => {
    if (!current) return;
    const cur = photoStates[current.id]?.color;
    updatePhotoState(current.id, { color: cur === c ? undefined : c });
  }, [current, photoStates, updatePhotoState]);

  const saveComment = useCallback(() => {
    if (current) updatePhotoState(current.id, { comment: draftComment.trim() });
  }, [current, draftComment, updatePhotoState]);

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

  // ── Touch swipe ──────────────────────────────────────────────────────────

  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNextWrap() : goPrevWrap(); }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
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

  const displayRating    = hoverStar || star || 0;
  const isCurrentSelected = selectedIds.has(current.id);
  const filename          = getPhotoDisplayName(current);

  // ── Shared UI blocks ─────────────────────────────────────────────────────

  const StarBlock = (
    <div>
      <div style={S.panelLabel}>별점</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {([1, 2, 3, 4, 5] as const).map((s) => {
          const filled = s <= displayRating;
          return (
            <button key={s} type="button"
              onClick={() => setStar(s)}
              onMouseEnter={() => setHoverStar(s)}
              onMouseLeave={() => setHoverStar(0)}
              className={`transition-transform hover:scale-[1.15] ${starPressRing === s ? "scale-125" : ""}`}
              style={{
                fontSize: 24, lineHeight: 1, padding: 2,
                color: filled ? "#f5a623" : "#3a5a6e",
                background: "none", border: "none", cursor: "pointer", userSelect: "none",
              }}>
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
    </div>
  );

  const ColorBlock = (
    <div>
      <div style={S.panelLabel}>색상 태그</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {COLOR_OPTIONS.map((opt) => {
          const isActive  = color === opt.key;
          const showRing  = isActive || colorPressRing === opt.key;
          return (
            <button key={opt.key} type="button"
              onClick={() => setColor(opt.key)}
              className="transition-transform hover:scale-[1.1]"
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: opt.color,
                border: showRing ? "2px solid white" : "2px solid transparent",
                boxShadow: showRing ? "0 0 0 2px rgba(255,255,255,0.3)" : "none",
                cursor: "pointer", position: "relative", flexShrink: 0,
              }}>
              {isActive && (
                <Check style={{ position: "absolute", inset: 0, margin: "auto", width: 12, height: 12, color: "white" }} strokeWidth={3} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const CommentBlock = (
    <div style={{ flex: 1 }}>
      <div style={S.panelLabel}>코멘트</div>
      <textarea
        value={draftComment}
        onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
        placeholder="이 사진에 대한 메모를 남겨주세요"
        style={{
          width: "100%", padding: "10px 12px",
          background: "#152a3a", border: "1px solid rgba(102,155,188,0.12)",
          borderRadius: 8, color: "#e8eef2", fontSize: 12,
          fontFamily: "'DM Sans', sans-serif",
          resize: "none", height: 72, lineHeight: 1.5, outline: "none",
        }}
      />
      <button type="button" onClick={saveComment}
        className="transition-colors hover:border-[#669bbc] hover:text-[#669bbc]"
        style={{
          marginTop: 6, width: "100%", padding: "7px",
          borderRadius: 7, background: "#1a3347",
          border: "1px solid rgba(102,155,188,0.12)",
          color: "#7a9ab0", fontSize: 12, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>
        저장
      </button>
    </div>
  );

  const SelectButton = () => (
    <button type="button" onClick={toggleSelect}
      style={{
        width: "100%", height: 44,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
        ...(isCurrentSelected
          ? { background: "rgba(102,155,188,0.15)", border: "1.5px solid #669bbc", color: "#669bbc" }
          : { background: "#152a3a", border: "1.5px dashed rgba(102,155,188,0.4)", color: "#7a9ab0" }
        ),
      }}>
      {isCurrentSelected ? <><Check style={{ width: 15, height: 15 }} /> 확정됨</> : "+ 확정하기"}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}>

      {/* ════ DESKTOP (md+): 2-column grid ════ */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: "1fr 280px", minHeight: "100vh" }}>

        {/* Left: image */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

          {/* Topbar */}
          <div style={{
            height: 48, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
            position: "sticky", top: 0, zIndex: 10, flexShrink: 0,
          }}>
            <Link href={`/c/${token}/gallery${queryString}`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.7)", fontSize: 12, textDecoration: "none",
              }}>
              <ArrowLeft style={{ width: 14, height: 14 }} />
              갤러리
            </Link>
            <span style={{
              fontSize: 11, color: "rgba(255,255,255,0.4)",
              maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {filename}
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
              {currentIndex + 1} / {filteredPhotos.length}
            </span>
          </div>

          {/* Image area */}
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", overflow: "hidden" }}>
            {current.url
              ? <img src={current.url} alt={filename} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
              : <div style={{ color: "#3a5a6e" }}>사진 없음</div>
            }

            {/* Prev arrow */}
            <button type="button" onClick={goPrev} disabled={currentIndex === 0}
              style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.6)", cursor: currentIndex === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: currentIndex === 0 ? 0.2 : 1, transition: "all 0.15s",
              }}>
              <ChevronLeft style={{ width: 20, height: 20 }} />
            </button>

            {/* Next arrow */}
            <button type="button" onClick={goNext} disabled={currentIndex === filteredPhotos.length - 1}
              style={{
                position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.6)", cursor: currentIndex === filteredPhotos.length - 1 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: currentIndex === filteredPhotos.length - 1 ? 0.2 : 1, transition: "all 0.15s",
              }}>
              <ChevronRight style={{ width: 20, height: 20 }} />
            </button>

            {/* Bottom gradient + select button */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, padding: 16,
              background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              display: "flex", justifyContent: "center",
            }}>
              <div style={{ width: "100%", maxWidth: 280 }}>
                <SelectButton />
              </div>
            </div>
          </div>
        </div>

        {/* Right: control panel */}
        <div style={{
          background: "#0f2030", borderLeft: "1px solid rgba(102,155,188,0.12)",
          display: "flex", flexDirection: "column",
          height: "100vh", position: "sticky", top: 0, overflowY: "auto",
        }}>
          <div style={{ padding: 16, borderBottom: "1px solid rgba(102,155,188,0.12)" }}>{StarBlock}</div>
          <div style={{ padding: 16, borderBottom: "1px solid rgba(102,155,188,0.12)" }}>{ColorBlock}</div>
          <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column" }}>{CommentBlock}</div>

          {/* Prev / Next nav */}
          <div style={{
            padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            borderTop: "1px solid rgba(102,155,188,0.12)",
          }}>
            {[
              { label: "이전", icon: <ChevronLeft style={{ width: 14, height: 14 }} />, onClick: goPrev, disabled: currentIndex === 0, dir: "prev" },
              { label: "다음", icon: <ChevronRight style={{ width: 14, height: 14 }} />, onClick: goNext, disabled: currentIndex === filteredPhotos.length - 1, dir: "next" },
            ].map(({ label, icon, onClick, disabled, dir }) => (
              <button key={dir} type="button" onClick={onClick} disabled={disabled}
                style={{
                  height: 38, borderRadius: 8, border: "1px solid rgba(102,155,188,0.12)",
                  background: "transparent", color: "#7a9ab0", fontSize: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  opacity: disabled ? 0.4 : 1, fontFamily: "'DM Sans', sans-serif",
                }}>
                {dir === "prev" && icon}{label}{dir === "next" && icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ════ MOBILE (<md): fullscreen stack ════ */}
      <div className="md:hidden fixed inset-0 flex flex-col" style={{ background: "#0a0a0a" }}>

        {/* Topbar */}
        <div style={{
          height: 48, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0, zIndex: 20,
        }}>
          <Link href={`/c/${token}/gallery${queryString}`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)", fontSize: 12, textDecoration: "none",
            }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            갤러리
          </Link>
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,0.4)",
            maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {filename}
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>
            {currentIndex + 1} / {filteredPhotos.length}
          </span>
        </div>

        {/* Image */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
          {current.url
            ? <img src={current.url} alt={filename} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            : <div style={{ color: "#3a5a6e" }}>사진 없음</div>
          }
          <button type="button" onClick={goPrevWrap}
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronLeft style={{ width: 18, height: 18 }} />
          </button>
          <button type="button" onClick={goNextWrap}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronRight style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Bottom overlay */}
        <div style={{
          background: "rgba(13,30,40,0.97)", backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(102,155,188,0.12)",
          padding: "12px 16px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Select button */}
          <SelectButton />

          {/* Stars + Colors */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= (hoverStar || star || 0);
                return (
                  <button key={s} type="button"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{
                      fontSize: 22, lineHeight: 1, padding: "2px 3px",
                      color: filled ? "#f5a623" : "#3a5a6e",
                      background: "none", border: "none", cursor: "pointer",
                    }}>
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 20, background: "rgba(102,155,188,0.15)", flexShrink: 0 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color === opt.key;
                return (
                  <button key={opt.key} type="button" onClick={() => setColor(opt.key)}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", background: opt.color,
                      border: isActive ? "2px solid white" : "2px solid transparent",
                      boxShadow: isActive ? "0 0 0 2px rgba(255,255,255,0.3)" : "none",
                      cursor: "pointer", position: "relative", flexShrink: 0,
                    }}>
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
                background: "#152a3a", border: "1px solid rgba(102,155,188,0.12)",
                borderRadius: 7, color: "#e8eef2", fontSize: 12,
                fontFamily: "'DM Sans', sans-serif", resize: "none", height: 44, lineHeight: 1.5, outline: "none",
              }}
            />
            <button type="button" onClick={saveComment}
              style={{
                height: 44, padding: "0 14px", borderRadius: 7,
                background: "#1a3347", border: "1px solid rgba(102,155,188,0.12)",
                color: "#7a9ab0", fontSize: 12, cursor: "pointer", flexShrink: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}>
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
