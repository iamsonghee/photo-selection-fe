"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelection } from "@/contexts/SelectionContext";
import { useCustomerImageCache } from "@/contexts/CustomerImageCacheContext";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { SelectionLimitSnackbar } from "@/components/customer/SelectionLimitSnackbar";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { GalleryDesktopHeader } from "@/components/customer/GalleryDesktopHeader";
import {
  fetchRoster,
  getUsedColors,
  readParticipant,
  type Participant,
  type ParticipantRoster,
} from "@/lib/customer-participant";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { SimilarityToggleButton } from "@/components/ui/SimilarityToggleButton";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import {
  appendGalleryScrollQuery,
  buildFilterQueryString,
  COLOR_LABELS,
  COLOR_OPTIONS,
  GALLERY_FOCUS_PARAM,
  GALLERY_SCROLL_PARAM,
  getFilteredPhotos,
  parseFilterFromSearchParams,
} from "@/lib/gallery-filter";
import type { GalleryFilterState } from "@/lib/gallery-filter";
import {
  buildGroupSelectionInfo,
  buildGroupsById,
  buildMembersByGroup,
  buildPhotoIdSet,
  filterToGroupFrontPhotos,
  getGroupFrontPhotoId,
} from "@/lib/photo-groups";
import type { StarRating, ColorTag, SortOrder } from "@/types";
import { triggerSelectionHaptic } from "@/lib/selection-feedback";
import { customerDDay } from "@/lib/customer-dday";
import { useCustomerLightCanvas } from "@/lib/use-customer-light-canvas";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
type TabFilter = "all" | "selected";

function CustomerGalleryHomeMark({ token, compact = false }: { token: string; compact?: boolean }) {
  return (
    <Link
      href={`/c/${token}`}
      aria-label="처음 화면으로"
      className={`gl-mobile-brand-home${compact ? " is-compact" : ""}`}
    >
      <span aria-hidden="true">A</span>
    </Link>
  );
}

/** 그리드 레이아웃 상수 — 가상화된 행 높이·열 수 계산에 사용 */
// /review와 같은 PC 카드 밀도. 별 5개와 참가자 컬러칩 5개도 한 줄에서 겹치지 않는다.
const GRID_MIN_CELL   = 180;
const DESKTOP_CARD_ASPECT = 1;
const GRID_GAP        = 12;
const MOBILE_MAX_W    = 767;
type MobileGalleryColumns = 2 | 3 | 4;
const MOBILE_DEFAULT_COLS: MobileGalleryColumns = 2;
/** 사진은 모든 밀도에서 1:1. `info`는 2열에서 사진 **아래** 붙는 정보 패널 높이(파일명 + 복사 + 별점 줄)로,
 * 가상 스크롤의 행 높이에 더해야 한다 — 여기를 빼먹으면 카드가 겹치거나 잘린다. */
const MOBILE_LAYOUT: Record<MobileGalleryColumns, { gap: number; aspect: number; info: number }> = {
  /* 2열만 가로 4:3이다. 1:1로 두면 한 장이 168px까지 커져 한 화면에 두 줄밖에 안 들어온다 —
   * 2열은 "크게 보며 고르는" 밀도지 한 장을 감상하는 화면이 아니다.
   * 대신 세로 사진은 그만큼 위아래가 잘린다(1.33 crop) — 원본 확인은 상세보기의 몫이다.
   * `info`는 사진 아래 정보 줄 높이로, 가상 스크롤 행 높이에 더해야 한다.
   * 파일명을 상세보기로 옮기면서 지금은 모든 밀도가 0 — 다시 무언가를 사진 밖에 두면 여기부터 고친다. */
  2: { gap: 10, aspect: 4 / 3, info: 0 },
  3: { gap: 8, aspect: 1, info: 0 },
  4: { gap: 6, aspect: 1, info: 0 },
};
const SIMILARITY_HINT_STORAGE_KEY = "ps:c-gallery-similarity-hint:v1";
const SIMILARITY_HINT_DURATION_MS = 4500;
const MOBILE_HEADER_COLLAPSE_Y = 72;
const MOBILE_HEADER_DIRECTION_THRESHOLD = 12;
const PRESIGN_DEBOUNCE_MS = 80;

type GridLayout = { cols: number; gap: number; rowHeight: number; overscan: number };
const DEFAULT_LAYOUT: GridLayout = { cols: 4, gap: GRID_GAP, rowHeight: Math.ceil(GRID_MIN_CELL / DESKTOP_CARD_ASPECT) + GRID_GAP, overscan: 6 };

export default function GalleryPageClient() {
  /* 셀렉 갤러리도 라이트 화면이다 — 모바일 러버밴드/주소창 전환 때 body의 검은 바탕이 비치지 않게 한다 */
  useCustomerLightCanvas();
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = (params?.token as string) ?? "";

  const { project, photos, photoGroups, Y, N, toggle, selectedIds, photoStates, loading, updatePhotoState } = useSelection();
  const { thumbUrls: presignedUrls, thumbQueue, ensureThumbUrls, refreshThumbUrl } = useCustomerImageCache();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  /* 새로고침/뒤로가기 시 필터가 초기화되지 않도록, 마운트 시 1회 URL에서 필터 상태를 복원한다.
   * 이후로는 로컬 state가 진실 소스이고, 아래 URL 동기화 effect가 반대 방향(state→URL)으로만 반영한다
   * (뷰어가 쓰는 parseFilterFromSearchParams/buildFilterQueryString과 동일한 GalleryFilterState 포맷 재사용). */
  const [initialFilterState] = useState(() => parseFilterFromSearchParams(searchParams));

  const [tabFilter,     setTabFilter]     = useState<TabFilter>(initialFilterState.selectedFilter === "selected" ? "selected" : "all");
  const [starFilter,    setStarFilter]    = useState<number>(initialFilterState.starFilter === "all" ? 0 : initialFilterState.starFilter);
  const [colorFilter,   setColorFilter]   = useState<ColorTag[]>(Array.isArray(initialFilterState.colorFilter) ? initialFilterState.colorFilter : []);
  /** 두 명 이상을 고를 때 "한 명이라도 찜"(any) / "모두 찜"(all) 중 무엇으로 볼지 */
  const [colorFilterMode, setColorFilterMode] = useState<"any" | "all">(initialFilterState.colorFilterMode);
  /** 색 = 참가자 슬롯. 내 색은 "내 찜"으로 표시하고, 실제 쓰인 색만 필터에 노출한다. */
  const [participant, setParticipant] = useState<Participant | null>(null);
  /** 서버에 저장된 (색 → 표시 이름). 이름이 있으면 "빨강 찜" 대신 그 이름으로 부른다. */
  const [roster, setRoster] = useState<ParticipantRoster>({});
  const [sortOrder,     setSortOrder]     = useState<SortOrder>(initialFilterState.sortOrder);
  const [hoverStar,     setHoverStar]     = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);
  const [similarityToggleOn, setSimilarityToggleOn] = useState(initialFilterState.groupedView);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  /** 파일명 검색(필터) — 쉼표/공백으로 구분해 여러 파일명을 한 번에 LIKE 검색 */
  const [searchValue, setSearchValue] = useState(initialFilterState.nameFilter);
  /** 흔들림/눈감음 경고 필터 — 켜진 조건 중 하나라도 해당하면 표시(OR) */
  const [qualityFilter, setQualityFilter] = useState<Set<"blurry" | "eyesClosed">>(new Set(initialFilterState.qualityFilter));
  const [mobileColumns, setMobileColumns] = useState<MobileGalleryColumns>(MOBILE_DEFAULT_COLS);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileScopeOpen, setMobileScopeOpen] = useState(false);
  const [mobileHeaderCompact, setMobileHeaderCompact] = useState(false);
  const [similarityHintVisible, setSimilarityHintVisible] = useState(false);
  const [selectionLimitNoticeKey, setSelectionLimitNoticeKey] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    setParticipant(readParticipant(token));
  }, [token]);

  useEffect(() => {
    if (!token || !project?.id) return;
    let alive = true;
    void fetchRoster(token, project.id).then((next) => { if (alive) setRoster(next); });
    return () => { alive = false; };
  }, [token, project?.id]);

  /** 필터·칩에서 색을 부르는 이름. 내 색이면 "내 찜", 이름이 등록돼 있으면 "OO 찜", 없으면 색 이름. */
  const colorLabel = useCallback(
    (key: ColorTag) => {
      if (key === participant?.color) return "내 찜";
      const name = roster[key];
      return name ? `${name} 찜` : `${COLOR_LABELS[key]} 찜`;
    },
    [participant, roster],
  );

  /** 프로젝트에서 실제로 쓰인 색 = 참여 중인 사람. 안 쓰인 색은 필터에 띄워봐야 결과가 0장이라 감춘다. */
  const usedColors = useMemo(() => getUsedColors(photoStates), [photoStates]);
  const colorFilterOptions = useMemo(
    () =>
      COLOR_OPTIONS.filter((option) => usedColors.includes(option.key)).map((option) => ({
        ...option,
        label: colorLabel(option.key),
      })),
    [usedColors, colorLabel],
  );

  const activeMobileFilterCount =
    (starFilter > 0 ? 1 : 0) +
    colorFilter.length +
    (searchValue.trim() ? 1 : 0) +
    qualityFilter.size;
  const mobileFilterChipsVisible = activeMobileFilterCount > 0 && !mobileSearchOpen;

  const clearMobileFilters = useCallback(() => {
    setStarFilter(0);
    setColorFilter([]);
    setColorFilterMode("any");
    setSearchValue("");
    setQualityFilter(new Set());
    setHoverStar(0);
  }, []);

  const dismissSimilarityHint = useCallback(() => {
    setSimilarityHintVisible(false);
    try {
      localStorage.setItem(SIMILARITY_HINT_STORAGE_KEY, "seen");
    } catch {
      /* storage가 차단돼도 현재 화면의 안내는 닫는다. */
    }
  }, []);

  // ── Presigned thumb 관리 ──────────────────────────────────────────────────
  const gridRef        = useRef<HTMLDivElement>(null);
  const mobileHeaderScrollRef = useRef({ lastY: 0, directionDelta: 0 });
  const densityAnchorIdRef = useRef<string | null>(null);
  const retryingIdsRef = useRef(new Set<string>()); // onError 재시도 중
  const firstThumbRangeRequestedRef = useRef(false);

  // ── 가상화 그리드 레이아웃 (열 수·행 높이는 컨테이너 폭 기준으로 JS에서 계산) ──
  const [layout, setLayout] = useState<GridLayout>(DEFAULT_LAYOUT);
  const [scrollMargin, setScrollMargin] = useState(0);
  /** 실제 컨테이너 폭 기준 열 수 측정이 최소 1회 끝났는지 — 스크롤/포커스 복원이
   *  DEFAULT_LAYOUT(4열 가정)으로 잘못 계산되지 않도록 이 값이 true가 될 때까지 기다린다. */
  const [layoutMeasured, setLayoutMeasured] = useState(false);

  const galleryScrollKey = token ? `ps:c-gallery-scroll:${token}` : "";
  const galleryFocusKey = token ? `ps:c-gallery-focus:${token}` : "";
  const galleryDensityKey = token ? `ps:c-gallery-density:${token}` : "";

  useEffect(() => {
    if (!galleryDensityKey) return;
    try {
      const stored = Number(sessionStorage.getItem(galleryDensityKey));
      if (stored >= 2 && stored <= 4) setMobileColumns(stored as MobileGalleryColumns);
    } catch {
      /* storage가 막힌 브라우저에서는 Figma 기본값(2열)을 사용한다. */
    }
  }, [galleryDensityKey]);

  /* 브라우저 기본 스크롤 복원과 충돌하지 않도록 (갤러리에 있는 동안만 manual) */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = prev;
    };
  }, []);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileFiltersOpen]);

  // 모바일에서는 아래로 탐색할 때 제목/마감일 행을 접고, 위로 되돌아갈 때 다시 펼친다.
  // 작은 스크롤 변화는 누적 임계값으로 무시해 헤더가 떨리는 현상을 막는다.
  useEffect(() => {
    let frame = 0;
    const scrollState = mobileHeaderScrollRef.current;

    const updateHeader = () => {
      frame = 0;
      if (window.innerWidth > MOBILE_MAX_W) {
        setMobileHeaderCompact(false);
        scrollState.lastY = window.scrollY;
        scrollState.directionDelta = 0;
        return;
      }

      const nextY = Math.max(0, window.scrollY);
      const delta = nextY - scrollState.lastY;

      if (nextY <= 16) {
        setMobileHeaderCompact(false);
        scrollState.directionDelta = 0;
      } else if (Math.sign(delta) !== Math.sign(scrollState.directionDelta)) {
        scrollState.directionDelta = delta;
      } else {
        scrollState.directionDelta += delta;
      }

      if (nextY > MOBILE_HEADER_COLLAPSE_Y && scrollState.directionDelta >= MOBILE_HEADER_DIRECTION_THRESHOLD) {
        setMobileHeaderCompact(true);
        scrollState.directionDelta = 0;
      } else if (scrollState.directionDelta <= -MOBILE_HEADER_DIRECTION_THRESHOLD) {
        setMobileHeaderCompact(false);
        scrollState.directionDelta = 0;
      }

      scrollState.lastY = nextY;
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateHeader);
    };

    scrollState.lastY = window.scrollY;
    setMobileHeaderCompact(window.innerWidth <= MOBILE_MAX_W && window.scrollY > MOBILE_HEADER_COLLAPSE_Y);
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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

  /* ── Filter state ──
   * 파일명 검색/품질 필터도 여기 포함해야 뷰어(별도 라우트, viewerQueryString으로 URL을 통해
   * 이 상태를 넘겨받아 parseFilterFromSearchParams+getFilteredPhotos로 동일한 목록을 재구성함)의
   * 이전/다음 이동이 갤러리에서 보이는 필터링된 목록과 정확히 일치한다. */
  const filterState = useMemo<GalleryFilterState>(() => ({
    selectedFilter: tabFilter === "selected" ? "selected" : "all",
    starFilter:     starFilter === 0 ? "all" : (starFilter as StarRating),
    colorFilter:    colorFilter.length > 0 ? colorFilter : "all",
    colorFilterMode,
    sortOrder,
    nameFilter: searchValue,
    qualityFilter: Array.from(qualityFilter),
    groupedView: similarityToggleOn,
  }), [tabFilter, starFilter, colorFilter, colorFilterMode, sortOrder, searchValue, qualityFilter, similarityToggleOn]);

  const filteredPhotos = useMemo(() => {
    return getFilteredPhotos(photos, selectedIds, photoStates, filterState);
  }, [photos, selectedIds, photoStates, filterState]);

  /* ── AI 유사컷 그룹 (갤러리·뷰어 공용 헬퍼: src/lib/photo-groups.ts) ── */
  const groupsById = useMemo(() => buildGroupsById(photoGroups), [photoGroups]);
  const membersByGroup = useMemo(() => buildMembersByGroup(filteredPhotos), [filteredPhotos]);
  const photoIdSet = useMemo(() => buildPhotoIdSet(photos), [photos]);
  /** 그룹별 셀렉 수/단일 셀렉 id를 selectedIds가 바뀔 때 한 번만 파생 — 카드마다 반복 계산 방지 */
  const groupSelectionInfo = useMemo(
    () => buildGroupSelectionInfo(membersByGroup, selectedIds),
    [membersByGroup, selectedIds]
  );

  // photo_groups는 엔진(OpenCLIP/Gemini) 무관하게 그룹이 실제로 있을 때만 채워지므로
  // 이 값 하나로 충분하다 — project.clipAnalysisStatus(projects.clip_analysis_status)는
  // OpenCLIP 전용 컬럼이라 Gemini 분석에서는 계속 null로 남아 예전 조건대로면 토글이 영영 안 뜬다.
  const showSimilarityToggle = photoGroups.length > 0;

  useEffect(() => {
    if (!showSimilarityToggle || window.innerWidth > MOBILE_MAX_W) {
      setSimilarityHintVisible(false);
      return;
    }
    if (similarityToggleOn) {
      dismissSimilarityHint();
      return;
    }
    try {
      if (localStorage.getItem(SIMILARITY_HINT_STORAGE_KEY)) return;
    } catch {
      /* storage 사용이 막혀도 현재 진입에서는 안내를 표시한다. */
    }
    setSimilarityHintVisible(true);
    const timer = window.setTimeout(dismissSimilarityHint, SIMILARITY_HINT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismissSimilarityHint, showSimilarityToggle, similarityToggleOn]);

  const hasBlurryPhotos = useMemo(() => photos.some((p) => p.isBlurry === true), [photos]);
  const hasEyesClosedPhotos = useMemo(
    () => photos.some((p) => p.faceDetected === true && p.eyesClosed === true),
    [photos]
  );

  const toggleQualityFilter = useCallback((key: "blurry" | "eyesClosed") => {
    setQualityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** 파일명 검색/품질 필터가 켜져 있는지 — 그룹 접기보다 우선시켜야 하므로 별도로 추적.
   *  실제 필터링 자체는 filterState를 통해 getFilteredPhotos(공유 로직, 뷰어와 동일)가 수행한다. */
  const narrowingFilterActive = searchValue.trim().length > 0 || qualityFilter.size > 0;

  /** 파일명이 지금 "작업의 대상"인지 — 이때만 격자에 파일명을 되살린다.
   *  검색 결과는 파일명이 보이지 않으면 무엇이 왜 걸렸는지 확인할 방법이 없다.
   *  평소에는 파일명을 상세보기 한 곳에서만 말한다(§파일명 규칙).
   *
   *  파일명 **정렬**은 조건에 넣지 않는다 — `filename`이 기본 정렬값이라(`toSearchParams`가 이 값만
   *  URL에서 생략한다) "정렬이 파일명"은 사용자가 선택한 특별한 상태가 아니고, 넣으면 사실상
   *  항상 참이 되어 파일명을 걷어낸 의미가 사라진다. */
  const filenameContextActive = searchValue.trim().length > 0;

  /* 토글 ON: 표지(front) + 미분류 사진만, 펼쳐진 그룹은 orderIndex 원래 순서 그대로 인라인 삽입.
   *  셀렉/표지 변경과 무관하게 항상 원래 순서를 유지해야 하므로, 표지를 맨 앞으로 옮기지 않고
   *  membersByGroup(이미 orderIndex 정렬됨)을 그대로 push한다.
   *  파일명/품질 필터가 켜져 있으면 그룹 접기보다 우선 — 검색·필터된 사진을 그룹 속에 숨기지 않는다. */
  const displayPhotos = useMemo(() => {
    if (narrowingFilterActive) return filteredPhotos;
    if (!similarityToggleOn) return filteredPhotos;
    const stableSelectionInfo = new Map(groupSelectionInfo);
    expandedGroups.forEach((groupId) => stableSelectionInfo.delete(groupId));
    const fronts = filterToGroupFrontPhotos(filteredPhotos, groupsById, photoIdSet, stableSelectionInfo);
    const result: typeof filteredPhotos = [];
    // 대표컷이 photos 목록에서 사라진 방어 폴백(filterToGroupFrontPhotos 참고)이 발동하면
    // 같은 groupId의 멤버 여러 장이 fronts에 남을 수 있다 — 그룹당 한 번만 처리해 멤버 중복
    // push를 막는다(정상 케이스에선 그룹당 fronts 1장이라 이 가드가 아무 영향을 주지 않는다).
    const emittedGroups = new Set<string>();
    for (const photo of fronts) {
      const groupId = photo.similarityGroupId;
      if (!groupId) {
        result.push(photo);
        continue;
      }
      if (emittedGroups.has(groupId)) continue;
      emittedGroups.add(groupId);
      const expanded = expandedGroups.has(groupId);
      if (expanded) {
        const members = membersByGroup.get(groupId) ?? [photo];
        result.push(...members);
      } else {
        result.push(photo);
      }
    }
    return result;
  }, [
    filteredPhotos,
    similarityToggleOn,
    expandedGroups,
    groupsById,
    membersByGroup,
    photoIdSet,
    narrowingFilterActive,
    groupSelectionInfo,
  ]);

  const viewerQueryString = useMemo(() => buildFilterQueryString(filterState), [filterState]);

  /* 필터 상태를 URL에 반영해 새로고침/뒤로가기 후에도 유지되게 한다.
   * gs/gf(스크롤·포커스 복원 파라미터)는 별도 effect가 관리하므로, 여기서는 searchParams를
   * 구독하지 않고 window.location에서 직접 읽어와 그대로 보존한다 — 두 effect가 서로의 URL
   * 갱신에 반응해 계속 되돌리는 순환을 막기 위함. filterState가 실제로 바뀔 때만 동작한다. */
  useEffect(() => {
    if (typeof window === "undefined" || !token) return;
    const qs = buildFilterQueryString(filterState);
    const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : "");
    const current = new URLSearchParams(window.location.search);
    const gs = current.get(GALLERY_SCROLL_PARAM);
    const gf = current.get(GALLERY_FOCUS_PARAM);
    if (gs != null) params.set(GALLERY_SCROLL_PARAM, gs);
    if (gf != null) params.set(GALLERY_FOCUS_PARAM, gf);
    const nextQs = params.toString();
    if (current.toString() === nextQs) return;
    router.replace(`/c/${token}/gallery${nextQs ? `?${nextQs}` : ""}`, { scroll: false });
  }, [filterState, token, router]);

  // img onError → 해당 사진 1회만 재발급 (HEAD 요청 없음)
  const handleThumbError = useCallback(
    (photoId: string) => {
      if (retryingIdsRef.current.has(photoId)) return;
      retryingIdsRef.current.add(photoId);
      console.warn("[gallery] thumb error, re-presigning:", photoId);
      refreshThumbUrl(photoId).finally(() => retryingIdsRef.current.delete(photoId));
    },
    [refreshThumbUrl]
  );

  // 컨테이너 폭 → 열 수·행 높이·overscan(화면 2.5개 분량) 계산.
  // 모바일은 2/3/4열 밀도별 gap과 카드 비율을 사용한다.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const update = () => {
      const isMobile = window.innerWidth <= MOBILE_MAX_W;
      const mobileSpec = MOBILE_LAYOUT[mobileColumns];
      const gap = isMobile ? mobileSpec.gap : GRID_GAP;
      const width = el.clientWidth;
      if (width <= 0) return;
      const cols = isMobile
        ? mobileColumns
        : Math.max(1, Math.floor((width + gap) / (GRID_MIN_CELL + gap)));
      const cellSize = (width - gap * (cols - 1)) / cols;
      const cardHeight = isMobile ? cellSize / mobileSpec.aspect + mobileSpec.info : cellSize / DESKTOP_CARD_ASPECT;
      const rowHeight = Math.ceil(cardHeight) + gap;
      const visibleRows = Math.max(1, Math.ceil(window.innerHeight / rowHeight));
      const overscan = Math.ceil(visibleRows * 2.5);
      setLayout((prev) =>
        prev.cols === cols && prev.rowHeight === rowHeight && prev.gap === gap && prev.overscan === overscan
          ? prev
          : { cols, gap, rowHeight, overscan }
      );
      const rect = el.getBoundingClientRect();
      setScrollMargin(rect.top + window.scrollY);
      setLayoutMeasured(true);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [loading, mobileColumns, mobileHeaderCompact]);

  const rowCount = layout.cols > 0 ? Math.ceil(displayPhotos.length / layout.cols) : 0;

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => layout.rowHeight,
    overscan: layout.overscan,
    scrollMargin,
  });

  // 컨테이너 폭 변경으로 rowHeight가 바뀌면 명시적으로 재측정해야 한다
  // (virtualizer는 함수 참조가 그대로면 자동 remeasure를 하지 않음).
  useEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.rowHeight]);

  const rememberDensityAnchor = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const viewportCenter = window.innerHeight / 2;
    let closestId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const card of grid.querySelectorAll<HTMLElement>("[data-photo-id]")) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = card.dataset.photoId ?? null;
      }
    }
    densityAnchorIdRef.current = closestId;
  }, []);

  const applyMobileColumns = useCallback((next: MobileGalleryColumns) => {
    if (next === mobileColumns) return;
    rememberDensityAnchor();
    setMobileColumns(next);
    try {
      if (galleryDensityKey) sessionStorage.setItem(galleryDensityKey, String(next));
    } catch {
      /* ignore */
    }
  }, [mobileColumns, rememberDensityAnchor, galleryDensityKey]);

  // 밀도 변경 전 화면 중앙에 있던 사진을 새 열 수에서도 중앙 부근에 유지한다.
  useLayoutEffect(() => {
    const anchorId = densityAnchorIdRef.current;
    if (!anchorId || !layoutMeasured || layout.cols !== mobileColumns) return;
    const index = displayPhotos.findIndex((photo) => photo.id === anchorId);
    densityAnchorIdRef.current = null;
    if (index < 0) return;
    rowVirtualizer.measure();
    requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(Math.floor(index / layout.cols), { align: "center" });
    });
    // rowVirtualizer는 렌더마다 새 참조라 의도적으로 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.cols, layout.rowHeight, layoutMeasured, mobileColumns, displayPhotos]);

  /** 뷰어에서 갤러리로 돌아왔을 때 스크롤 위치 복원.
   *  픽셀 위치(gs)가 아니라 "보고 있던 사진 id"(gf, 없으면 sessionStorage 폴백)를 우선 사용해
   *  현재 필터/그룹 적용된 목록에서의 인덱스로 복원한다 — 실제로 측정된 열 수(layoutMeasured)가
   *  나오기 전에는 대기해서, 모바일(3열)/데스크톱 등 열 수가 달라도 항상 정확한 행으로 스크롤된다.
   *  포커스 사진을 못 찾으면(필터로 가려짐/삭제됨 등) 저장된 픽셀 위치로 폴백한다. */
  useLayoutEffect(() => {
    if (loading || !layoutMeasured || typeof window === "undefined") return;

    const gsRaw = searchParams.get(GALLERY_SCROLL_PARAM);
    const gfId = searchParams.get(GALLERY_FOCUS_PARAM);
    let focusId = gfId;
    if (!focusId && galleryFocusKey) {
      try {
        focusId = sessionStorage.getItem(galleryFocusKey);
      } catch {
        /* ignore */
      }
    }

    let restored = false;
    if (focusId) {
      const index = displayPhotos.findIndex((p) => p.id === focusId);
      if (index >= 0 && layout.cols > 0) {
        rowVirtualizer.scrollToIndex(Math.floor(index / layout.cols), { align: "center" });
        restored = true;
      }
    }

    if (!restored) {
      let y: number | null = null;
      if (gsRaw != null) {
        y = Number(gsRaw);
      } else if (galleryScrollKey) {
        try {
          const raw = sessionStorage.getItem(galleryScrollKey);
          if (raw != null) y = Number(raw);
        } catch {
          /* ignore */
        }
      }
      if (y != null && Number.isFinite(y) && y >= 0) {
        window.scrollTo({ top: y, behavior: "auto" });
      }
    }

    try {
      if (galleryScrollKey) sessionStorage.removeItem(galleryScrollKey);
      if (galleryFocusKey) sessionStorage.removeItem(galleryFocusKey);
    } catch {
      /* ignore */
    }

    if (gsRaw != null || gfId != null) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(GALLERY_SCROLL_PARAM);
      next.delete(GALLERY_FOCUS_PARAM);
      const q = next.toString();
      router.replace(`/c/${token}/gallery${q ? `?${q}` : ""}`, { scroll: false });
    }
    // rowVirtualizer는 매 렌더마다 새 참조라 deps에 넣으면 매번 재실행된다(파일 내 다른 곳과 동일 관례로 제외).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, layoutMeasured, displayPhotos, layout.cols, galleryScrollKey, galleryFocusKey, searchParams, token, router]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const rangeKey = virtualRows.length > 0
    ? `${virtualRows[0].index}-${virtualRows[virtualRows.length - 1].index}-${layout.cols}`
    : "";

  // 현재 렌더 범위(visible + overscan)의 photoId만 모아 공통 캐시에서 presign한다.
  // 최초 화면은 지연 없이 요청한다. 이후 빠른 스크롤만 80ms 안정될 때까지 기다려
  // 스쳐 지나간 범위의 불필요한 presign 요청을 줄인다.
  useEffect(() => {
    if (loading || !token || virtualRows.length === 0) return;
    const startPhoto = virtualRows[0].index * layout.cols;
    const endPhoto = Math.min(
      (virtualRows[virtualRows.length - 1].index + 1) * layout.cols,
      displayPhotos.length
    );

    const requestRange = () => {
      const ids: string[] = [];
      for (let i = startPhoto; i < endPhoto; i++) {
        const photo = displayPhotos[i];
        if (!photo) continue;
        ids.push(photo.id);
      }
      void ensureThumbUrls(ids);
    };

    if (!firstThumbRangeRequestedRef.current) {
      firstThumbRangeRequestedRef.current = true;
      requestRange();
      return;
    }

    const timer = setTimeout(requestRange, PRESIGN_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, loading, token, displayPhotos, ensureThumbUrls]);

  /* ── 처음/마지막/인덱스로 이동 ── */
  const scrollToPhotoIndex = useCallback(
    (photoIndex: number, align: "start" | "center" = "start") => {
      if (layout.cols <= 0) return;
      const clamped = Math.min(Math.max(photoIndex, 0), Math.max(displayPhotos.length - 1, 0));
      const rowIndex = Math.floor(clamped / layout.cols);
      rowVirtualizer.scrollToIndex(rowIndex, { align });
    },
    [layout.cols, displayPhotos.length, rowVirtualizer]
  );

  const handleJumpToFirst = useCallback(() => scrollToPhotoIndex(0, "start"), [scrollToPhotoIndex]);
  const handleJumpToLast = useCallback(
    () => scrollToPhotoIndex(displayPhotos.length - 1, "start"),
    [scrollToPhotoIndex, displayPhotos.length]
  );
  /* ── Handlers ── */
  const handleCheckClick = useCallback((e: React.MouseEvent, photoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const result = toggle(photoId);
    if (result === "limit-reached") {
      triggerSelectionHaptic("limit");
      setSelectionLimitNoticeKey((current) => (current ?? 0) + 1);
    }
  }, [toggle]);

  const showSelectedPhotos = useCallback(() => {
    setSelectionLimitNoticeKey(null);
    setTabFilter("selected");
    setMobileSearchOpen(false);
    setMobileFiltersOpen(false);
    setMobileScopeOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleGroupBadgeClick = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleRate = useCallback(
    (photoId: string, star: StarRating | undefined) => {
      updatePhotoState(photoId, { rating: star });
    },
    [updatePhotoState]
  );

  const handlePhotoClick = useCallback(
    (e: React.MouseEvent, photoId: string) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const path = `/c/${token}/viewer/${photoId}${appendGalleryScrollQuery(viewerQueryString, window.scrollY)}`;
      router.push(path);
      try {
        if (galleryScrollKey) sessionStorage.setItem(galleryScrollKey, String(window.scrollY));
      } catch {
        /* ignore */
      }
    },
    [token, viewerQueryString, galleryScrollKey, router]
  );

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
  }, [project?.id, token, router, selectedIds]);

  /* ── Loading / error states ── */
  if (loading) {
    return <SystemLoadingScreen />;
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
  const remaining   = N - Y;
  const deadlineDate = new Date(project.deadline);
  const deadlineLabel = Number.isNaN(deadlineDate.getTime()) ? "" : format(deadlineDate, "yy.MM.dd", { locale: ko });
  /* D-day는 고객 화면 공통 규칙(customerDDay) — 검토 마감·원본 다운로드 기한과 같은 계산·같은 색이다 */
  const dday = customerDDay(deadlineDate);
  const dDayLabel = dday?.label ?? "";
  const dDayTone: BadgeTone = dday?.tone ?? "time";
  const footerButtonLabel = remaining > 0
    ? `${remaining}장을 더 셀렉해주세요`
    : remaining < 0
      ? `${Math.abs(remaining)}장 초과됐어요`
      : "셀렉 확정하기";

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
          border: 0;
          border-radius: 4px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer; overflow: hidden;
          display: block; text-decoration: none;
        }
        .gl-card-media { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 3px; }
        .gl-card-placeholder { width: 100%; height: 100%; background: var(--surface); }
        /* 코멘트가 있는 사진 표식. 색은 중립 흰색이다 — 주황은 "선택/제출 + 별점"의 색이라(§색 규칙)
         * 여기에 쓰면 "골랐다"와 같은 무게로 읽힌다. 사진 위에 얹히므로 그림자로 대비를 준다. */
        .gl-comment-indicator {
          display: inline-grid; place-items: center; flex: 0 0 13px;
          width: 13px; height: 13px; color: #fff;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));
        }
        .gl-comment-indicator svg { display: block; }
        .gl-photo-card img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.6s ease; display: block;
        }
        .gl-photo-card:hover img { transform: scale(1.05); }
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
        .gl-rating-summary { display:none; }
        @media (min-width: 768px) {
          .gl-photo-card { aspect-ratio: 1; }
          /* PC 카드에서는 빈 별 다섯 개도 작아 보이지 않도록 클릭 영역과 선을 함께 키운다. */
          .gl-rating-row button { width:22px; height:24px; display:grid; place-items:center; }
          .gl-rating-row svg { width:16px; height:16px; }
        }
        /* 파일명 검색·정렬이 켜진 동안에만 나타난다 — 평소 격자에는 파일명이 없다.
         * 사진 위에 얹히므로 카드 높이가 변하지 않고, 따라서 가상 스크롤 행 높이도 그대로다. */
        .gl-overlay-filename {
          margin: 0 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: rgba(255,255,255,.82); font: 9px/1.2 'Space Mono', 'Noto Sans KR', sans-serif;
          text-shadow: 0 1px 3px rgba(0,0,0,.8);
        }
        .gl-mobile-filter-backdrop, .gl-mobile-filter-sheet, .gl-mobile-similarity-hint { display: none; }

        .gl-check-box {
          position: absolute; top: 10px; left: 10px;
          width: 22px; height: 22px;
          border: 1.5px solid rgba(255,255,255,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 20; transition: all 0.2s ease;
          background: rgba(0,0,0,0.35);
        }
        .gl-group-media { outline: 1px solid rgba(90,110,120,.4); outline-offset: -1px; }
        .gl-in-expanded-group { background: var(--customer-divider); }
        .gl-group-stack { border-bottom: 4px double rgba(255,255,255,.8); }
        .gl-group-badge {
          position: absolute; bottom: 8px; right: 8px;
          min-width: 22px; height: 20px; padding: 0 6px;
          background: rgba(0,0,0,0.7); border: 1px solid #FF4D00;
          color: #FF4D00; font-family: 'Space Mono', monospace;
          font-size: 10px; font-weight: 700; white-space: nowrap;
          display: flex; align-items: center; justify-content: center;
          z-index: 20; cursor: pointer; transition: all 0.15s ease;
        }
        .gl-group-badge:hover { background: #FF4D00; color: #000; }

        .gl-quality-badge {
          position: absolute; top: 10px; right: 10px;
          width: 22px; height: 20px;
          background: rgba(0,0,0,0.7); border: 1px solid #FFB800;
          color: #FFB800;
          display: flex; align-items: center; justify-content: center;
          z-index: 20; pointer-events: none;
        }
        .gl-quality-badge-eyes {
          border-color: #4DA3FF; color: #4DA3FF;
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
          .gl-mobile-header { display: block !important; }
          .gl-grid-bg { display: none; }
          .gl-page-wrapper { background: #fff !important; }

          .gl-mobile-appbar {
            height: 51px; padding: 0 20px; display: flex; align-items: center;
            justify-content: space-between; background: #fff;
            overflow: hidden; opacity: 1; transform: translateY(0);
            transition: height 200ms ease, opacity 140ms ease, transform 200ms ease;
          }
          .gl-mobile-title { display: flex; align-items: center; gap: 5px; min-width: 0; color: #26282c; }
          .gl-mobile-brand-home {
            width: 38px; height: 44px; margin-left: -6px; flex: 0 0 38px;
            display: grid; place-items: center; border-radius: 8px;
            text-decoration: none; -webkit-tap-highlight-color: transparent;
          }
          .gl-mobile-brand-home span {
            width: 26px; height: 26px; display: grid; place-items: center;
            border-radius: 7px; background: #ff4d00; color: #fff;
            font: 800 14px/1 Pretendard, sans-serif;
            box-shadow: 0 1px 2px rgba(25, 25, 24, .12);
            transition: transform 120ms ease, background-color 120ms ease;
          }
          .gl-mobile-brand-home:active span { transform: scale(.94); background: #e84600; }
          .gl-mobile-brand-home:focus-visible { outline: 2px solid #ff4d00; outline-offset: 1px; }
          .gl-mobile-brand-home.is-compact { width: 34px; flex-basis: 34px; margin-left: -4px; }
          .gl-mobile-brand-home.is-compact span { width: 24px; height: 24px; border-radius: 6px; font-size: 13px; }
          .gl-mobile-title strong { font-size: 16px; line-height: 24px; letter-spacing: -0.32px; }
          .gl-mobile-deadline { display: flex; align-items: center; gap: 6px; font: 500 12px/18px Pretendard, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--customer-ink-secondary); white-space: nowrap; }
          .gl-mobile-toolbar { height: 48px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; transition: height 200ms ease; }
          .gl-mobile-toolbar-leading { min-width: 0; display: flex; align-items: center; gap: 4px; }
          .gl-mobile-header-compact .gl-mobile-appbar { height: 0; opacity: 0; transform: translateY(-10px); pointer-events: none; }
          .gl-mobile-header-compact .gl-mobile-toolbar { height: 56px; }
          .gl-mobile-filter-trigger { min-height: 44px; margin-left: -4px; padding: 0 4px; border: 0; background: transparent; display: flex; align-items: center; gap: 6px; color: #191918; font: inherit; }
          .gl-mobile-filter-trigger strong, .gl-mobile-filter-trigger span { font-size: 12px; line-height: 19px; white-space: nowrap; }
          @media (max-width: 359px) {
            .gl-mobile-toolbar { padding: 0 10px; gap: 4px; }
            .gl-mobile-filter-trigger { gap: 3px; }
            .gl-mobile-toolbar-actions { gap: 4px !important; }
          }
          .gl-mobile-filter-trigger span { color: #6f6f6f; font-weight: 600; }
          .gl-mobile-scope-menu { position: absolute; left: 20px; top: calc(99px + env(safe-area-inset-top)); z-index: 2; width: 148px; padding: 6px; border: 1px solid #dde1e4; border-radius: 6px; background: #fff; box-shadow: 0 8px 24px rgba(25,25,24,.12); }
          .gl-mobile-header-compact .gl-mobile-scope-menu { top: calc(56px + env(safe-area-inset-top)); }
          .gl-mobile-scope-option { width: 100%; height: 40px; padding: 0 10px; border: 0; border-radius: 4px; background: transparent; display: flex; align-items: center; justify-content: space-between; color: #26282c; font: 13px/20px Pretendard, sans-serif; }
          .gl-mobile-scope-option-active { background: #fff0e8; color: #ff4d00; font-weight: 700; }
          .gl-mobile-toolbar-actions { display: flex; gap: 8px; }
          .gl-mobile-tool-wrap { position: relative; }
          /* 버튼 상자는 덜어내되 터치 높이는 유지해 텍스트와 같은 무게로 정렬한다. */
          .gl-mobile-tool-btn { width: 34px; height: 44px; border: 0; border-radius: 6px; background: transparent; color: #6f747b; display: grid; place-items: center; padding: 0; }
          .gl-mobile-tool-btn-active { background: #fff0e8; color: #ff4d00; }
          .gl-mobile-similarity-toggle { border:0 !important; background:transparent !important; height:44px !important; padding:0 5px !important; font-size:12px !important; }
          .gl-mobile-similarity-toggle[aria-pressed="true"] { background:#fff0e8 !important; }
          .gl-mobile-tool-btn:focus-visible, .gl-mobile-similarity-toggle:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
          .gl-mobile-density-icon { width: 15px; height: 14px; display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 2px; }
          .gl-mobile-density-icon span { min-width: 0; min-height: 0; border: 1px solid currentColor; border-radius: 1px; }
          .gl-mobile-similarity-hint { position: absolute; top: 38px; right: 0; z-index: 5; width: 218px; min-height: 44px; box-sizing: border-box; padding: 9px 34px 9px 12px; border-radius: 7px; background: rgba(25,25,24,.95); color: #fff; display: flex; align-items: center; box-shadow: 0 8px 24px rgba(0,0,0,.2); font: 500 11px/17px Pretendard, sans-serif; letter-spacing: -.2px; }
          .gl-mobile-similarity-hint::before { content: ''; position: absolute; top: -5px; right: 28px; width: 10px; height: 10px; transform: rotate(45deg); background: rgba(25,25,24,.95); }
          .gl-mobile-similarity-hint button { position: absolute; top: 3px; right: 3px; width: 32px; height: 38px; padding: 0; border: 0; background: transparent; color: rgba(255,255,255,.65); display: grid; place-items: center; }
          .gl-mobile-filter-count { position: absolute; top: -6px; right: -6px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: #ff4d00; color: #fff; font-size: 8px; line-height: 14px; font-weight: 700; text-align: center; pointer-events: none; }
          .gl-mobile-search-row { height: 51px; padding: 7px 20px 8px; background: #fff; }
          .gl-mobile-active-filters { min-height: 37px; padding: 4px 20px; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; background: #fff; }
          .gl-mobile-active-filters::-webkit-scrollbar { display: none; }
          .gl-mobile-filter-chip { height: 29px; padding: 0 8px 0 12px; border: 1px solid #838b94; border-radius: 999px; background: #fff; color: #191918; display: flex; align-items: center; gap: 5px; flex: 0 0 auto; font: 12px/19px Pretendard, sans-serif; }
          .gl-mobile-filter-chip-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
          /* .gl-mobile-filter-options가 grid-template-columns: repeat(5, 1fr)라, 이 문구도
           * 한 칸(1/5 폭)에 갇혀 여백이 있는데도 줄바꿈됐다 — 전체 폭을 쓰게 한다. */
          .gl-mobile-filter-empty { grid-column: 1 / -1; margin: 0; padding: 4px 2px; color: #6f747b; font: 12px/19px Pretendard, sans-serif; white-space: nowrap; }
          /* 두 명 이상을 고르면 "누구 하나라도" 와 "둘 다"가 전혀 다른 결과라 명시적으로 고르게 한다 */
          .gl-mobile-filter-mode { margin-top: 10px; display: flex; gap: 6px; }
          .gl-mobile-filter-mode button {
            flex: 1; min-height: 38px; padding: 0 10px;
            border: 1px solid #dde1e4; border-radius: 8px; background: #fff;
            font: 500 13px/18px Pretendard, sans-serif; color: #5f5e5b;
          }
          .gl-mobile-filter-mode-active { border-color: #ff4d00 !important; background: #fff5f0 !important; color: #191918 !important; font-weight: 600 !important; }

          /* 그리드 — 열 수/간격은 JS에서 뷰포트 폭 기준으로 계산(가상화) */
          .gl-page-wrapper { padding-top: calc(99px + env(safe-area-inset-top)) !important; padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important; transition: padding-top 200ms ease; }
          .gl-page-wrapper.gl-mobile-search-expanded { padding-top: calc(150px + env(safe-area-inset-top)) !important; }
          .gl-page-wrapper.gl-mobile-filter-active { padding-top: calc(136px + env(safe-area-inset-top)) !important; }
          .gl-page-wrapper.gl-mobile-header-compact { padding-top: calc(56px + env(safe-area-inset-top)) !important; }
          .gl-page-wrapper.gl-mobile-header-compact.gl-mobile-search-expanded { padding-top: calc(107px + env(safe-area-inset-top)) !important; }
          .gl-page-wrapper.gl-mobile-header-compact.gl-mobile-filter-active { padding-top: calc(93px + env(safe-area-inset-top)) !important; }

          @media (prefers-reduced-motion: reduce) {
            .gl-mobile-appbar, .gl-mobile-toolbar, .gl-page-wrapper { transition: none; }
            .gl-mobile-brand-home span { transition: none; }
          }
          .gl-grid-main { padding: 0 20px !important; }

          /* 카드 구조는 PC와 같다(카드 = 사진 1:1, 파일명·별점은 사진 위 그라데이션).
           * 배경은 흰 카드 + 얇은 구분선 — 기본값 var(--surface)는 다크 토큰(#15161a)이라
           * 라이트 갤러리에서 사진이 로딩되기 전/실패했을 때 검은 사각형이 뜬다. */
          .gl-photo-card {
            border-radius: 4px; transition: none;
            background: #fff; border: 1px solid var(--customer-divider); box-sizing: border-box;
          }
          .gl-card-placeholder { background: #f1f3f6; }

          /* 파일명을 걷어내면서 카드 상자(.gl-card-shell)도 함께 없앴다 — 상자는 사진과 파일명 줄을
           * 한 덩어리로 묶으려고 둔 것이라 파일명이 사라지면 남는 게 사진뿐이다.
           * 그래서 선택 표시도 3·4열·검토 목록·잠금 갤러리와 같은 사진 안쪽 링으로 돌아간다
           * (2열만 상자 테두리로 알리면 밀도를 바꿀 때 선택 표시가 다른 것으로 바뀌어 보인다). */
          .gl-photo-card:hover img { transform: none; }
          .gl-card-media { border-radius: 3px; }
          .gl-card-overlay { padding: 5px !important; background: none; }
          .gl-card-overlay .gl-overlay-interactive button { font-size: 8px !important; }
          /* 코멘트 표식과 찜 dot이 나란히 서므로 무게를 맞춘다 — 예전에는 14px 외곽선 아이콘 옆에
           * 5px 채운 원이라 2.8배 차이가 났다. */
          .gl-card-overlay .gl-color-dot { width: 7px !important; height: 7px !important; }

          /* 체크박스 크기 */
          .gl-check-box { width: 44px !important; height: 44px !important; top: 0 !important; left: 0 !important; border: 0 !important; background: transparent !important; justify-content: flex-start; align-items: flex-start; padding: 9px 0 0 9px; }
          .gl-check-box::before { content: ''; position: absolute; left: 6px; top: 6px; width: 18px; height: 18px; border: 1px solid rgba(255,255,255,.72); background: rgba(255,255,255,.92); box-sizing: border-box; }
          .gl-photo-card.gl-selected .gl-check-box { background: transparent !important; border-color: transparent !important; }
          .gl-photo-card.gl-selected .gl-check-box::before { background: #ff4d00; border-color: #ff4d00; }
          .gl-check-box svg { position: relative; z-index: 1; }
          .gl-quality-badge { width: 18px !important; height: 18px !important; top: 6px !important; right: 6px !important; }
          .gl-group-badge { min-width: 18px; height: 16px; right: 5px; bottom: 5px; padding: 0 4px; border: 0; border-radius: 2px; background: rgba(0,0,0,.45); color: #fff; font-size: 8px; }

          /* 비율은 모든 밀도에서 1:1 — 형제 화면(검토 목록·잠금 갤러리)과 같은 값이다.
           * 2열이 사진을 가장 크게 보는 밀도인데 거기서 가장 많이 잘리던(1.46:1 가로 crop) 것을 없앤다. */
          .gl-density-2 .gl-photo-card { aspect-ratio: 4 / 3; }
          .gl-density-3 .gl-photo-card,
          .gl-density-4 .gl-photo-card { aspect-ratio: 1 / 1; }

          /* 검색·정렬이 켜졌을 때만 나타나는 파일명 — 4열은 8px 글자가 뭉개져 읽히지 않고
           * 그라데이션도 없어 사진에 그대로 묻히므로 그때는 감춘다. */
          .gl-density-2 .gl-overlay-filename { font-size: 9px; }
          .gl-density-3 .gl-overlay-filename { font-size: 8px; margin-bottom: 2px; }
          .gl-density-4 .gl-overlay-filename { display: none; }

          /* 그라데이션은 별점·표식이 얹히는 2·3열에만 */
          .gl-density-2 .gl-card-overlay,
          .gl-density-3 .gl-card-overlay { background: linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,.18) 42%, transparent 68%); }
          .gl-density-2 .gl-overlay-interactive { height: 16px; min-height: 16px !important; align-items: center !important; }
          .gl-density-2 .gl-rating-row, .gl-density-2 .gl-marker-row { height: 16px; align-items: center; }
          .gl-density-2 .gl-overlay-interactive button {
            width: 16px; height: 16px; display: grid; place-items: center;
            font-size: 12px !important; line-height: 16px !important;
          }
          .gl-density-2 .gl-comment-indicator {
            width: 13px !important; height: 13px !important; flex: 0 0 13px;
            transform: translateY(-1px);
          }
          .gl-density-2 .gl-check-box { top: 2px !important; left: 2px !important; }

          /* 별점·코멘트·색은 3열까지 유지한다 — 밀도는 "한 번에 몇 장을 보나"이지 기능 스위치가 아니다.
           * 4열은 별 하나가 8px 밑이라 누를 수도 읽을 수도 없어 그때만 감춘다. */
          .gl-density-3 .gl-overlay-interactive { height: 14px; min-height: 14px !important; align-items: center !important; }
          .gl-density-3 .gl-rating-row, .gl-density-3 .gl-marker-row { height: 14px; align-items: center; }
          .gl-density-3 .gl-overlay-interactive button {
            width: 13px; height: 13px; display: grid; place-items: center;
            font-size: 10px !important; line-height: 13px !important;
          }
          .gl-density-3 .gl-comment-indicator {
            width: 11px !important; height: 11px !important; flex: 0 0 11px;
            transform: translateY(-1px);
          }
          /* 작은 모바일 카드에서는 조작 대신 평가 결과만 표시한다. 상세에서 별점을 바꾼다. */
          .gl-density-3 .gl-rating-row, .gl-density-4 .gl-rating-row { display:none !important; }
          .gl-density-3 .gl-rating-summary, .gl-density-4 .gl-rating-summary { display:inline-flex; align-items:center; gap:3px; color:#fff; font-size:11px; line-height:16px; }
          .gl-density-4 .gl-card-overlay { display:flex; padding:4px; background:linear-gradient(to top,rgba(0,0,0,.6),transparent 60%); }
          .gl-density-4 .gl-marker-row { display:none !important; }
          .gl-density-4 .gl-check-box { top: 0 !important; left: 0 !important; padding: 6px 0 0 6px; }
          .gl-density-4 .gl-check-box::before { left: 5px; top: 5px; width: 12px; height: 12px; }
          .gl-density-4 .gl-check-box svg { width: 8px; height: 8px; }
          .gl-density-4 .gl-quality-badge { display: none; }
          .gl-photo-card.gl-selected .gl-card-media img { filter: brightness(.8); }

          .gl-mobile-filter-backdrop { display: block; position: fixed; inset: 0; z-index: 80; border: 0; background: rgba(0,0,0,.48); padding: 0; }
          .gl-mobile-filter-sheet { display: block; position: fixed; left: 50%; bottom: 0; z-index: 81; width: min(100%, 375px); transform: translateX(-50%); border-radius: 8px 8px 0 0; background: #fff; padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -8px 30px rgba(0,0,0,.12); }
          .gl-mobile-filter-sheet-header { height: 58px; padding: 20px 20px 0; display: flex; align-items: center; justify-content: space-between; }
          .gl-mobile-filter-sheet-title { margin: 0; color: #191918; font-size: 18px; line-height: 30px; font-weight: 700; letter-spacing: -.6px; }
          .gl-mobile-filter-reset { border: 0; background: transparent; color: #838b94; font: 12px/24px Pretendard, sans-serif; text-decoration: underline; padding: 0; }
          .gl-mobile-filter-sheet-body { padding: 20px; }
          .gl-mobile-filter-section + .gl-mobile-filter-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eef0f2; }
          .gl-mobile-filter-section h3 { margin: 0 0 10px; color: rgba(0,0,0,.9); font-size: 14px; line-height: 24px; font-weight: 500; letter-spacing: -.45px; }
          .gl-mobile-filter-options { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
          .gl-mobile-filter-option { height: 39px; min-width: 0; padding: 0 4px; border: 1px solid #c6cbd0; border-radius: 4px; background: #fff; color: #191918; display: flex; align-items: center; justify-content: center; gap: 4px; font: 12px/19px Pretendard, sans-serif; }
          .gl-mobile-filter-option-active { border-color: #ff4d00; background: #fff0e8; }
          .gl-mobile-stars { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
          .gl-mobile-stars-op { margin-right: 4px; color: #aab0b8; font: 700 16px/1 Pretendard, sans-serif; }
          .gl-mobile-star-btn { padding: 4px; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .gl-mobile-filter-option-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }

          .gl-empty-mobile { min-height: 478px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 20px; color: #191918; }
          .gl-empty-mobile-icon { width: 58px; height: 58px; border-radius: 12px; background: #f1f3f6; color: #aab0b8; display: grid; place-items: center; margin-bottom: 16px; }
          .gl-empty-mobile h2 { margin: 0; font-size: 19px; line-height: 38px; letter-spacing: -1.18px; }
          .gl-empty-mobile p { margin: 0; color: #5f5e5b; font-size: 11px; line-height: 17px; }
          .gl-empty-mobile button { height: 39px; margin-top: 28px; padding: 0 24px; border: 1px solid #bfbfbf; border-radius: 4px; background: #fff; color: #191918; font: 12px/19px Pretendard, sans-serif; }
          .gl-empty-desktop { display: none !important; }

          /* 하단 바 */
          .gl-footer-inner { height: 60px !important; padding: 0 14px !important; gap: 12px !important; }
          .gl-footer-meta { display: none !important; }
          .gl-footer-progress { gap: 4px !important; }
          .gl-footer-progress-label { font-size: 9px !important; }
          .gl-btn-confirm { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
        }

        @media (min-width: 768px) {
          .gl-page-wrapper { padding-top:calc(var(--selection-header-height, 116px) + 16px) !important; }
          .gl-mobile-header { display: none !important; }
          .gl-empty-mobile { display: none !important; }

          /* PC 라이트 재스킨 — docs/customer-design.md §10 "PC composition".
           * 다크 워크스페이스 토큰(var(--surface)/var(--background))을 그대로 물려받던 배경/카드를
           * 고객 라이트 토큰으로 override한다. 그리드 컬럼 계산(JS)과 카드 구조는 그대로 둔다. */
          .gl-grid-bg { display: none; }
          .gl-page-wrapper { background: var(--customer-canvas) !important; }
          .gl-photo-card, .gl-card-placeholder { background: var(--customer-divider); }
        }
      `}</style>

      <div className={`gl-page-wrapper gl-density-${mobileColumns}${mobileHeaderCompact ? " gl-mobile-header-compact" : ""}${mobileSearchOpen ? " gl-mobile-search-expanded" : ""}${mobileFilterChipsVisible ? " gl-mobile-filter-active" : ""}`} style={{ background: "var(--background)", minHeight: "100vh", paddingTop: 140, paddingBottom: 100 }}>
        <div className="gl-grid-bg" />

        {/* ── Header ── */}
        <header
          className={`gl-mobile-header${mobileHeaderCompact ? " gl-mobile-header-compact" : ""}`}
          style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, paddingTop: "env(safe-area-inset-top)", background: "#fff", borderBottom: "1px solid #eef0f2" }}
        >
          <div className="gl-mobile-appbar">
            <div className="gl-mobile-title">
              {!mobileHeaderCompact && <CustomerGalleryHomeMark token={token} />}
              <strong>사진 셀렉</strong>
            </div>
            <div className="gl-mobile-deadline">
              <span>{deadlineLabel}</span>
              {dDayLabel && <Badge tone={dDayTone} theme="customerLight" className="font-mono">{dDayLabel}</Badge>}
            </div>
          </div>
          <div className="gl-mobile-toolbar">
            <div className="gl-mobile-toolbar-leading">
              {mobileHeaderCompact && <CustomerGalleryHomeMark token={token} compact />}
              <button type="button" className="gl-mobile-filter-trigger" aria-expanded={mobileScopeOpen} onClick={() => { setMobileScopeOpen((value) => !value); setMobileSearchOpen(false); setMobileFiltersOpen(false); }}>
                <strong>{tabFilter === "selected" ? "선택됨" : "전체"}</strong>
                <span>{tabFilter === "selected" ? Y : photos.length}장</span>
                <ChevronDown size={12} strokeWidth={1.8} />
              </button>
            </div>
            <div className="gl-mobile-toolbar-actions">
              {showSimilarityToggle && (
                <div className="gl-mobile-tool-wrap">
                  <SimilarityToggleButton
                    className="gl-mobile-similarity-toggle"
                    size="compact"
                    active={similarityToggleOn}
                    count={photoGroups.length}
                    onClick={() => {
                      dismissSimilarityHint();
                      setSimilarityToggleOn((value) => !value);
                      setMobileSearchOpen(false);
                      setMobileFiltersOpen(false);
                      setMobileScopeOpen(false);
                    }}
                  />
                  {similarityHintVisible && (
                    <aside className="gl-mobile-similarity-hint" role="status">
                      비슷한 사진을 묶어서 볼 수 있어요
                      <button type="button" onClick={dismissSimilarityHint} aria-label="유사컷 안내 닫기"><X size={14} /></button>
                    </aside>
                  )}
                </div>
              )}
              <button
                type="button"
                className="gl-mobile-tool-btn"
                onClick={() => {
                  const nextColumns = mobileColumns === 4
                    ? 2
                    : (mobileColumns + 1) as MobileGalleryColumns;
                  applyMobileColumns(nextColumns);
                  setMobileSearchOpen(false);
                  setMobileFiltersOpen(false);
                  setMobileScopeOpen(false);
                }}
                aria-label={`현재 ${mobileColumns}열, 누르면 ${mobileColumns === 4 ? 2 : mobileColumns + 1}열로 변경`}
                title={`${mobileColumns}열 보기`}
              >
                <span
                  className="gl-mobile-density-icon"
                  style={{ gridTemplateColumns: `repeat(${mobileColumns}, minmax(0, 1fr))` }}
                  aria-hidden="true"
                >
                  {Array.from({ length: mobileColumns * 2 }, (_, index) => <span key={index} />)}
                </span>
              </button>
              <div className="gl-mobile-tool-wrap">
                <button type="button" className={`gl-mobile-tool-btn${mobileFiltersOpen ? " gl-mobile-tool-btn-active" : ""}`} onClick={() => { setMobileFiltersOpen(true); setMobileSearchOpen(false); setMobileScopeOpen(false); }} aria-label="사진 필터 설정" aria-expanded={mobileFiltersOpen}>
                  <SlidersHorizontal size={14} strokeWidth={1.5} />
                </button>
                {activeMobileFilterCount > 0 && <span className="gl-mobile-filter-count">{activeMobileFilterCount}</span>}
              </div>
              <button type="button" className={`gl-mobile-tool-btn${mobileSearchOpen ? " gl-mobile-tool-btn-active" : ""}`} onClick={() => { setMobileSearchOpen((value) => !value); setMobileFiltersOpen(false); setMobileScopeOpen(false); }} aria-label="파일명 검색" aria-expanded={mobileSearchOpen}>
                <Search size={14} strokeWidth={1.7} />
              </button>
            </div>
          </div>
          {mobileScopeOpen && (
            <div className="gl-mobile-scope-menu">
              <button type="button" className={`gl-mobile-scope-option${tabFilter === "all" ? " gl-mobile-scope-option-active" : ""}`} onClick={() => { setTabFilter("all"); setMobileScopeOpen(false); }}><span>전체</span><span>{photos.length}장</span></button>
              <button type="button" className={`gl-mobile-scope-option${tabFilter === "selected" ? " gl-mobile-scope-option-active" : ""}`} onClick={() => { setTabFilter("selected"); setMobileScopeOpen(false); }}><span>선택됨</span><span>{Y}장</span></button>
            </div>
          )}
          {mobileSearchOpen && (
            <div className="gl-mobile-search-row">
              <FilenameSearchInput
                value={searchValue}
                onChange={setSearchValue}
                ariaLabel="파일명으로 필터링"
                autoFocus
                style={{ "--fsi-height": "36px", "--fsi-border-color": "#ff4d00", "--fsi-radius": "4px" } as React.CSSProperties}
              />
            </div>
          )}
          {mobileFilterChipsVisible && (
            <div className="gl-mobile-active-filters" aria-label="적용 중인 필터">
              {starFilter > 0 && <button type="button" className="gl-mobile-filter-chip" onClick={() => setStarFilter(0)}><Star size={13} fill="#FF4D00" color="#FF4D00" /><span>{starFilter}점</span><X size={14} /></button>}
              {colorFilter.map((color) => <button key={color} type="button" className="gl-mobile-filter-chip" onClick={() => setColorFilter((current) => current.filter((item) => item !== color))}><span className="gl-mobile-filter-chip-dot" style={{ background: COLOR_OPTIONS.find((option) => option.key === color)?.hex }} /><span>{colorLabel(color)}</span><X size={14} /></button>)}
              {colorFilter.length > 1 && colorFilterMode === "all" && <button type="button" className="gl-mobile-filter-chip" onClick={() => setColorFilterMode("any")}><span>모두 찜</span><X size={14} /></button>}
              {searchValue.trim() && <button type="button" className="gl-mobile-filter-chip" onClick={() => setSearchValue("")}><Search size={13} /><span>{searchValue.trim()}</span><X size={14} /></button>}
              {qualityFilter.has("blurry") && <button type="button" className="gl-mobile-filter-chip" onClick={() => toggleQualityFilter("blurry")}><span>흐림</span><X size={14} /></button>}
              {qualityFilter.has("eyesClosed") && <button type="button" className="gl-mobile-filter-chip" onClick={() => toggleQualityFilter("eyesClosed")}><span>눈감음</span><X size={14} /></button>}
            </div>
          )}
        </header>

        <GalleryDesktopHeader
          token={token}
          projectName={project.name}
          photographerName={photographer?.name ?? null}
          deadlineLabel={deadlineLabel}
          dDayLabel={dDayLabel}
          dDayTone={dDayTone}
          Y={Y}
          N={N}
          tabFilter={tabFilter}
          onTabFilterChange={setTabFilter}
          starFilter={starFilter}
          hoverStar={hoverStar}
          onStarFilterChange={setStarFilter}
          onHoverStarChange={setHoverStar}
          colorFilter={colorFilter}
          usedColors={usedColors}
          myColor={participant?.color ?? null}
          colorLabel={colorLabel}
          colorFilterMode={colorFilterMode}
          onColorFilterModeChange={setColorFilterMode}
          onColorFilterChange={setColorFilter}
          showSimilarityToggle={showSimilarityToggle}
          similarityToggleOn={similarityToggleOn}
          onSimilarityToggleChange={setSimilarityToggleOn}
          hasBlurryPhotos={hasBlurryPhotos}
          hasEyesClosedPhotos={hasEyesClosedPhotos}
          qualityFilter={qualityFilter}
          onToggleQualityFilter={toggleQualityFilter}
          onResetFilters={() => { setStarFilter(0); setColorFilter([]); setColorFilterMode("any"); setHoverStar(0); }}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          onJumpToFirst={handleJumpToFirst}
          onJumpToLast={handleJumpToLast}
        />

        {mobileFiltersOpen && (
          <>
            <button type="button" className="gl-mobile-filter-backdrop" aria-label="필터 닫기" onClick={() => setMobileFiltersOpen(false)} />
            <section className="gl-mobile-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title">
              <div className="gl-mobile-filter-sheet-header">
                <h2 id="mobile-filter-title" className="gl-mobile-filter-sheet-title">필터 설정</h2>
                <button type="button" className="gl-mobile-filter-reset" onClick={clearMobileFilters}>필터 초기화</button>
              </div>
              <div className="gl-mobile-filter-sheet-body">
                <div className="gl-mobile-filter-section">
                  <h3>별점</h3>
                  {/* PC 헤더(gld-stars)와 같은 방식 — 숫자별 박스 대신 별을 눌러 그 점수까지
                    * 채우는 "≥" 등급 입력으로 통일한다. */}
                  <div className="gl-mobile-stars">
                    <span className="gl-mobile-stars-op" style={{ color: starFilter > 0 ? "#ff4d00" : undefined }}>≥</span>
                    {([1, 2, 3, 4, 5] as const).map((star) => {
                      const filled = star <= starFilter;
                      return (
                        <button
                          key={star}
                          type="button"
                          className="gl-mobile-star-btn"
                          aria-label={`별점 ${star}점 이상 필터`}
                          aria-pressed={starFilter === star}
                          onClick={() => setStarFilter((current) => current === star ? 0 : star)}
                        >
                          <Star size={26} fill={filled ? "currentColor" : "none"} strokeWidth={2} style={{ color: filled ? "#ff4d00" : "#c6cbd0" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="gl-mobile-filter-section">
                  <h3>찜</h3>
                  <div className="gl-mobile-filter-options">
                    {colorFilterOptions.length === 0 ? (
                      <p className="gl-mobile-filter-empty">아직 찜한 사람이 없어요</p>
                    ) : (
                      colorFilterOptions.map((option) => {
                        const active = colorFilter.includes(option.key);
                        return (
                          <button key={option.key} type="button" className={`gl-mobile-filter-option${active ? " gl-mobile-filter-option-active" : ""}`} aria-pressed={active} onClick={() => setColorFilter((current) => current.includes(option.key) ? current.filter((item) => item !== option.key) : [...current, option.key])}>
                            <span className="gl-mobile-filter-option-dot" style={{ background: option.hex }} /><span>{option.label}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {colorFilter.length > 1 && (
                    <div className="gl-mobile-filter-mode" role="radiogroup" aria-label="찜 조건">
                      <button type="button" role="radio" aria-checked={colorFilterMode === "any"}
                        className={colorFilterMode === "any" ? "gl-mobile-filter-mode-active" : ""}
                        onClick={() => setColorFilterMode("any")}>한 명이라도 찜</button>
                      <button type="button" role="radio" aria-checked={colorFilterMode === "all"}
                        className={colorFilterMode === "all" ? "gl-mobile-filter-mode-active" : ""}
                        onClick={() => setColorFilterMode("all")}>모두 찜</button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ── Gallery Grid (가상화: 화면 + overscan 범위만 실제 DOM에 렌더) ── */}
        <main className="gl-grid-main" style={{ position: "relative", zIndex: 10, maxWidth: "var(--customer-gallery-max-width, 1440px)", margin: "0 auto", padding: "0 24px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--customer-ink-secondary)", wordBreak: "keep-all" }}>체크한 사진이 최종 선택됩니다. 별점과 찜은 고를 때 참고하세요.</p>
          <div ref={gridRef} style={{ position: "relative", width: "100%", height: rowVirtualizer.getTotalSize(), touchAction: "pan-y" }}>
            {virtualRows.map((vRow) => {
              const rowStart = vRow.index * layout.cols;
              const cells: React.ReactNode[] = [];
              for (let c = 0; c < layout.cols; c++) {
                const photoIndex = rowStart + c;
                if (photoIndex >= displayPhotos.length) break;
                const photo = displayPhotos[photoIndex];
                const selected        = selectedIds.has(photo.id);
                const state           = photoStates[photo.id];
                const rating          = state?.rating;
                const colorTags       = state?.color;
                const group           = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
                const selInfo          = group ? groupSelectionInfo.get(group.id) : undefined;
                // isRepresentative: "AI 대표컷"이 아니라 "이 그룹의 현재 표지(front) 사진"이라는 뜻 —
                // 그룹 내 셀렉이 1장 이상이면 그중 원래 순서가 가장 앞선 사진, 없으면 내부 기본 표지.
                const isRepresentative = !!group && getGroupFrontPhotoId(group, selInfo) === photo.id;
                const totalCount      = group ? group.photoCount : 0;
                const restCount       = group ? group.photoCount - 1 : 0; // 표지 외에 접혀서 숨겨진 사진 수 — 셀렉 개수와 무관하게 고정
                const selectedCount   = selInfo?.selectedCount ?? 0;
                const groupingActive  = similarityToggleOn && !narrowingFilterActive;
                const showGroupBadge  = groupingActive && isRepresentative && restCount > 0;
                const groupExpanded   = groupingActive && !!group && expandedGroups.has(group.id);
                const presignedThumb  = presignedUrls.get(photo.id)?.url;

                cells.push(
                  <GalleryPhotoCard
                    key={photo.id}
                    token={token}
                    photo={photo}
                    selected={selected}
                    rating={rating}
                    colorTags={colorTags}
                    hasComment={Boolean(state?.comment?.trim())}
                    showGroupBadge={showGroupBadge}
                    groupId={group?.id}
                    groupLabel={group ? `묶음 ${photoGroups.findIndex((item) => item.id === group.id) + 1}` : undefined}
                    restCount={restCount}
                    totalCount={totalCount}
                    selectedCount={selectedCount}
                    isGroupExpanded={groupExpanded}
                    inExpandedGroup={groupExpanded}
                    presignedThumb={presignedThumb}
                    thumbQueue={thumbQueue}
                    viewerQueryString={viewerQueryString}
                    density={layout.cols}
                    showFilename={filenameContextActive}
                    onPhotoClick={handlePhotoClick}
                    onCheckClick={handleCheckClick}
                    onGroupBadgeClick={handleGroupBadgeClick}
                    onRate={handleRate}
                    onThumbError={handleThumbError}
                  />
                );
              }
              return (
                <div
                  key={vRow.key}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%",
                    height: Math.max(vRow.size - layout.gap, 0),
                    transform: `translateY(${vRow.start - scrollMargin}px)`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                    gap: layout.gap,
                    boxSizing: "border-box",
                  }}
                >
                  {cells}
                </div>
              );
            })}
          </div>

          {displayPhotos.length === 0 && (
            <>
              <div className="gl-empty-mobile">
                <div className="gl-empty-mobile-icon"><Search size={26} strokeWidth={1.5} /></div>
                <h2>{activeMobileFilterCount > 0 ? "조건에 맞는 사진이 없어요" : "선택한 사진이 없어요"}</h2>
                <p>{activeMobileFilterCount > 0 ? "검색어 또는 필터를 바꿔보세요" : "마음에 드는 사진을 먼저 선택해 주세요"}</p>
                <button type="button" onClick={activeMobileFilterCount > 0 ? clearMobileFilters : () => setTabFilter("all")}>
                  {activeMobileFilterCount > 0 ? "검색 · 필터 지우기" : "전체 사진 보기"}
                </button>
              </div>
              <div className="gl-empty-desktop" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 0", gap: 16 }}>
                <div style={{ width: 58, height: 58, borderRadius: 12, background: "var(--customer-divider)", color: "var(--customer-ink-secondary)", display: "grid", placeItems: "center" }}>
                  <Search size={26} strokeWidth={1.5} />
                </div>
                <h2 style={{ margin: 0, fontSize: 19, lineHeight: "28px", color: "var(--customer-ink)" }}>
                  {activeMobileFilterCount > 0 ? "조건에 맞는 사진이 없어요" : "선택한 사진이 없어요"}
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "var(--customer-ink-secondary)" }}>
                  {activeMobileFilterCount > 0 ? "검색어 또는 필터를 바꿔보세요" : "마음에 드는 사진을 먼저 선택해 주세요"}
                </p>
                <button
                  type="button"
                  onClick={activeMobileFilterCount > 0 ? clearMobileFilters : () => setTabFilter("all")}
                  style={{ height: 39, marginTop: 12, padding: "0 24px", border: "1px solid var(--customer-divider)", borderRadius: 4, background: "var(--customer-canvas)", color: "var(--customer-ink)", font: "12px/19px Pretendard, sans-serif", cursor: "pointer" }}
                >
                  {activeMobileFilterCount > 0 ? "검색 · 필터 지우기" : "전체 사진 보기"}
                </button>
              </div>
            </>
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
          buttonLabel={footerButtonLabel}
          showMeta={false}
          mobileGallery
          theme="customerLight"
          attentionKey={selectionLimitNoticeKey ?? 0}
        />

        {selectionLimitNoticeKey !== null && (
          <SelectionLimitSnackbar
            count={N}
            noticeKey={selectionLimitNoticeKey}
            placement="gallery"
            onViewSelected={showSelectedPhotos}
            onDismiss={() => setSelectionLimitNoticeKey(null)}
          />
        )}

        {/* ── Confirm Modal ── */}
        {showConfirmModal && (
          <SelectionConfirmDialog
            count={Y}
            confirming={confirming}
            error={confirmError}
            onCancel={() => { if (!confirming) setShowConfirmModal(false); }}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </>
  );
}
