"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RotateCcw, Check, ArrowUpDown } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import {
  buildFilterQueryString,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { GalleryFilterState } from "@/lib/gallery-filter";
import type { StarRating, ColorTag, SortOrder } from "@/types";
import { PS_DISPLAY } from "@/lib/photographer-theme";
import { BrandLogoBar } from "@/components/BrandLogo";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

const COLOR_OPTIONS: { key: ColorTag; hex: string }[] = [
  { key: "red",    hex: "#ff4757" },
  { key: "yellow", hex: "#ffd32a" },
  { key: "green",  hex: "#2ed573" },
  { key: "blue",   hex: "#1e90ff" },
  { key: "purple", hex: "#5352ed" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "filename", label: "파일명순" },
  { value: "oldest",   label: "번호순"  },
  { value: "newest",   label: "최신순"  },
];

const playfair: React.CSSProperties = { fontFamily: PS_DISPLAY };

export default function GalleryPageClient() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";

  const { project, photos, Y, N, toggle, selectedIds, photoStates, loading } = useSelection();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  // Local filter state
  const [tabFilter,    setTabFilter]    = useState<"all" | "selected">("all");
  const [starFilter,   setStarFilter]   = useState<number>(0);
  const [colorFilter,  setColorFilter]  = useState<ColorTag | null>(null);
  const [sortOrder,    setSortOrder]    = useState<SortOrder>("filename");
  const [hoverStar,    setHoverStar]    = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "preparing") { router.replace(`/c/${token}`);           return; }
    if (project.status === "confirmed") { router.replace(`/c/${token}/confirmed`); return; }
    if (project.status === "editing")   { router.replace(`/c/${token}/locked`);    return; }
  }, [project, token, router]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSortMenu]);

  // Derive GalleryFilterState for filtering + viewer links
  const filterState = useMemo<GalleryFilterState>(() => ({
    selectedFilter: tabFilter,
    starFilter: starFilter === 0 ? "all" : (starFilter as StarRating),
    colorFilter: colorFilter ?? "all",
    sortOrder,
  }), [tabFilter, starFilter, colorFilter, sortOrder]);

  const filteredPhotos = useMemo(
    () => getFilteredPhotos(photos, selectedIds, photoStates, filterState),
    [photos, selectedIds, photoStates, filterState]
  );

  const viewerQueryString = useMemo(
    () => buildFilterQueryString(filterState),
    [filterState]
  );

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
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

  // ── Loading / error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#050505" }}>
        <p className="text-sm" style={{ color: "#3a5a6e" }}>갤러리 불러오는 중...</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4" style={{ background: "#050505" }}>
        <p className="text-sm" style={{ color: "#3a5a6e" }}>존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (!loading && photos.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4" style={{ background: "#050505" }}>
        <p className="text-sm" style={{ color: "#3a5a6e" }}>사진을 불러올 수 없습니다.</p>
        <Link href={`/c/${token}`}
          className="rounded-xl px-4 py-2 text-[13px] transition-colors hover:opacity-80"
          style={{ border: "none", background: "rgba(255,255,255,0.06)", color: "#7aa3ff" }}>
          초대 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  const canConfirm = Y === N;
  const progressPct = N > 0 ? Math.min((Y / N) * 100, 100) : 0;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? "파일명순";

  return (
    <div style={{ background: "#050505", minHeight: "100vh", paddingBottom: 80 }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-[100] flex h-12 items-center justify-between px-4"
        style={{ background: "rgba(10,10,11,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Logo */}
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />

        {/* Right: photographer + count */}
        <div className="flex items-center gap-2.5">
          {photographer && (
            <span className="text-[12px]" style={{ color: "#a1a1aa" }}>
              {photographer.name || "작가"}
            </span>
          )}
          <span
            className="rounded-full px-[9px] py-[3px] text-[12px] font-semibold"
            style={{ background: "rgba(79,126,255,0.14)", border: "none", color: "#7aa3ff" }}
          >
            {Y} / {N}
          </span>
        </div>
      </header>

      {/* ── Filter bar ── */}
      <div
        className={`sticky top-12 ${showSortMenu ? "z-[110]" : "z-[90]"}`}
        style={{ background: "rgba(10,10,11,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className={`flex items-center gap-1.5 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            showSortMenu ? "overflow-visible" : "overflow-x-auto"
          }`}
        >
          {/* Tabs: 전체 / 선택됨 */}
          {(["all", "selected"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTabFilter(v)}
              className="shrink-0 rounded-full text-[12px] font-medium transition-all"
              style={{
                padding: "5px 12px",
                border: "none",
                background: tabFilter === v ? "rgba(79,126,255,0.15)" : "rgba(255,255,255,0.05)",
                color: tabFilter === v ? "#7aa3ff" : "#a1a1aa",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {v === "all" ? "전체" : "선택됨"}
            </button>
          ))}

          <span className="w-2 shrink-0" aria-hidden />

          {/* Interactive star filter */}
          {([1, 2, 3, 4, 5] as const).map((s) => {
            const filled = s <= (hoverStar || starFilter);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStarFilter((prev) => (prev === s ? 0 : s))}
                onMouseEnter={() => setHoverStar(s)}
                onMouseLeave={() => setHoverStar(0)}
                className="shrink-0 transition-transform hover:scale-[1.2]"
                style={{
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "4px 2px",
                  color: filled ? "#f5a623" : "#3a5a6e",
                  userSelect: "none",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.1s, transform 0.1s",
                }}
              >
                {filled ? "★" : "☆"}
              </button>
            );
          })}

          <span className="w-2 shrink-0" aria-hidden />

          {/* Color dot filters */}
          {COLOR_OPTIONS.map((opt) => {
            const isActive = colorFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setColorFilter((prev) => (prev === opt.key ? null : opt.key))}
                className="shrink-0 flex items-center justify-center transition-all"
                title={opt.key}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 20,
                  padding: "5px 6px",
                  border: isActive ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <span
                  className="block rounded-full"
                  style={{ width: 14, height: 14, background: opt.hex, flexShrink: 0 }}
                />
              </button>
            );
          })}

          {/* Reset: star + color only */}
          <button
            type="button"
            onClick={() => { setStarFilter(0); setColorFilter(null); }}
            className="shrink-0 flex items-center justify-center transition-all hover:opacity-70"
            title="초기화"
            style={{
              padding: "4px 6px",
              borderRadius: 6,
              border: "none",
              color: "#71717a",
              background: "rgba(255,255,255,0.06)",
              cursor: "pointer",
            }}
          >
            <RotateCcw style={{ width: 13, height: 13 }} />
          </button>

          {/* Sort button – margin-left auto → right-aligned */}
          <div className="relative shrink-0" style={{ marginLeft: "auto" }} ref={sortRef}>
            <button
              type="button"
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-1.5 transition-all"
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "none",
                color: "#a1a1aa",
                fontSize: 11,
                background: "rgba(255,255,255,0.05)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <ArrowUpDown style={{ width: 11, height: 11 }} />
              {currentSortLabel}
            </button>
            {showSortMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-[200] overflow-hidden rounded-lg shadow-xl"
                style={{ background: "rgba(24,24,27,0.96)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 100 }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSortOrder(opt.value); setShowSortMenu(false); }}
                    className="block w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[rgba(79,126,255,0.08)]"
                    style={{ color: sortOrder === opt.value ? "#4f7eff" : "#a1a1aa", background: "none", cursor: "pointer" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Gallery grid ── */}
      <div style={{ padding: "10px 10px 20px" }}>
        <div className="grid grid-cols-3 gap-[6px] sm:grid-cols-4 lg:grid-cols-8">
          {filteredPhotos.map((photo) => {
            const selected = selectedIds.has(photo.id);
            const state = photoStates[photo.id];
            const rating = state?.rating;
            const colorTag = state?.color;
            const colorHex = colorTag ? COLOR_OPTIONS.find((c) => c.key === colorTag)?.hex : null;

            return (
              <Link
                key={photo.id}
                href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
                className="group relative block overflow-hidden rounded-[8px] transition-transform hover:scale-[1.02]"
                style={{
                  aspectRatio: "1 / 1",
                  background: "rgba(39,39,42,0.75)",
                  border: selected ? "2px solid #4f7eff" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Selected tint overlay */}
                {selected && (
                  <div
                    className="pointer-events-none absolute inset-0 z-[1]"
                    style={{ background: "rgba(79,126,255,0.12)" }}
                  />
                )}

                {/* Image */}
                <img
                  src={photo.url || `https://picsum.photos/seed/${photo.id.replace(/\D/g, "") || "1"}/400/400`}
                  alt={getPhotoDisplayName(photo)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />

                {/* Check badge (top-left) */}
                <button
                  type="button"
                  onClick={(e) => handleCheckClick(e, photo.id)}
                  aria-label={selected ? "선택 해제" : "선택"}
                  className={`absolute left-[5px] top-[5px] z-[2] flex items-center justify-center rounded-full transition-opacity ${
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    width: 20,
                    height: 20,
                    background: selected ? "#4f7eff" : "rgba(0,0,0,0.45)",
                    border: selected ? "2px solid white" : "1.5px solid rgba(255,255,255,0.55)",
                  }}
                >
                  {selected && <Check style={{ width: 10, height: 10, color: "white", strokeWidth: 3 }} />}
                </button>

                {/* Number badge (top-right) */}
                <div
                  className="absolute right-[5px] top-[4px] z-[2] rounded px-[4px] py-[1px]"
                  style={{ background: "rgba(0,0,0,0.3)", fontSize: 9, color: "rgba(255,255,255,0.5)" }}
                >
                  {photo.orderIndex}
                </div>

                {/* Bottom info panel: 2 rows */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-[2] flex flex-col"
                  style={{ background: "rgba(0,0,0,0.52)", padding: "2px 5px 3px" }}
                >
                  {/* Row 1: filename */}
                  <span
                    className="block truncate"
                    style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", lineHeight: "14px" }}
                  >
                    {getPhotoDisplayName(photo)}
                  </span>
                  {/* Row 2: stars (left) + color dot (right) */}
                  <div className="flex items-center justify-between" style={{ minHeight: 12 }}>
                    <div className="flex items-center gap-[1px]">
                      {rating != null && rating > 0
                        ? Array.from({ length: rating }, (_, i) => (
                            <span key={i} style={{ fontSize: 9, color: "#f5a623", lineHeight: 1 }}>★</span>
                          ))
                        : <span style={{ fontSize: 9, color: "transparent", lineHeight: 1 }}>★</span>
                      }
                    </div>
                    {colorHex ? (
                      <span
                        className="rounded-full"
                        style={{ width: 8, height: 8, background: colorHex, border: "1px solid rgba(255,255,255,0.55)", flexShrink: 0, display: "block" }}
                      />
                    ) : (
                      <span style={{ width: 8, height: 8, display: "block" }} />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-4 py-2.5 backdrop-blur"
        style={{ background: "rgba(9,9,11,0.98)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Left: text + progress */}
        <div className="flex flex-1 flex-col gap-[3px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "#a1a1aa" }}>선택 {Y} / {N}</span>
            {Y < N  && <span className="text-[12px] font-medium" style={{ color: "#f5a623" }}>{N - Y}개 더 선택 필요</span>}
            {Y === N && <span className="text-[12px] font-medium" style={{ color: "#2ed573" }}>선택 완료!</span>}
            {Y > N  && <span className="text-[12px] font-medium" style={{ color: "#f5a623" }}>{Y - N}개 초과 선택</span>}
          </div>
          <div
            className="h-[3px] overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, background: "#4f7eff" }}
            />
          </div>
        </div>

        {/* Right: confirm button */}
        <button
          type="button"
          onClick={() => canConfirm && setShowConfirmModal(true)}
          disabled={!canConfirm}
          className="shrink-0 rounded-[10px] text-[13px] font-semibold transition-all"
          style={{
            height: 44,
            padding: "0 20px",
            background: canConfirm ? "#4f7eff" : "rgba(63,63,70,0.55)",
            color: canConfirm ? "white" : "#3a5a6e",
            border: "none",
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
        >
          최종확정
        </button>
      </div>

      {/* ── Confirm modal ── */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => !confirming && setShowConfirmModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ background: "rgba(20,20,22,0.96)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="mb-2 text-[16px] font-bold"
              style={{ ...playfair, color: "#fafafa" }}
            >
              선택 확정
            </h3>
            <p className="mb-6 text-[13px] leading-relaxed" style={{ color: "#a1a1aa" }}>
              <span style={{ color: "#4f7eff", fontWeight: 600 }}>{Y}장</span>을 최종 선택으로 확정하시겠습니까?
              <br />확정 후에는 수정이 제한됩니다.
            </p>
            {confirmError && (
              <p className="mb-3 text-[12px]" style={{ color: "#ff4757" }} role="alert">
                {confirmError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !confirming && setShowConfirmModal(false)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl text-[13px]"
                style={{ border: "none", color: "#a1a1aa", background: "rgba(255,255,255,0.06)" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="flex h-11 flex-1 items-center justify-center rounded-xl text-[13px] font-semibold disabled:opacity-60"
                style={{ background: "#4f7eff", color: "white", border: "none" }}
              >
                {confirming ? "처리 중..." : "확정"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
