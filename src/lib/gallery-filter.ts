/**
 * 갤러리 필터 상태를 URL 쿼리와 동기화하고, photos 필터/정렬에 공통 사용.
 */
import type { Photo } from "@/types";
import type { StarRating, ColorTag, SortOrder } from "@/types";

export const FILTER_PARAM = {
  rating: "rating",
  color_tag: "color_tag",
  sort: "sort",
  selected: "selected",
} as const;

export type GalleryFilterState = {
  starFilter: StarRating | "all";
  colorFilter: ColorTag | "none" | "all";
  selectedFilter: "all" | "selected";
  sortOrder: SortOrder;
};

const VALID_STARS: StarRating[] = [1, 2, 3, 4, 5];
const VALID_COLORS: (ColorTag | "none")[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "none",
];

/** URL SearchParams → GalleryFilterState */
export function parseFilterFromSearchParams(
  searchParams: URLSearchParams
): GalleryFilterState {
  const rating = searchParams.get(FILTER_PARAM.rating);
  const color = searchParams.get(FILTER_PARAM.color_tag);
  const sort = searchParams.get(FILTER_PARAM.sort);
  const selected = searchParams.get(FILTER_PARAM.selected);

  const starFilter: StarRating | "all" =
    rating != null && VALID_STARS.includes(Number(rating) as StarRating)
      ? (Number(rating) as StarRating)
      : "all";
  const colorFilter: ColorTag | "none" | "all" =
    color === "all" || (color != null && VALID_COLORS.includes(color as ColorTag | "none"))
      ? (color as ColorTag | "none" | "all")
      : "all";
  const sortOrder: SortOrder = sort === "oldest" ? "oldest" : "newest";
  const selectedFilter: "all" | "selected" =
    selected === "selected" ? "selected" : "all";

  return { starFilter, colorFilter, selectedFilter, sortOrder };
}

/** 현재 필터 상태로 URL 쿼리 문자열 생성 (기본값은 생략) */
export function buildFilterQueryString(state: GalleryFilterState): string {
  const params = new URLSearchParams();
  if (state.starFilter !== "all") params.set(FILTER_PARAM.rating, String(state.starFilter));
  if (state.colorFilter !== "all") params.set(FILTER_PARAM.color_tag, state.colorFilter);
  if (state.sortOrder !== "newest") params.set(FILTER_PARAM.sort, state.sortOrder);
  if (state.selectedFilter !== "all") params.set(FILTER_PARAM.selected, state.selectedFilter);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type PhotoStateMap = Record<
  string,
  { rating?: StarRating; color?: ColorTag; comment?: string }
>;

/** 갤러리/뷰어 공통: 필터·정렬 적용된 사진 목록 */
export function getFilteredPhotos(
  photos: Photo[],
  selectedIds: Set<string>,
  photoStates: PhotoStateMap,
  state: GalleryFilterState
): Photo[] {
  let list = [...photos];
  if (state.selectedFilter === "selected") {
    list = list.filter((p) => selectedIds.has(p.id));
  }
  if (state.starFilter !== "all") {
    list = list.filter((p) => photoStates[p.id]?.rating === state.starFilter);
  }
  if (state.colorFilter !== "all" && state.colorFilter !== "none") {
    list = list.filter((p) => photoStates[p.id]?.color === state.colorFilter);
  }
  if (state.colorFilter === "none") {
    list = list.filter((p) => !photoStates[p.id]?.color);
  }
  if (state.sortOrder === "oldest") {
    list = list.sort((a, b) => a.orderIndex - b.orderIndex);
  } else {
    list = list.sort((a, b) => b.orderIndex - a.orderIndex);
  }
  return list;
}
