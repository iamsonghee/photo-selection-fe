"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, RotateCcw, Eye, Check } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useSelection } from "@/contexts/SelectionContext";
import { getProjectByToken, getPhotosByProject } from "@/lib/mock-data";
import type { Photo, StarRating, ColorTag, SortOrder } from "@/types";

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
  const token = (params?.token as string) ?? "";
  const project = getProjectByToken(token);
  const { Y, N, toggle, isSelected, selectedIds, photoStates } = useSelection();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mounted, setMounted] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!project) return;
    if (project.status === "editing" || project.status === "confirmed") {
      router.replace(`/c/${token}/locked`);
      return;
    }
    setMounted(true);
    if (project.id) {
      try {
        const list = getPhotosByProject(project.id);
        setPhotos(list);
        if (list.length === 0) setLoadFailed(true);
      } catch {
        setLoadFailed(true);
      }
    } else {
      setLoadFailed(true);
    }
  }, [project, token, router]);

  const [starFilter, setStarFilter] = useState<StarRating | "all">("all");
  const [colorFilter, setColorFilter] = useState<ColorTag | "none" | "all">("all");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "selected">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const filteredPhotos = useMemo(() => {
    let list = [...photos];
    if (selectedFilter === "selected") list = list.filter((p) => selectedIds.has(p.id));
    if (starFilter !== "all") list = list.filter((p) => photoStates[p.id]?.rating === starFilter);
    if (colorFilter !== "all" && colorFilter !== "none") list = list.filter((p) => photoStates[p.id]?.color === colorFilter);
    if (colorFilter === "none") list = list.filter((p) => !photoStates[p.id]?.color);
    if (sortOrder === "oldest") list = list.sort((a, b) => a.orderIndex - b.orderIndex);
    else list = list.sort((a, b) => b.orderIndex - a.orderIndex);
    return list;
  }, [photos, selectedIds, photoStates, selectedFilter, starFilter, colorFilter, sortOrder]);

  const handleCardClick = useCallback(
    (photoId: string) => {
      toggle(photoId);
    },
    [toggle]
  );

  const handleCardDoubleClick = useCallback(
    (photoId: string) => {
      router.push(`/c/${token}/viewer/${photoId}`);
    },
    [router, token]
  );

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
        <Link href="/"><Button variant="outline">홈으로</Button></Link>
      </div>
    );
  }
  if (project.status === "editing") return null;
  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">갤러리 불러오는 중...</p>
      </div>
    );
  }
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
              onClick={() => setStarFilter(opt.value)}
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
              onClick={() => setColorFilter(opt.value)}
              className={`shrink-0 rounded px-2 py-1 text-xs ${colorFilter === opt.value ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 shrink-0 w-px h-4 bg-zinc-700" />
          <button
            type="button"
            onClick={() => setSelectedFilter("all")}
            className={`shrink-0 rounded px-2 py-1 text-xs ${selectedFilter === "all" ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("selected")}
            className={`shrink-0 rounded px-2 py-1 text-xs ${selectedFilter === "selected" ? "bg-primary/30 text-primary" : "text-zinc-400 hover:bg-zinc-800"}`}
          >
            선택됨
          </button>
          <span className="mx-1 shrink-0 w-px h-4 bg-zinc-700" />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStarFilter("all"); setColorFilter("all"); setSelectedFilter("all"); setSortOrder("newest"); }}
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
            <div
              key={photo.id}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(photo.id)}
              onDoubleClick={() => handleCardDoubleClick(photo.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleCardClick(photo.id);
                }
              }}
              className={`group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl bg-zinc-800 transition-[box-shadow,border-color] ${
                selected ? "ring-2 ring-green-500 ring-offset-2 ring-offset-[#0a0b0d]" : ""
              }`}
            >
              <img
                src={getTestImageUrl(photo.id)}
                alt={`사진 ${photo.orderIndex}`}
                className="h-full w-full object-cover transition-[filter] duration-200 group-hover:brightness-110"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              {selected && (
                <span className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
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
              <Link
                href={`/c/${token}/viewer/${photo.id}`}
                className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
