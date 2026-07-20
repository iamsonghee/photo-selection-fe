"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RotateCcw, ChevronsUp, ChevronsDown } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelection } from "@/contexts/SelectionContext";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import {
  appendGalleryScrollQuery,
  buildFilterQueryString,
  COLOR_OPTIONS,
  GALLERY_FOCUS_PARAM,
  GALLERY_SCROLL_PARAM,
  getFilteredPhotos,
} from "@/lib/gallery-filter";
import type { GalleryFilterState } from "@/lib/gallery-filter";
import type { StarRating, ColorTag, SortOrder } from "@/types";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
type TabFilter = "all" | "selected";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "filename", label: "Sort: Filename" },
  { value: "oldest",   label: "Sort: Number"   },
  { value: "newest",   label: "Sort: Newest"   },
];

/** 그리드 레이아웃 상수 — 가상화된 행 높이·열 수 계산에 사용 */
const GRID_MIN_CELL   = 148;
const GRID_GAP        = 12;
const MOBILE_MAX_W    = 767;
const MOBILE_COLS     = 3;
const MOBILE_GAP      = 3;
const PRESIGN_BATCH_MAX = 100;
const PRESIGN_DEBOUNCE_MS = 80;
const PRESIGN_CACHE_MAX = 500;

type GridLayout = { cols: number; gap: number; rowHeight: number; overscan: number };
const DEFAULT_LAYOUT: GridLayout = { cols: 4, gap: GRID_GAP, rowHeight: GRID_MIN_CELL + GRID_GAP, overscan: 6 };

export default function GalleryPageClient() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = (params?.token as string) ?? "";

  const { project, photos, photoGroups, Y, N, toggle, selectedIds, photoStates, loading, updatePhotoState } = useSelection();
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  const [tabFilter,     setTabFilter]     = useState<TabFilter>("all");
  const [starFilter,    setStarFilter]    = useState<number>(0);
  const [colorFilter,   setColorFilter]   = useState<ColorTag[]>([]);
  const [sortOrder,     setSortOrder]     = useState<SortOrder>("filename");
  const [hoverStar,     setHoverStar]     = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);
  const [similarityToggleOn, setSimilarityToggleOn] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [jumpToValue, setJumpToValue] = useState("");

  // ── Presigned thumb 관리 ──────────────────────────────────────────────────
  const gridRef        = useRef<HTMLDivElement>(null);
  const pendingIdsRef  = useRef(new Set<string>()); // 이미 요청한 photoId
  const retryingIdsRef = useRef(new Set<string>()); // onError 재시도 중
  const [presignedUrls, setPresignedUrls] = useState(
    new Map<string, { url: string; expiresAt: number }>()
  );
  // 화면 밖으로 스크롤된 카드의 진행 중인 썸네일 다운로드를 실제로 취소하기 위한 동시성 큐.
  const [thumbQueue] = useState(() => createThumbLoadQueue(8));

  // ── 가상화 그리드 레이아웃 (열 수·행 높이는 컨테이너 폭 기준으로 JS에서 계산) ──
  const [layout, setLayout] = useState<GridLayout>(DEFAULT_LAYOUT);
  const [scrollMargin, setScrollMargin] = useState(0);

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
    const hasGsParam = gsRaw != null;
    // gf(포커스 사진 id)는 더 이상 프리로드에 쓰지 않지만, 뷰어가 계속 링크에 붙여
    // 보내므로 URL 정리 차원에서 존재 여부만 확인해 지운다.
    const hasGfParam = searchParams.get(GALLERY_FOCUS_PARAM) != null;

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

  /* ── AI 유사컷 그룹 ── */
  const groupsById = useMemo(() => {
    const map = new Map<string, (typeof photoGroups)[number]>();
    for (const g of photoGroups) map.set(g.id, g);
    return map;
  }, [photoGroups]);

  const membersByGroup = useMemo(() => {
    const map = new Map<string, typeof filteredPhotos>();
    for (const p of filteredPhotos) {
      if (!p.similarityGroupId) continue;
      const arr = map.get(p.similarityGroupId) ?? [];
      arr.push(p);
      map.set(p.similarityGroupId, arr);
    }
    return map;
  }, [filteredPhotos]);

  const showSimilarityToggle = project?.clipAnalysisStatus === "completed" && photoGroups.length > 0;

  /** 작가가 대표컷을 삭제한 직후 photoGroups가 아직 갱신되지 않은 경우(방어 폴백) 대비 —
   *  대표컷이 현재 photos 목록에 없는 그룹은 없는 것처럼 취급해 멤버가 전부 누락되는 걸 막는다. */
  const photoIdSet = useMemo(() => new Set(photos.map((p) => p.id)), [photos]);

  /* 토글 ON: 대표컷 + 미분류 사진만, 펼쳐진 그룹은 대표컷 바로 뒤에 나머지 인라인 삽입 */
  const displayPhotos = useMemo(() => {
    if (!similarityToggleOn) return filteredPhotos;
    const result: typeof filteredPhotos = [];
    for (const photo of filteredPhotos) {
      const groupId = photo.similarityGroupId;
      if (!groupId) { result.push(photo); continue; }
      const group = groupsById.get(groupId);
      if (!group || !photoIdSet.has(group.representativePhotoId)) { result.push(photo); continue; }
      if (photo.id !== group.representativePhotoId) continue;
      result.push(photo);
      if (expandedGroups.has(groupId)) {
        const members = membersByGroup.get(groupId) ?? [];
        result.push(...members.filter((p) => p.id !== group.representativePhotoId));
      }
    }
    return result;
  }, [filteredPhotos, similarityToggleOn, expandedGroups, groupsById, membersByGroup, photoIdSet]);

  const viewerQueryString = useMemo(() => buildFilterQueryString(filterState), [filterState]);

  // presigned URL 일괄 적용. 4,000장 갤러리를 끝까지 스크롤해도 Map이 무한히 커지지
  // 않도록 오래된 항목부터 정리한다 — pendingIdsRef도 같은 id를 같이 제거해야
  // range-fetch 이펙트가 스크롤로 돌아왔을 때 재요청을 계속 건너뛰지 않는다.
  const applyPresignedUrls = useCallback(
    (data: Record<string, { url: string; expiresAt: number }>) => {
      const evictedIds: string[] = [];
      setPresignedUrls((prev) => {
        const next = new Map(prev);
        for (const [id, info] of Object.entries(data)) next.set(id, info);
        while (next.size > PRESIGN_CACHE_MAX) {
          const oldestId = next.keys().next().value;
          if (oldestId === undefined) break;
          next.delete(oldestId);
          evictedIds.push(oldestId);
        }
        return next;
      });
      for (const id of evictedIds) pendingIdsRef.current.delete(id);
    },
    []
  );

  // presign-thumbs API 배치 호출 (최대 100장)
  const fetchPresignBatch = useCallback(
    async (ids: string[]) => {
      if (!token || ids.length === 0) return;
      try {
        const res = await fetch(
          `/api/c/presign-thumbs?token=${encodeURIComponent(token)}&photoIds=${ids.join(",")}`
        );
        if (!res.ok) { console.warn("[gallery] presign-thumbs", res.status); return; }
        const data = (await res.json()) as {
          presignedUrls: Record<string, { url: string; expiresAt: number }>;
        };
        applyPresignedUrls(data.presignedUrls ?? {});
      } catch (e) {
        console.warn("[gallery] presign batch error", e);
      }
    },
    [token, applyPresignedUrls]
  );

  // img onError → 해당 사진 1회만 재발급 (HEAD 요청 없음)
  const handleThumbError = useCallback(
    (photoId: string) => {
      if (retryingIdsRef.current.has(photoId)) return;
      retryingIdsRef.current.add(photoId);
      console.warn("[gallery] thumb error, re-presigning:", photoId);
      fetchPresignBatch([photoId]).finally(() => retryingIdsRef.current.delete(photoId));
    },
    [fetchPresignBatch]
  );

  // 컨테이너 폭 → 열 수·행 높이·overscan(화면 2.5개 분량) 계산.
  // 모바일(<=767px)은 CSS 미디어쿼리와 동일하게 3열 고정.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const update = () => {
      const isMobile = window.innerWidth <= MOBILE_MAX_W;
      const gap = isMobile ? MOBILE_GAP : GRID_GAP;
      const width = el.clientWidth;
      if (width <= 0) return;
      const cols = isMobile
        ? MOBILE_COLS
        : Math.max(1, Math.floor((width + gap) / (GRID_MIN_CELL + gap)));
      const cellSize = (width - gap * (cols - 1)) / cols;
      const rowHeight = Math.ceil(cellSize) + gap;
      const visibleRows = Math.max(1, Math.ceil(window.innerHeight / rowHeight));
      const overscan = Math.ceil(visibleRows * 2.5);
      setLayout((prev) =>
        prev.cols === cols && prev.rowHeight === rowHeight && prev.gap === gap && prev.overscan === overscan
          ? prev
          : { cols, gap, rowHeight, overscan }
      );
      const rect = el.getBoundingClientRect();
      setScrollMargin(rect.top + window.scrollY);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [loading]);

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

  const virtualRows = rowVirtualizer.getVirtualItems();
  const rangeKey = virtualRows.length > 0
    ? `${virtualRows[0].index}-${virtualRows[virtualRows.length - 1].index}-${layout.cols}`
    : "";

  // 현재 렌더 범위(visible + overscan)의 photoId만 모아 100장 단위로 presign.
  // 빠른 스크롤 중에는 range가 계속 바뀌므로 80ms 안정될 때까지 실제 fetch를 미룬다 —
  // 그사이 range가 또 바뀌면 cleanup에서 취소되어 스쳐 지나간 사진은 요청되지 않는다.
  useEffect(() => {
    if (loading || !token || virtualRows.length === 0) return;
    const startPhoto = virtualRows[0].index * layout.cols;
    const endPhoto = Math.min(
      (virtualRows[virtualRows.length - 1].index + 1) * layout.cols,
      displayPhotos.length
    );

    const timer = setTimeout(() => {
      const ids: string[] = [];
      for (let i = startPhoto; i < endPhoto; i++) {
        const photo = displayPhotos[i];
        if (!photo || pendingIdsRef.current.has(photo.id)) continue;
        pendingIdsRef.current.add(photo.id);
        ids.push(photo.id);
      }
      for (let i = 0; i < ids.length; i += PRESIGN_BATCH_MAX) {
        fetchPresignBatch(ids.slice(i, i + PRESIGN_BATCH_MAX));
      }
    }, PRESIGN_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, loading, token, displayPhotos, fetchPresignBatch]);

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
  const handleJumpToNumber = useCallback(() => {
    const n = Number(jumpToValue);
    if (!Number.isFinite(n)) return;
    scrollToPhotoIndex(n - 1, "center");
  }, [jumpToValue, scrollToPhotoIndex]);

  /* ── Handlers ── */
  const handleCheckClick = useCallback((e: React.MouseEvent, photoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(photoId);
  }, [toggle]);

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
        .gl-group-badge {
          position: absolute; bottom: 8px; right: 8px;
          min-width: 22px; height: 20px; padding: 0 6px;
          background: rgba(0,0,0,0.7); border: 1px solid #FF4D00;
          color: #FF4D00; font-family: 'Space Mono', monospace;
          font-size: 10px; font-weight: 700;
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

        .gl-similarity-toggle {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700; background: none; border: none;
          cursor: pointer; white-space: nowrap; font-family: inherit; padding: 8px 10px;
        }
        .gl-similarity-checkbox {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.35);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease;
        }
        .gl-similarity-toggle.gl-similarity-on .gl-similarity-checkbox {
          background: #FF4D00; border-color: #FF4D00;
        }

        .gl-jump-group {
          display: flex; align-items: center; gap: 4px; flex-shrink: 0;
        }
        .gl-jump-btn {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; padding: 0;
          background: none; border: 1px solid var(--border); color: var(--muted-foreground);
          cursor: pointer; transition: all 0.15s ease;
        }
        .gl-jump-btn:hover { color: var(--accent); border-color: var(--accent); }
        .gl-jump-input {
          width: 52px; height: 26px; padding: 0 6px;
          background: transparent; border: 1px solid var(--border); color: var(--foreground);
          font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 11px;
          outline: none; text-align: center;
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

          /* 그리드 — 열 수/간격은 JS에서 뷰포트 폭 기준으로 계산(가상화) */
          .gl-page-wrapper { padding-top: 104px !important; padding-bottom: 72px !important; }
          .gl-grid-main { padding: 0 6px !important; }
          .gl-jump-input { width: 44px !important; }

          /* 카드 오버레이 — 모바일 크기 축소 */
          .gl-card-overlay { padding: 6px !important; }
          .gl-card-overlay p { font-size: 7px !important; margin-bottom: 2px !important; }
          .gl-card-overlay .gl-overlay-interactive button { font-size: 8px !important; }
          .gl-card-overlay .gl-overlay-interactive span { width: 5px !important; height: 5px !important; }

          /* 체크박스 크기 */
          .gl-check-box { width: 18px !important; height: 18px !important; top: 6px !important; left: 6px !important; }
          .gl-quality-badge { width: 18px !important; height: 18px !important; top: 6px !important; right: 6px !important; }

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

                {showSimilarityToggle && (
                  <>
                    <div className="gl-filter-divider" style={{ width: 1, height: 16, background: "#222", margin: "0 8px", flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={() => setSimilarityToggleOn((v) => !v)}
                      className={`gl-similarity-toggle${similarityToggleOn ? " gl-similarity-on" : ""}`}
                      style={{ color: similarityToggleOn ? "#FF4D00" : "#555" }}
                    >
                      <span className="gl-similarity-checkbox">
                        {similarityToggleOn && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={5}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      유사컷 대표이미지 적용
                    </button>
                  </>
                )}
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

                <div className="gl-jump-group">
                  <button type="button" title="처음으로" aria-label="처음으로 이동" onClick={handleJumpToFirst} className="gl-jump-btn">
                    <ChevronsUp style={{ width: 14, height: 14 }} />
                  </button>
                  <button type="button" title="마지막으로" aria-label="마지막으로 이동" onClick={handleJumpToLast} className="gl-jump-btn">
                    <ChevronsDown style={{ width: 14, height: 14 }} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={displayPhotos.length}
                    placeholder="#"
                    value={jumpToValue}
                    onChange={(e) => setJumpToValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJumpToNumber()}
                    className="gl-jump-input"
                    aria-label="사진 번호로 이동"
                  />
                  <button type="button" title="이동" aria-label="입력한 번호로 이동" onClick={handleJumpToNumber} className="gl-jump-btn">
                    →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Gallery Grid (가상화: 화면 + overscan 범위만 실제 DOM에 렌더) ── */}
        <main className="gl-grid-main" style={{ position: "relative", zIndex: 10, maxWidth: 1800, margin: "0 auto", padding: "0 24px" }}>
          <div ref={gridRef} style={{ position: "relative", width: "100%", height: rowVirtualizer.getTotalSize() }}>
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
                const isRepresentative = !!group && group.representativePhotoId === photo.id;
                const restCount       = group ? group.photoCount - 1 : 0;
                const showGroupBadge  = similarityToggleOn && isRepresentative && restCount > 0;
                const presignedThumb  = presignedUrls.get(photo.id)?.url;

                cells.push(
                  <GalleryPhotoCard
                    key={photo.id}
                    token={token}
                    photo={photo}
                    selected={selected}
                    rating={rating}
                    colorTags={colorTags}
                    showGroupBadge={showGroupBadge}
                    groupId={group?.id}
                    restCount={restCount}
                    isGroupExpanded={!!group && expandedGroups.has(group.id)}
                    presignedThumb={presignedThumb}
                    thumbQueue={thumbQueue}
                    viewerQueryString={viewerQueryString}
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
                    height: vRow.size,
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
