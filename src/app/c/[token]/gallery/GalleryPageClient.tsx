"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelection } from "@/contexts/SelectionContext";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import {
  appendGalleryScrollQuery,
  buildFilterQueryString,
  GALLERY_FOCUS_PARAM,
  GALLERY_SCROLL_PARAM,
  galleryThumbPriorityProps,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { GalleryFilterState } from "@/lib/gallery-filter";
import type { StarRating, ColorTag, SortOrder } from "@/types";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
type TabFilter = "all" | "selected";

const COLOR_OPTIONS: { key: ColorTag; hex: string }[] = [
  { key: "red",    hex: "#ef4444" },
  { key: "yellow", hex: "#f59e0b" },
  { key: "green",  hex: "#22c55e" },
  { key: "blue",   hex: "#3b82f6" },
  { key: "purple", hex: "#8b5cf6" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "filename", label: "Sort: Filename" },
  { value: "oldest",   label: "Sort: Number"   },
  { value: "newest",   label: "Sort: Newest"   },
];

export default function GalleryPageClient() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = (params?.token as string) ?? "";

  const { project, photos, Y, N, toggle, selectedIds, photoStates, loading, updatePhotoState } = useSelection();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  const [tabFilter,     setTabFilter]     = useState<TabFilter>("all");
  const [starFilter,    setStarFilter]    = useState<number>(0);
  const [colorFilter,   setColorFilter]   = useState<ColorTag[]>([]);
  const [sortOrder,     setSortOrder]     = useState<SortOrder>("filename");
  const [hoverStar,     setHoverStar]     = useState(0);
  const [gridStarHover, setGridStarHover] = useState<{ photoId: string; star: number } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);
  const [galleryThumbFocusId, setGalleryThumbFocusId] = useState<string | null>(null);

  const galleryScrollKey = token ? `ps:c-gallery-scroll:${token}` : "";

  /* 브라우저 기본 스크롤 복원과 충돌하지 않도록 (갤러리에 있는 동안만 manual) */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = prev;
    };
  }, []);

  /* 스크롤·썸네일 포커스 복원: 페인트 전에 적용 + gs/gf 정리는 router.replace 1회만 */
  useLayoutEffect(() => {
    if (loading || typeof window === "undefined") return;

    const gsRaw = searchParams.get(GALLERY_SCROLL_PARAM);
    const gfRaw = searchParams.get(GALLERY_FOCUS_PARAM);
    const hasGsParam = gsRaw != null;
    const hasGfParam = gfRaw != null;

    if (hasGsParam) {
      const y = Number(gsRaw);
      if (Number.isFinite(y) && y >= 0) {
        window.scrollTo({ top: y, behavior: "auto" });
      }
      try {
        if (galleryScrollKey) sessionStorage.removeItem(galleryScrollKey);
      } catch {
        /* ignore */
      }
    } else if (galleryScrollKey) {
      try {
        const raw = sessionStorage.getItem(galleryScrollKey);
        if (raw != null) {
          sessionStorage.removeItem(galleryScrollKey);
          const y = Number(raw);
          if (Number.isFinite(y) && y >= 0) {
            window.scrollTo({ top: y, behavior: "auto" });
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (hasGfParam) {
      setGalleryThumbFocusId(gfRaw);
    }

    if (hasGsParam || hasGfParam) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(GALLERY_SCROLL_PARAM);
      next.delete(GALLERY_FOCUS_PARAM);
      const q = next.toString();
      router.replace(`/c/${token}/gallery${q ? `?${q}` : ""}`, { scroll: false });
    }
  }, [loading, galleryScrollKey, searchParams, token, router]);

  /* ── Photographer info ── */
  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  /* ── Status redirects ── */
  useEffect(() => {
    if (!project) return;
    if (project.status === "preparing") { router.replace(`/c/${token}`);           return; }
    if (project.status === "confirmed") { router.replace(`/c/${token}/confirmed`); return; }
    if (project.status === "editing")   { router.replace(`/c/${token}/locked`);    return; }
  }, [project, token, router]);

  /* ── Filter state ── */
  const filterState = useMemo<GalleryFilterState>(() => ({
    selectedFilter: tabFilter === "selected" ? "selected" : "all",
    starFilter:     starFilter === 0 ? "all" : (starFilter as StarRating),
    colorFilter:    colorFilter.length > 0 ? colorFilter : "all",
    sortOrder,
  }), [tabFilter, starFilter, colorFilter, sortOrder]);

  const filteredPhotos = useMemo(() => {
    return getFilteredPhotos(photos, selectedIds, photoStates, filterState);
  }, [photos, selectedIds, photoStates, filterState]);

  /* ── Thumbnail focus index ── */
  const galleryFocusIndex = useMemo(() => {
    if (!galleryThumbFocusId) return null;
    const i = filteredPhotos.findIndex((p) => p.id === galleryThumbFocusId);
    return i >= 0 ? i : null;
  }, [filteredPhotos, galleryThumbFocusId]);

  /* ── Priority preload on focus ── */
  useEffect(() => {
    if (galleryFocusIndex == null || filteredPhotos.length === 0) return;
    const anchor  = galleryFocusIndex;
    const ordered: string[] = [];
    const push = (i: number) => { const u = filteredPhotos[i]?.url; if (u) ordered.push(u); };
    push(anchor);
    for (let d = 1; d < filteredPhotos.length; d++) {
      if (anchor - d >= 0) push(anchor - d);
      if (anchor + d < filteredPhotos.length) push(anchor + d);
    }
    const seen = new Set<string>();
    ordered.forEach((url, i) => {
      if (seen.has(url)) return;
      seen.add(url);
      const img = document.createElement("img");
      img.decoding      = "async";
      img.fetchPriority = i < 24 ? "high" : "low";
      img.src = url;
    });
  }, [galleryFocusIndex, filteredPhotos]);

  const viewerQueryString = useMemo(() => buildFilterQueryString(filterState), [filterState]);

  /* ── Handlers ── */
  const handleCheckClick = useCallback((e: React.MouseEvent, photoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(photoId);
  }, [toggle]);

  const handleConfirm = useCallback(async () => {
    if (!project?.id || !token) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/c/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, project_id: project.id, selected_photo_ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setConfirmError((data as { error?: string }).error ?? `오류 (${res.status})`);
        setConfirming(false);
        return;
      }
      setShowConfirmModal(false);
      router.push(`/c/${token}/confirmed`);
      window.location.href = `/c/${token}/confirmed`;
    } catch (e) {
      console.error(e);
      setConfirming(false);
    }
  }, [project?.id, token, router]);

  /* ── Loading / error states ── */
  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--subtle-foreground)", letterSpacing: "0.1em" }}>
          LOADING_GALLERY...
        </p>
      </div>
    );
  }
  if (!project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--subtle-foreground)" }}>INVALID_TOKEN</p>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (!loading && photos.length === 0) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--background)" }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--subtle-foreground)" }}>NO_PHOTOS_FOUND</p>
        <Link href={`/c/${token}`} style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--accent)", textDecoration: "none", border: "1px solid var(--border-subtle)", padding: "8px 16px" }}>
          ← BACK_TO_INVITE
        </Link>
      </div>
    );
  }

  const canConfirm  = Y === N;
  const progressPct = N > 0 ? Math.min(Math.round((Y / N) * 100), 100) : 0;
  const remaining   = N - Y;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;900&family=Space+Mono:wght@400;700&display=swap');

        .gl-grid-bg {
          position: fixed; inset: 0;
          background-image: linear-gradient(var(--border-subtle) 1px, transparent 1px),
                            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none; z-index: 0; opacity: 0.5;
        }

        .gl-photo-card {
          position: relative;
          aspect-ratio: 1 / 1;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer; overflow: hidden;
          display: block; text-decoration: none;
        }
        .gl-photo-card img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.6s ease; display: block;
        }
        .gl-photo-card:hover img { transform: scale(1.05); }
        .gl-photo-card.gl-selected {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 1px var(--accent);
        }
        .gl-photo-card.gl-selected .gl-check-box {
          background: var(--accent) !important; border-color: var(--accent) !important;
        }

        .gl-card-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 40%, transparent 70%);
          opacity: 1; z-index: 15; pointer-events: none;
          padding: 10px; display: flex; flex-direction: column; justify-content: flex-end;
        }
        .gl-card-overlay .gl-overlay-interactive { pointer-events: auto; }

        .gl-check-box {
          position: absolute; top: 10px; left: 10px;
          width: 22px; height: 22px;
          border: 1.5px solid rgba(255,255,255,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 20; transition: all 0.2s ease;
          background: rgba(0,0,0,0.35);
        }
        .gl-filter-tab {
          position: relative; padding: 8px 14px;
          font-size: 12px; font-weight: 700; color: var(--subtle-foreground);
          transition: color 0.2s; background: none; border: none;
          cursor: pointer; white-space: nowrap; font-family: inherit;
        }
        .gl-filter-tab.gl-tab-active { color: var(--accent); }
        .gl-filter-tab.gl-tab-active::after {
          content: ''; position: absolute; bottom: -1px; left: 0;
          width: 100%; height: 2px; background: var(--accent);
        }

        .gl-btn-confirm {
          background: var(--accent); color: #000; font-weight: 900;
          font-family: inherit; transition: all 0.3s ease;
          clip-path: polygon(0 0, 100% 0, 100% 65%, 88% 100%, 0 100%);
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px;
        }
        .gl-btn-confirm:disabled {
          opacity: 0.4; cursor: not-allowed;
          background: var(--border-strong);
        }
        .gl-btn-confirm:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(var(--accent-rgb), 0.3);
        }

        .gl-modal-bracket {
          position: absolute; width: 12px; height: 12px;
          border-color: var(--accent); pointer-events: none;
        }
        .gl-modal-b-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .gl-modal-b-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .gl-modal-b-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .gl-modal-b-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: var(--background); }
        ::-webkit-scrollbar-thumb { background: var(--accent); }

        @media (max-width: 767px) {
          /* 헤더 상단 줄 */
          .gl-header-top { height: 56px !important; padding: 0 14px !important; }
          .gl-header-project-title { font-size: 15px !important; }
          .gl-header-deadline { display: none; }
          .gl-photographer-section { display: none !important; }
          .gl-header-selected-label { display: none; }
          .gl-header-selected-count { font-size: 20px !important; }

          /* 필터 바 — 가로 스크롤 단일 행 */
          .gl-header-filter {
            height: 44px !important;
            padding: 0 8px !important;
            justify-content: flex-start !important;
            gap: 4px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            flex-wrap: nowrap !important;
          }
          .gl-filter-right {
            flex-shrink: 0;
            gap: 8px !important;
          }
          .gl-filter-tab { padding: 6px 10px !important; font-size: 11px !important; }
          .gl-filter-divider { margin: 0 4px !important; }
          .gl-filter-stars button { width: 20px !important; height: 20px !important; font-size: 12px !important; }

          /* 그리드 */
          .gl-page-wrapper { padding-top: 104px !important; padding-bottom: 72px !important; }
          .gl-grid-main { padding: 0 6px !important; }
          .gl-photo-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 3px !important; }

          /* 카드 오버레이 — 모바일 크기 축소 */
          .gl-card-overlay { padding: 6px !important; }
          .gl-card-overlay p { font-size: 7px !important; margin-bottom: 2px !important; }
          .gl-card-overlay .gl-overlay-interactive button { font-size: 8px !important; }
          .gl-card-overlay .gl-overlay-interactive span { width: 5px !important; height: 5px !important; }

          /* 체크박스 크기 */
          .gl-check-box { width: 18px !important; height: 18px !important; top: 6px !important; left: 6px !important; }

          /* 하단 바 */
          .gl-footer-inner { height: 60px !important; padding: 0 14px !important; gap: 12px !important; }
          .gl-footer-meta { display: none !important; }
          .gl-footer-progress { gap: 4px !important; }
          .gl-footer-progress-label { font-size: 9px !important; }
          .gl-btn-confirm { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
          .gl-filter-sort { display: none !important; }
        }
      `}</style>

      <div className="gl-page-wrapper" style={{ background: "var(--background)", minHeight: "100vh", paddingTop: 140, paddingBottom: 100 }}>
        <div className="gl-grid-bg" />

        {/* ── Header ── */}
        <header style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          background: "rgba(10,10,12,0.90)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}>
          {/* Top row */}
          <div className="gl-header-top" style={{ maxWidth: 1800, margin: "0 auto", height: 80, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Link href={token ? `/c/${token}` : "#"} style={{ textDecoration: "none" }}>
                <div style={{ width: 32, height: 32, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>A</div>
              </Link>
              <div>
                <h1 className="gl-header-project-title" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", lineHeight: 1, color: "var(--foreground)", margin: 0 }}>
                  {project.name}
                </h1>
                <p className="gl-header-deadline" style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "var(--subtle-foreground)", marginTop: 4, letterSpacing: "0.1em" }}>
                  DEADLINE // {format(new Date(project.deadline), "yyyy.MM.dd", { locale: ko })}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              {photographer?.name && (
                <>
                  <div className="gl-photographer-section" style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "var(--subtle-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Photography by</p>
                    <p style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)", marginTop: 2 }}>{photographer.name}</p>
                  </div>
                  <div className="gl-photographer-section" style={{ width: 1, height: 32, background: "var(--border)", flexShrink: 0 }} />
                </>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="gl-header-selected-label" style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>SELECTED</span>
                  <span className="gl-header-selected-count" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, lineHeight: 1, color: "var(--foreground)" }}>
                    {Y}{" "}
                    <span style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 12, color: "var(--disabled-foreground)", fontWeight: 400 }}>/ {N}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.5)" }}>
            <div className="gl-header-filter" style={{ maxWidth: 1800, margin: "0 auto", height: 56, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", overflowX: "auto" }}>
              {/* Left: tabs + star buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {(["all", "selected"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTabFilter(v)}
                    className={`gl-filter-tab${tabFilter === v ? " gl-tab-active" : ""}`}
                  >
                    {v === "all" ? "전체 사진" : "선택됨"}
                  </button>
                ))}

                <div className="gl-filter-divider" style={{ width: 1, height: 16, background: "var(--border)", margin: "0 8px", flexShrink: 0 }} />

                {/* Star filter */}
                <div className="gl-filter-stars" style={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 13, color: starFilter > 0 ? "var(--accent)" : "var(--disabled-foreground)", fontFamily: "'Space Mono', monospace", marginRight: 3, lineHeight: 1, userSelect: "none" }}>≥</span>
                  {([1, 2, 3, 4, 5] as const).map((s) => {
                    const filled = s <= (hoverStar || starFilter);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setStarFilter((prev) => (prev === s ? 0 : s)); setHoverStar(0); window.setTimeout(() => setHoverStar(0), 0); }}
                        onMouseEnter={() => setHoverStar(s)}
                        onMouseLeave={() => setHoverStar(0)}
                        style={{
                          width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, lineHeight: 1, color: filled ? "var(--accent)" : "var(--disabled-foreground)",
                          background: "none", border: "none", cursor: "pointer",
                          transition: "color 0.1s, transform 0.1s",
                          transform: hoverStar === s ? "scale(1.2)" : "scale(1)",
                        }}
                      >
                        {filled ? "★" : "☆"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: colors + reset + sort */}
              <div className="gl-filter-right" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  {COLOR_OPTIONS.map((opt) => {
                    const isActive = colorFilter.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        title={opt.key}
                        onClick={() =>
                          setColorFilter((prev) =>
                            prev.includes(opt.key)
                              ? prev.filter((c) => c !== opt.key)
                              : [...prev, opt.key]
                          )
                        }
                        style={{
                          width: 13, height: 13, borderRadius: "50%",
                          background: opt.hex,
                          border: isActive ? "2px solid var(--foreground)" : "2px solid transparent",
                          cursor: "pointer", flexShrink: 0, outline: "none", transition: "border-color 0.15s",
                        }}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  title="초기화"
                  onClick={() => { setStarFilter(0); setColorFilter([]); setHoverStar(0); window.setTimeout(() => setHoverStar(0), 0); }}
                  style={{ background: "none", border: "none", color: "var(--disabled-foreground)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px 6px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--disabled-foreground)")}
                >
                  <RotateCcw style={{ width: 12, height: 12 }} />
                </button>

                <select
                  className="gl-filter-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  style={{ background: "transparent", fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, textTransform: "uppercase", border: "1px solid var(--border)", padding: "4px 8px", color: "var(--muted-foreground)", outline: "none", cursor: "pointer" }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} style={{ background: "var(--surface-raised)" }}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* ── Gallery Grid ── */}
        <main className="gl-grid-main" style={{ position: "relative", zIndex: 10, maxWidth: 1800, margin: "0 auto", padding: "0 24px" }}>
          <div className="gl-photo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
            {filteredPhotos.map((photo, gridIndex) => {
              const selected  = selectedIds.has(photo.id);
              const state     = photoStates[photo.id];
              const rating    = state?.rating;
              const colorTags = state?.color ?? [];

              return (
                <Link
                  key={photo.id}
                  href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    const path = `/c/${token}/viewer/${photo.id}${appendGalleryScrollQuery(viewerQueryString, window.scrollY)}`;
                    router.push(path);
                    try { if (galleryScrollKey) sessionStorage.setItem(galleryScrollKey, String(window.scrollY)); } catch { /* */ }
                  }}
                  className={`gl-photo-card${selected ? " gl-selected" : ""}`}
                >
                  <img
                    src={photo.url}
                    alt={getPhotoDisplayName(photo)}
                    {...galleryThumbPriorityProps(gridIndex, galleryFocusIndex, { whenNoFocus: "lazy" })}
                    decoding="async"
                    draggable={false}
                  />

                  <button
                    type="button"
                    onClick={(e) => handleCheckClick(e, photo.id)}
                    aria-label={selected ? "선택 해제" : "선택"}
                    className="gl-check-box"
                  >
                    {selected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={4}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <div className="gl-card-overlay">
                    <div className="gl-card-overlay-content">
                    <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                      {getPhotoDisplayName(photo)}
                    </p>
                    <div className="gl-overlay-interactive" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 14 }}>
                      <div
                        style={{ display: "flex", gap: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseLeave={() => setGridStarHover((h) => (h?.photoId === photo.id ? null : h))}
                      >
                        {([1, 2, 3, 4, 5] as const).map((s) => {
                          const hoverVal      = gridStarHover?.photoId === photo.id ? gridStarHover.star : 0;
                          const currentRating = Number(rating) || 0;
                          const displayRating = hoverVal || currentRating;
                          const isHovering    = hoverVal > 0;
                          // hover 없고 rating 없으면 숨김, hover 없고 rating 있으면 채워진 별만 표시
                          if (!isHovering && s > currentRating) return null;
                          const filled = s <= displayRating;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const cur = photoStates[photo.id]?.rating != null ? Number(photoStates[photo.id]?.rating) as StarRating : undefined;
                                updatePhotoState(photo.id, { rating: cur === s ? undefined : s });
                                setGridStarHover(null);
                                window.setTimeout(() => setGridStarHover(null), 0);
                              }}
                              onMouseEnter={() => setGridStarHover({ photoId: photo.id, star: s })}
                              style={{ fontSize: 9, lineHeight: 1, padding: 0, border: "none", background: "none", cursor: "pointer", color: filled ? "var(--accent)" : "rgba(60,60,70,0.95)" }}
                            >
                              {filled ? "★" : "☆"}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                        {colorTags.map((tag) => {
                          const hex = COLOR_OPTIONS.find((c) => c.key === tag)?.hex;
                          return hex ? <span key={tag} style={{ width: 6, height: 6, borderRadius: "50%", background: hex, display: "block", flexShrink: 0 }} /> : null;
                        })}
                      </div>
                    </div>
                    </div>{/* gl-card-overlay-content */}
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredPhotos.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
              <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--border-strong)", letterSpacing: "0.1em" }}>NO_RESULTS</p>
              <p style={{ fontSize: 12, color: "var(--subtle-foreground)" }}>필터 조건에 맞는 사진이 없습니다</p>
            </div>
          )}
        </main>

        {/* ── Bottom Bar ── */}
        <SelectionConfirmFooter
          Y={Y}
          N={N}
          position="fixed"
          disabled={!canConfirm}
          onConfirm={() => canConfirm && setShowConfirmModal(true)}
          zIndex={50}
        />

        {/* ── Confirm Modal ── */}
        {showConfirmModal && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16 }}
            onClick={() => !confirming && setShowConfirmModal(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--accent)", padding: 40, position: "relative" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="gl-modal-bracket gl-modal-b-tl" />
              <div className="gl-modal-bracket gl-modal-b-tr" />
              <div className="gl-modal-bracket gl-modal-b-bl" />
              <div className="gl-modal-bracket gl-modal-b-br" />

              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, textTransform: "uppercase", fontStyle: "italic", marginBottom: 16, color: "var(--foreground)" }}>
                Confirm Selection
              </h3>
              <p style={{ color: "var(--muted-foreground)", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
                총 <span style={{ color: "var(--accent)", fontWeight: 700 }}>{Y}장</span>의 사진이 선택되었습니다.
              </p>

              {confirmError && (
                <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }} role="alert">{confirmError}</p>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => !confirming && setShowConfirmModal(false)}
                  style={{ flex: 1, height: 48, border: "1px solid var(--border)", background: "none", color: "var(--muted-foreground)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--foreground)"; e.currentTarget.style.color = "#000"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirming}
                  style={{ flex: 1, height: 48, background: "var(--accent)", color: "#000", fontSize: 13, fontWeight: 900, textTransform: "uppercase", border: "none", cursor: confirming ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: confirming ? 0.6 : 1 }}
                >
                  {confirming ? "처리 중..." : "확정 및 전송"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
