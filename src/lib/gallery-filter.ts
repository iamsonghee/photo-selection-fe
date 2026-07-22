/**
 * 갤러리 필터 상태를 URL 쿼리와 동기화하고, photos 필터/정렬에 공통 사용.
 */
import { useEffect, useRef } from "react";
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
  name: "name",
  quality: "quality",
} as const;

export type QualityFilterFlag = "blurry" | "eyesClosed";

/** 갤러리 스크롤 복원용(필터와 무관). 인앱 브라우저에서 sessionStorage 대신 URL로 전달 */
export const GALLERY_SCROLL_PARAM = "gs";

/** 뷰어→갤러리 복귀 시 포커스 썸네일 우선 로드용(사진 id) */
export const GALLERY_FOCUS_PARAM = "gf";

/**
 * 뷰어에서 갤러리로 돌아갈 때 포커스 사진 id를 쿼리에 붙임.
 */
export function buildGalleryHrefWithFocus(
  token: string,
  searchParams: Pick<URLSearchParams, "toString">,
  focusPhotoId: string
): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set(GALLERY_FOCUS_PARAM, focusPhotoId);
  const q = next.toString();
  return `/c/${token}/gallery${q ? `?${q}` : ""}`;
}

export type GalleryThumbPriorityOptions = {
  /** 포커스 없을 때 기본: omit(작가 결과 등 기존 동작). 고객 갤러리는 "lazy"로 전부 지연 로드 유지 */
  whenNoFocus?: "omit" | "lazy";
};

/**
 * 갤러리 그리드에서 뷰어 복귀 포커스 주변 썸네일을 먼저 로드할 때 사용.
 */
export function galleryThumbPriorityProps(
  photoIndex: number,
  focusIndex: number | null,
  options?: GalleryThumbPriorityOptions
): { loading?: "eager" | "lazy"; fetchPriority?: "high" | "low" | "auto" } {
  const whenNo = options?.whenNoFocus ?? "omit";
  if (focusIndex == null || focusIndex < 0) {
    return whenNo === "lazy" ? { loading: "lazy" } : {};
  }
  const dist = Math.abs(photoIndex - focusIndex);
  if (dist <= 18) {
    return {
      loading: "eager",
      fetchPriority: dist <= 2 ? "high" : "auto",
    };
  }
  return { loading: "lazy", fetchPriority: "low" };
}

/**
 * 포커스 주변 사진을 우선순위로 미리 로드. 이미 프리로드한 URL은 컴포넌트가 살아있는 동안
 * (effect 재실행 여부와 무관하게) 다시 요청하지 않는다 — 목록 배열이 새 레퍼런스로 바뀌어도
 * (필터/그룹 펼침 등) 이미 로드된 사진까지 매번 다시 프리로드하는 트래픽 낭비를 막기 위함.
 */
export function usePriorityImagePreload(
  urls: (string | null | undefined)[],
  focusIndex: number | null
) {
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (focusIndex == null || urls.length === 0) return;
    const ordered: string[] = [];
    const push = (i: number) => {
      const u = urls[i];
      if (u) ordered.push(u);
    };
    push(focusIndex);
    for (let d = 1; d < urls.length; d++) {
      if (focusIndex - d >= 0) push(focusIndex - d);
      if (focusIndex + d < urls.length) push(focusIndex + d);
    }
    const seen = preloadedRef.current;
    ordered.forEach((url, i) => {
      if (seen.has(url)) return;
      seen.add(url);
      const img = document.createElement("img");
      img.decoding = "async";
      img.fetchPriority = i < 24 ? "high" : "low";
      img.src = url;
    });
  }, [focusIndex, urls]);
}

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
  colorFilter: ColorTag[] | "none" | "all";
  selectedFilter: "all" | "selected";
  sortOrder: SortOrder;
  /** 파일명 검색(쉼표/공백으로 구분한 여러 파일명, LIKE OR) — 원문 그대로 보관, 매칭 시 split */
  nameFilter: string;
  /** 흔들림/눈감음 경고 필터 (OR) */
  qualityFilter: QualityFilterFlag[];
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
  const name = searchParams.get(FILTER_PARAM.name);
  const quality = searchParams.get(FILTER_PARAM.quality);

  const starFilter: StarRating | "all" =
    rating != null && VALID_STARS.includes(Number(rating) as StarRating)
      ? (Number(rating) as StarRating)
      : "all";
  const colorFilter: ColorTag[] | "none" | "all" = (() => {
    if (!color || color === "all") return "all";
    if (color === "none") return "none";
    const tags = color.split(",").filter((v): v is ColorTag =>
      VALID_COLORS.includes(v as ColorTag | "none") && v !== "none"
    );
    return tags.length > 0 ? tags : "all";
  })();
  const sortOrder: SortOrder =
    sort === "oldest" ? "oldest" : sort === "newest" ? "newest" : "filename";
  const selectedFilter: "all" | "selected" =
    selected === "selected" ? "selected" : "all";
  const nameFilter = name ?? "";
  const qualityFilter: QualityFilterFlag[] = (quality ?? "")
    .split(",")
    .filter((v): v is QualityFilterFlag => v === "blurry" || v === "eyesClosed");

  return { starFilter, colorFilter, selectedFilter, sortOrder, nameFilter, qualityFilter };
}

/** 현재 필터 상태로 URL 쿼리 문자열 생성 (기본값은 생략) */
export function buildFilterQueryString(state: GalleryFilterState): string {
  const params = new URLSearchParams();
  if (state.starFilter !== "all") params.set(FILTER_PARAM.rating, String(state.starFilter));
  if (Array.isArray(state.colorFilter)) {
    if (state.colorFilter.length > 0) params.set(FILTER_PARAM.color_tag, state.colorFilter.join(","));
  } else if (state.colorFilter !== "all") {
    params.set(FILTER_PARAM.color_tag, state.colorFilter);
  }
  if (state.sortOrder !== "filename") params.set(FILTER_PARAM.sort, state.sortOrder);
  if (state.selectedFilter !== "all") params.set(FILTER_PARAM.selected, state.selectedFilter);
  if (state.nameFilter.trim()) params.set(FILTER_PARAM.name, state.nameFilter.trim());
  if (state.qualityFilter.length > 0) params.set(FILTER_PARAM.quality, state.qualityFilter.join(","));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const COLOR_OPTIONS: { key: ColorTag; hex: string }[] = [
  { key: "red",    hex: "#ef4444" },
  { key: "yellow", hex: "#f59e0b" },
  { key: "green",  hex: "#22c55e" },
  { key: "blue",   hex: "#3b82f6" },
  { key: "purple", hex: "#8b5cf6" },
];

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
    list = list.filter((p) => (photoStates[p.id]?.rating ?? 0) >= (state.starFilter as number));
  }
  if (Array.isArray(state.colorFilter) && state.colorFilter.length > 0) {
    list = list.filter((p) =>
      (state.colorFilter as ColorTag[]).some((c) => photoStates[p.id]?.color?.includes(c))
    );
  }
  if (state.colorFilter === "none") {
    list = list.filter((p) => !photoStates[p.id]?.color?.length);
  }
  const nameTerms = Array.from(
    new Set(
      state.nameFilter
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (nameTerms.length > 0) {
    list = list.filter((p) => {
      const name = getPhotoDisplayName(p).toLowerCase();
      return nameTerms.some((term) => name.includes(term));
    });
  }
  if (state.qualityFilter.length > 0) {
    list = list.filter((p) =>
      (state.qualityFilter.includes("blurry") && p.isBlurry === true) ||
      (state.qualityFilter.includes("eyesClosed") && p.faceDetected === true && p.eyesClosed === true)
    );
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
