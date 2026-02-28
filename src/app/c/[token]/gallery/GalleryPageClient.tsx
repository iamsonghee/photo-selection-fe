"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, RotateCcw, Check } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useSelection } from "@/contexts/SelectionContext";
import {
  parseFilterFromSearchParams,
  buildFilterQueryString,
  getFilteredPhotos,
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

  // 뒤로가기 시 useSearchParams가 갱신되지 않는 경우를 위해 URL 직접 동기화
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
    if (project.status === "editing" || project.status === "confirmed") {
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">갤러리 불러오는 중...</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
        <Link href="/"><Button variant="outline">홈으로</Button></Link>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (loadFailed || photos.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">사진을 불러올 수 없습니다.</p>
        <Link href={`/c/${token}`}><Button variant="outline">초대 페이지로 돌아가기</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0d] pb-32">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-[#0a0b0d]/95 px-4 py-3 backdrop-blur">
        <Link href={`/c/${token}`} className="flex items-center gap-2 text-zinc-400 hover:text-white">
          <ChevronLeft className="h-5 w-5" />
          <span className="font-medium">{project.name}</span>
        </Link>
        <span className="flex items-center gap-1.5 text-sm">
          <Badge variant={Y === N ? "success" : Y < N ? "danger" : "warning"}>
            선택 {Y} / {N}
          </Badge>
          <span className="text-zinc-500">· 전체 {photos.length}장</span>
        </span>
      </header>
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-medium text-zinc-500">별점</span>
          {STAR_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => updateFilter({ starFilter: opt.value })}
              className={`shrink-0 rounded px-2 py-1 text-xs ${starFilter === opt.value ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 shrink-0 w-px h-4 bg-zinc-700" />
          <span className="shrink-0 text-xs font-medium text-zinc-500">색상</span>
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter({ colorFilter: opt.value })}
              className={`shrink-0 rounded px-2 py-1 text-xs ${colorFilter === opt.value ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 shrink-0 w-px h-4 bg-zinc-700" />
          <button
            type="button"
            onClick={() => updateFilter({ selectedFilter: "all" })}
            className={`shrink-0 rounded px-2 py-1 text-xs ${selectedFilter === "all" ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => updateFilter({ selectedFilter: "selected" })}
            className={`shrink-0 rounded px-2 py-1 text-xs ${selectedFilter === "selected" ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
          >
            선택됨
          </button>
          <span className="mx-1 shrink-0 w-px h-4 bg-zinc-700" />
          <select
            value={sortOrder}
            onChange={(e) => updateFilter({ sortOrder: e.target.value as SortOrder })}
            className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              updateFilter({
                starFilter: "all",
                colorFilter: "all",
                selectedFilter: "all",
                sortOrder: "newest",
              })
            }
            className="shrink-0 gap-1 py-1 text-xs"
          >
            <RotateCcw className="h-3 w-3" /> 초기화
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 px-4 py-4">
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
              className={`group relative aspect-[4/3] block cursor-pointer overflow-hidden rounded-xl bg-zinc-800 transition-[box-shadow,border-color] ${
                selected ? "ring-2 ring-green-500 ring-offset-2 ring-offset-[#0a0b0d]" : ""
              }`}
            >
              <img
                src={photo.url || getTestImageUrl(photo.id)}
                alt={`사진 ${photo.orderIndex}`}
                className="h-full w-full object-cover transition-[filter] duration-200 group-hover:brightness-110"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              {/* 우상단 체크: 선택 시 항상 표시, 미선택 시 hover 시에만. 클릭 시 선택/해제만 (뷰어 이동 방지) */}
              <button
                type="button"
                onClick={(e) => handleCheckClick(e, photo.id)}
                className={`absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-opacity ${
                  selected
                    ? "border-white bg-green-500 text-white opacity-100"
                    : "border-white/80 bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70"
                }`}
                aria-label={selected ? "선택 해제" : "선택"}
              >
                {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
              </button>
              {!hasTag && (
                <p className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-xs text-white">
                  #{photo.orderIndex}
                </p>
              )}
              {hasTag && (
                <div className="absolute bottom-1 left-1 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
                  <span className="font-mono text-xs text-white">#{photo.orderIndex}</span>
                  {rating != null && rating > 0 && (
                    <span className="text-sm leading-none text-[#f5a623]">
                      {"★".repeat(rating)}
                    </span>
                  )}
                  {colorTag && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: COLOR_HEX[colorTag] }}
                    />
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
