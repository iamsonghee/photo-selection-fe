"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Aperture, RotateCcw } from "lucide-react";
import { useSelection, SelectionConfirmBar } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import {
  parseFilterFromSearchParams,
  buildFilterQueryString,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { StarRating, ColorTag, SortOrder } from "@/types";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

const STAR_OPTIONS: { value: StarRating | "all"; label: string }[] = [
  { value: "all", label: "모두" },
  { value: 5, label: "★5" },
  { value: 4, label: "★4" },
  { value: 3, label: "★3" },
  { value: 2, label: "★2" },
  { value: 1, label: "★1" },
];

const COLOR_OPTIONS: { value: ColorTag | "none" | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "red", label: "빨강" },
  { value: "yellow", label: "노랑" },
  { value: "green", label: "초록" },
  { value: "blue", label: "파랑" },
  { value: "purple", label: "보라" },
  { value: "none", label: "미선택" },
];

const COLOR_HEX: Record<ColorTag, string> = {
  red: "#ff4757",
  yellow: "#f5a623",
  green: "#2ed573",
  blue: "#4f7eff",
  purple: "#9c27b0",
};

function getTestImageUrl(photoId: string, size = "400/400") {
  const seed = photoId.replace(/\D/g, "") || "1";
  return `https://picsum.photos/seed/${seed}/${size}`;
}

const playfair: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };
const headerBg: React.CSSProperties = { background: "rgba(13,30,40,0.9)", backdropFilter: "blur(12px)" };

export default function GalleryPageClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (params?.token as string) ?? "";

  const [urlSearch, setUrlSearch] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.location.search : null
  );
  useEffect(() => {
    const syncFromUrl = () => setUrlSearch(typeof window !== "undefined" ? window.location.search : "");
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const paramsToRead = useMemo(() => {
    if (urlSearch !== null) {
      return new URLSearchParams(urlSearch.startsWith("?") ? urlSearch : `?${urlSearch}`);
    }
    return searchParams;
  }, [urlSearch, searchParams]);

  const { project, photos, Y, N, toggle, isSelected, selectedIds, photoStates, loading } = useSelection();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  const filterState = useMemo(() => parseFilterFromSearchParams(paramsToRead), [paramsToRead]);
  const { starFilter, colorFilter, selectedFilter, sortOrder } = filterState;

  const filteredPhotos = useMemo(
    () => getFilteredPhotos(photos, selectedIds, photoStates, filterState),
    [photos, selectedIds, photoStates, filterState]
  );

  const viewerQueryString = useMemo(() => buildFilterQueryString(filterState), [filterState]);

  const updateFilter = useCallback(
    (patch: Partial<typeof filterState>) => {
      const next: typeof filterState = { ...filterState, ...patch };
      const qs = buildFilterQueryString(next);
      router.replace(`/c/${token}/gallery${qs}`, { scroll: false });
      setUrlSearch(qs.startsWith("?") ? qs.slice(1) : qs ? qs : "");
    },
    [filterState, router, token]
  );

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed") { router.replace(`/c/${token}/confirmed`); return; }
    if (project.status === "editing") { router.replace(`/c/${token}/locked`); return; }
  }, [project, token, router]);

  const loadFailed = !loading && project != null && photos.length === 0;

  const handleCheckClick = useCallback(
    (e: React.MouseEvent, photoId: string) => {
      e.preventDefault();
      e.stopPropagation();
      toggle(photoId);
    },
    [toggle]
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">갤러리 불러오는 중...</p></div>;
  }
  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090d] px-4">
        <p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (loadFailed || photos.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090d] px-4">
        <p className="text-sm text-[#5a5f78]">사진을 불러올 수 없습니다.</p>
        <Link href={`/c/${token}`} className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]">
          초대 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  const selectionStatus = Y === N ? "done" : Y < N ? "under" : "over";
  const progressPct = N > 0 ? Math.min((Y / N) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-[#09090d] pb-40">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#1e2236] px-4" style={headerBg}>
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2">
            <Aperture className="h-4 w-4 text-[#4f7eff]" />
            <span className="text-[15px] font-bold text-[#e8eaf0]" style={playfair}>A컷</span>
          </div>
          <div className="flex items-center gap-2">
            {photographer && (
              <div className="flex items-center gap-1.5 rounded-full border border-[#1e2236] bg-[#1a1d24] px-2 py-0.5">
                <img src={getProfileImageUrl(photographer.profile_image_url)} alt="" className="h-4 w-4 rounded-full object-cover" />
                <span className="max-w-[70px] truncate text-[11px] text-[#8b90a8]">{photographer.name || "작가"}</span>
              </div>
            )}
            <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
              selectionStatus === "done" ? "bg-[#2ed573]/10 text-[#2ed573]" :
              selectionStatus === "over" ? "bg-[#f5a623]/10 text-[#f5a623]" :
              "bg-[#ff4757]/10 text-[#ff4757]"
            }`}>
              {Y} / {N}
            </span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-[#1e2236]">
          <div className="h-full bg-[#4f7eff] transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      {/* Filter bar */}
      <div className="border-b border-[#1e2236] bg-[#111318]/95 px-4 py-2">
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          {/* Selected filter */}
          {(["all", "selected"] as const).map((v) => (
            <button key={v} type="button" onClick={() => updateFilter({ selectedFilter: v })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${selectedFilter === v ? "bg-[#4f7eff]/20 text-[#4f7eff]" : "text-[#8b90a8] hover:bg-[#1e2236]"}`}>
              {v === "all" ? "전체" : "선택됨"}
            </button>
          ))}
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          {/* Star filter */}
          {STAR_OPTIONS.map((opt) => (
            <button key={String(opt.value)} type="button" onClick={() => updateFilter({ starFilter: opt.value })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${starFilter === opt.value ? "bg-[#4f7eff]/20 text-[#4f7eff]" : "text-[#8b90a8] hover:bg-[#1e2236]"}`}>
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          {/* Color filter */}
          {COLOR_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => updateFilter({ colorFilter: opt.value })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${colorFilter === opt.value ? "bg-[#4f7eff]/20 text-[#4f7eff]" : "text-[#8b90a8] hover:bg-[#1e2236]"}`}>
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          <select value={sortOrder} onChange={(e) => updateFilter({ sortOrder: e.target.value as SortOrder })}
            className="shrink-0 rounded-lg border border-[#1e2236] bg-[#1a1d24] px-2 py-1 text-[11px] text-[#e8eaf0] focus:outline-none">
            <option value="filename">파일명순</option>
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
          <button type="button" onClick={() => updateFilter({ starFilter: "all", colorFilter: "all", selectedFilter: "all", sortOrder: "filename" })}
            className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[#5a5f78] hover:bg-[#1e2236] hover:text-[#8b90a8]">
            <RotateCcw className="h-3 w-3" /> 초기화
          </button>
        </div>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
        {filteredPhotos.map((photo) => {
          const selected = isSelected(photo.id);
          const state = photoStates[photo.id];
          const rating = state?.rating;
          const colorTag = state?.color;
          const hasTag = (rating != null && rating > 0) || colorTag != null;
          return (
            <Link key={photo.id} href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
              className={`group relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-xl bg-[#1a1d24] transition-all ${selected ? "ring-2 ring-[#2ed573] ring-offset-1 ring-offset-[#09090d]" : ""}`}>
              <img
                src={photo.url || getTestImageUrl(photo.id)}
                alt={getPhotoDisplayName(photo)}
                className="h-full w-full object-cover transition-[filter] duration-200 group-hover:brightness-105"
                loading="lazy" decoding="async" draggable={false}
              />
              {/* Select button */}
              <button type="button" onClick={(e) => handleCheckClick(e, photo.id)}
                className={`absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-opacity ${
                  selected ? "border-white bg-[#2ed573] text-white opacity-100" : "border-white/80 bg-black/50 text-white opacity-0 group-hover:opacity-100"
                }`} aria-label={selected ? "선택 해제" : "선택"}>
                {selected && <span className="text-[10px]">✓</span>}
              </button>
              {/* Tags */}
              <div className="absolute bottom-1 left-1 flex max-w-[90%] min-w-0 items-center gap-1 rounded bg-black/55 px-1.5 py-0.5">
                <span className="truncate text-[10px] text-white">{getPhotoDisplayName(photo)}</span>
                {hasTag && rating != null && rating > 0 && (
                  <span className="text-[10px] leading-none text-[#f5a623]">{"★".repeat(rating)}</span>
                )}
                {hasTag && colorTag && (
                  <span className="h-2 w-2 shrink-0 rounded-full border border-white/30" style={{ backgroundColor: COLOR_HEX[colorTag] }} />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <SelectionConfirmBar />
    </div>
  );
}
