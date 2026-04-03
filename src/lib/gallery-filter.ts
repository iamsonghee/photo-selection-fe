/**
 * 갤러리 필터 상태를 URL 쿼리와 동기화하고, photos 필터/정렬에 공통 사용.
 */
import type { Photo } from "@/types";
import type { StarRating, ColorTag, SortOrder } from "@/types";

/** r2_thumb_url 등에서 파일명 추출. 예: "https://.../photos/abc/uuid.jpg" → "uuid.jpg" */
export function getPhotoFileName(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  try {
    const path = url.split("?")[0];
    const segment = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(segment);
  } catch {
    return url;
  }
}

/** 표시용 파일명: original_filename 우선, 없으면 URL에서 추출, 없으면 #orderIndex */
export function getPhotoDisplayName(photo: Photo): string {
  const name = photo.originalFilename?.trim();
  if (name) return name;
  const fromUrl = getPhotoFileName(photo.url);
  if (fromUrl) return fromUrl;
  return `#${photo.orderIndex}`;
}

/** 정렬 키: original_filename 우선, 없으면 URL에서 추출 (파일명순 정렬용) */
function getPhotoSortKey(photo: Photo): string {
  const name = photo.originalFilename?.trim();
  if (name) return name;
  return getPhotoFileName(photo.url);
}

export const FILTER_PARAM = {
  rating: "rating",
  color_tag: "color_tag",
  sort: "sort",
  selected: "selected",
} as const;

/** 갤러리 스크롤 복원용(필터와 무관). 인앱 브라우저에서 sessionStorage 대신 URL로 전달 */
export const GALLERY_SCROLL_PARAM = "gs";

/**
 * 뷰어 링크에 스크롤 Y(px)를 붙임. viewerQueryString은 buildFilterQueryString 결과(?foo=bar 또는 "").
 */
export function appendGalleryScrollQuery(viewerQueryString: string, scrollY: number): string {
  const y = Math.round(scrollY);
  if (!Number.isFinite(y) || y < 0) return viewerQueryString;
  const sep = viewerQueryString ? "&" : "?";
  return `${viewerQueryString || ""}${sep}${GALLERY_SCROLL_PARAM}=${encodeURIComponent(String(y))}`;
}

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
  const sortOrder: SortOrder =
    sort === "oldest" ? "oldest" : sort === "newest" ? "newest" : "filename";
  const selectedFilter: "all" | "selected" =
    selected === "selected" ? "selected" : "all";

  return { starFilter, colorFilter, selectedFilter, sortOrder };
}

/** 현재 필터 상태로 URL 쿼리 문자열 생성 (기본값은 생략) */
export function buildFilterQueryString(state: GalleryFilterState): string {
  const params = new URLSearchParams();
  if (state.starFilter !== "all") params.set(FILTER_PARAM.rating, String(state.starFilter));
  if (state.colorFilter !== "all") params.set(FILTER_PARAM.color_tag, state.colorFilter);
  if (state.sortOrder !== "filename") params.set(FILTER_PARAM.sort, state.sortOrder);
  if (state.selectedFilter !== "all") params.set(FILTER_PARAM.selected, state.selectedFilter);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type PhotoStateMap = Record<
  string,
  { rating?: StarRating; color?: ColorTag[]; comment?: string }
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
    list = list.filter((p) => photoStates[p.id]?.color?.includes(state.colorFilter as ColorTag));
  }
  if (state.colorFilter === "none") {
    list = list.filter((p) => !photoStates[p.id]?.color?.length);
  }
  if (state.sortOrder === "filename") {
    list = list.sort((a, b) =>
      getPhotoSortKey(a).localeCompare(getPhotoSortKey(b), undefined, { sensitivity: "base" })
    );
  } else if (state.sortOrder === "oldest") {
    list = list.sort((a, b) => a.orderIndex - b.orderIndex);
  } else {
    list = list.sort((a, b) => b.orderIndex - a.orderIndex);
  }
  return list;
}
