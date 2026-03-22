"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useSelection, SelectionConfirmBar } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
import {
  parseFilterFromSearchParams,
  buildFilterQueryString,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import type { StarRating, ColorTag, SortOrder } from "@/types";

const STAR_OPTIONS: { value: StarRating | "all"; label: string }[] = [
  { value: "all", label: "모두" },
  { value: 5, label: "⭐5" },
  { value: 4, label: "⭐4" },
  { value: 3, label: "⭐3" },
  { value: 2, label: "⭐2" },
  { value: 1, label: "⭐1" },
];

const COLOR_OPTIONS: { value: ColorTag | "none" | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "red", label: "🔴" },
  { value: "yellow", label: "🟡" },
  { value: "green", label: "🟢" },
  { value: "blue", label: "🔵" },
  { value: "purple", label: "🟣" },
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

  const { project, photos, Y, N, toggle, isSelected, selectedIds, photoStates, loading } =
    useSelection();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  const filterState = useMemo(
    () => parseFilterFromSearchParams(paramsToRead),
    [paramsToRead]
  );
  const { starFilter, colorFilter, selectedFilter, sortOrder } = filterState;

  const filteredPhotos = useMemo(
    () => getFilteredPhotos(photos, selectedIds, photoStates, filterState),
    [photos, selectedIds, photoStates, filterState]
  );

  const viewerQueryString = useMemo(
    () => buildFilterQueryString(filterState),
    [filterState]
  );

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
    if (project.status === "confirmed") {
      router.replace(`/c/${token}/confirmed`);
      return;
    }
    if (project.status === "editing") {
      router.replace(`/c/${token}/locked`);
      return;
    }
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">갤러리 불러오는 중...</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (loadFailed || photos.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090d] px-4">
        <p className="text-sm text-[#5a5f78]">사진을 불러올 수 없습니다.</p>
        <Link
          href={`/c/${token}`}
          className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
        >
          초대 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  const selectionStatus = Y === N ? "done" : Y < N ? "under" : "over";

  return (
    <div className="min-h-screen bg-[#09090d] pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#1e2236] bg-[#111318]/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href={`/c/${token}`}
            className="flex shrink-0 items-center gap-1 text-[#8b90a8] hover:text-[#e8eaf0] active:opacity-70"
          >
            <span className="text-[18px]">‹</span>
            <span className="max-w-[130px] truncate text-[13px] font-medium">{project.name}</span>
          </Link>
          {photographer && (
            <div className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[#1e2236] bg-[#1a1d24] px-2 py-0.5">
              <img
                src={getProfileImageUrl(photographer.profile_image_url)}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="max-w-[80px] truncate text-[11px] text-[#8b90a8]">
                {photographer.name || "작가"}
              </span>
            </div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
            selectionStatus === "done"
              ? "bg-[#2ed573]/10 text-[#2ed573]"
              : selectionStatus === "over"
                ? "bg-[#f5a623]/10 text-[#f5a623]"
                : "bg-[#ff4757]/10 text-[#ff4757]"
          }`}
        >
          {Y} / {N}
        </span>
      </header>

      {/* Filter bar */}
      <div className="border-b border-[#1e2236] bg-[#111318]/95 px-4 py-2">
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-[11px] text-[#5a5f78]">별점</span>
          {STAR_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => updateFilter({ starFilter: opt.value })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                starFilter === opt.value
                  ? "bg-[#4f7eff]/20 text-[#4f7eff]"
                  : "text-[#8b90a8] hover:bg-[#1e2236]"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          <span className="shrink-0 text-[11px] text-[#5a5f78]">색상</span>
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateFilter({ colorFilter: opt.value })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                colorFilter === opt.value
                  ? "bg-[#4f7eff]/20 text-[#4f7eff]"
                  : "text-[#8b90a8] hover:bg-[#1e2236]"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          <button
            type="button"
            onClick={() => updateFilter({ selectedFilter: "all" })}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              selectedFilter === "all"
                ? "bg-[#4f7eff]/20 text-[#4f7eff]"
                : "text-[#8b90a8] hover:bg-[#1e2236]"
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => updateFilter({ selectedFilter: "selected" })}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              selectedFilter === "selected"
                ? "bg-[#4f7eff]/20 text-[#4f7eff]"
                : "text-[#8b90a8] hover:bg-[#1e2236]"
            }`}
          >
            선택됨
          </button>
          <span className="mx-1 h-3 w-px shrink-0 bg-[#1e2236]" />
          <select
            value={sortOrder}
            onChange={(e) => updateFilter({ sortOrder: e.target.value as SortOrder })}
            className="shrink-0 rounded-lg border border-[#1e2236] bg-[#1a1d24] px-2 py-1 text-[11px] text-[#e8eaf0] focus:outline-none"
          >
            <option value="filename">파일명순</option>
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
          <button
            type="button"
            onClick={() =>
              updateFilter({
                starFilter: "all",
                colorFilter: "all",
                selectedFilter: "all",
                sortOrder: "filename",
              })
            }
            className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[#5a5f78] hover:bg-[#1e2236] hover:text-[#8b90a8]"
          >
            <RotateCcw className="h-3 w-3" /> 초기화
          </button>
        </div>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3">
        {filteredPhotos.map((photo) => {
          const selected = isSelected(photo.id);
          const state = photoStates[photo.id];
          const rating = state?.rating;
          const colorTag = state?.color;
          const hasTag = (rating != null && rating > 0) || colorTag != null;
          return (
            <Link
              key={photo.id}
              href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
              className={`group relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-xl bg-[#1a1d24] transition-all ${
                selected ? "ring-2 ring-[#2ed573] ring-offset-2 ring-offset-[#09090d]" : ""
              }`}
            >
              <img
                src={photo.url || getTestImageUrl(photo.id)}
                alt={getPhotoDisplayName(photo)}
                className="h-full w-full object-cover transition-[filter] duration-200 group-hover:brightness-105"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              {/* Select toggle button */}
              <button
                type="button"
                onClick={(e) => handleCheckClick(e, photo.id)}
                className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-opacity ${
                  selected
                    ? "border-white bg-[#2ed573] text-white opacity-100"
                    : "border-white/80 bg-black/50 text-white opacity-0 group-hover:opacity-100"
                }`}
                aria-label={selected ? "선택 해제" : "선택"}
              >
                {selected && <span className="text-[10px]">✓</span>}
              </button>
              {/* Tags / filename */}
              {!hasTag && (
                <p className="absolute bottom-1 left-1 max-w-[85%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                  {getPhotoDisplayName(photo)}
                </p>
              )}
              {hasTag && (
                <div className="absolute bottom-1 left-1 flex max-w-[85%] min-w-0 items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
                  <span className="truncate text-[10px] text-white">{getPhotoDisplayName(photo)}</span>
                  {rating != null && rating > 0 && (
                    <span className="text-[10px] leading-none text-[#f5a623]">{"★".repeat(rating)}</span>
                  )}
                  {colorTag && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: COLOR_HEX[colorTag] }}
                    />
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <SelectionConfirmBar />
    </div>
  );
}
