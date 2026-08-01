"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { PrevNextButton } from "@/components/PrevNextButton";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import {
  parseFilterFromSearchParams,
  buildGalleryHrefWithFocus,
  getFilteredPhotos,
  getPhotoDisplayName,
} from "@/lib/gallery-filter";
import {
  buildGroupSelectionInfo,
  buildGroupsById,
  buildMembersByGroup,
  buildPhotoIdSet,
  filterToGroupFrontPhotos,
  getGroupFrontPhotoId,
} from "@/lib/photo-groups";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import {
  viewerImageBlockDownloadHandlers,
  viewerImageBlockDownloadStyle,
  viewerImageDownloadBlocked,
} from "@/lib/viewer-image-guard";
import type { StarRating, ColorTag } from "@/types";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";

const COLOR_OPTIONS: { key: ColorTag; color: string }[] = [
  { key: "red",    color: "#ef4444" },
  { key: "yellow", color: "#f97316" },
  { key: "green",  color: "#22c55e" },
  { key: "blue",   color: "#3b82f6" },
  { key: "purple", color: "#a855f7" },
];

const COMMENT_MAX_LENGTH = 150;

const MONO = "'JetBrains Mono', 'Space Mono', monospace";

const SELECT_BASE = {
  height: 40,
  padding: "0 18px",
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 7,
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer" as const,
  border: "1px solid",
  borderRadius: 8,
  transition: "all 0.15s",
  letterSpacing: "0.02em",
  flexShrink: 0,
};

const SELECT_ACTIVE = {
  background: "rgba(var(--accent-rgb), 0.12)",
  color: "var(--accent)",
  borderColor: "rgba(var(--accent-rgb), 0.45)",
} as const;

const SELECT_INACTIVE = {
  background: "var(--accent)",
  color: "#000",
  borderColor: "var(--accent)",
} as const;

const SELECT_BASE_MOBILE = {
  ...SELECT_BASE,
  height: 36,
  padding: "0 14px",
  fontSize: 12,
};

function getObjectFitContainOffset(
  containerW: number, containerH: number,
  naturalW: number, naturalH: number
) {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0)
    return { left: 0, top: 0 };
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  return {
    left: (containerW - naturalW * scale) / 2,
    top: (containerH - naturalH * scale) / 2,
  };
}

function ViewerPhotoWithBadge({ src, alt, showBadge }: { src: string; alt: string; showBadge: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [badgeOffset, setBadgeOffset] = useState({ left: 5, top: 5 });

  const measureBadge = useCallback(() => {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const nw = img?.naturalWidth ?? 0;
    const nh = img?.naturalHeight ?? 0;
    if (nw <= 0 || nh <= 0) { setBadgeOffset({ left: 5, top: 5 }); return; }
    const { left, top } = getObjectFitContainOffset(cw, ch, nw, nh);
    setBadgeOffset({ left: left + 5, top: top + 5 });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measureBadge);
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => measureBadge());
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [measureBadge, src]);

  useEffect(() => {
    const onResize = () => measureBadge();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureBadge]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}
      onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}>
      <img ref={imgRef} src={src} alt={alt} onLoad={measureBadge}
        {...viewerImageBlockDownloadHandlers}
        style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block", ...viewerImageBlockDownloadStyle }}
      />
      {showBadge && (
        <div className="pointer-events-none absolute z-[3] flex items-center justify-center rounded-full"
          style={{ left: badgeOffset.left, top: badgeOffset.top, width: 20, height: 20, background: "var(--accent)", border: "2px solid white", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} aria-hidden>
          <Check style={{ width: 10, height: 10, color: "white" }} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (params?.token as string) ?? "";
  const photoId = (params?.photoId as string) ?? "";
  const { project, photos: contextPhotos, photoGroups, selectedIds, Y, toggle, photoStates, updatePhotoState, toggleColor, saveError, clearSaveError } = useSelection();

  // 로컬 state로 현재 사진 관리 — router.push 없이 전환해 컴포넌트 재마운트 방지
  const [activePhotoId, setActivePhotoId] = useState(photoId);

  // 외부에서 URL이 바뀔 때(갤러리→뷰어 첫 진입, 브라우저 앞/뒤) 동기화
  useEffect(() => { setActivePhotoId(photoId); }, [photoId]);

  // 갤러리로 돌아갔을 때 스크롤 위치를 이 사진 기준으로 복원할 수 있도록, 필름스트립/화살표로
  // 넘길 때마다(navigateTo는 history.replaceState라 URL의 gf만으로는 부족) 매번 최신값을 기록해둔다.
  useEffect(() => {
    if (!token || !activePhotoId) return;
    try {
      sessionStorage.setItem(`ps:c-gallery-focus:${token}`, activePhotoId);
    } catch {
      /* ignore */
    }
  }, [token, activePhotoId]);

  const filterState = useMemo(() => parseFilterFromSearchParams(searchParams), [searchParams]);
  const filteredPhotosRaw = useMemo(
    () => getFilteredPhotos(contextPhotos ?? [], selectedIds, photoStates, filterState),
    [contextPhotos, selectedIds, photoStates, filterState]
  );

  /* ── AI 유사컷 그룹: 갤러리의 "유사컷 묶어보기" 토글이 ?grouped=1로 전달되면
   *  표지(front) 사진 단위로만 이동(그룹 skip)하고, 나머지 멤버는 힌트→펼침으로만 보여준다. */
  const narrowingFilterActive = filterState.nameFilter.trim().length > 0 || filterState.qualityFilter.length > 0;
  const groupingActive = filterState.groupedView && !narrowingFilterActive;
  const groupsById = useMemo(() => buildGroupsById(photoGroups), [photoGroups]);
  const photoIdSet = useMemo(() => buildPhotoIdSet(contextPhotos ?? []), [contextPhotos]);
  const membersByGroup = useMemo(() => buildMembersByGroup(filteredPhotosRaw), [filteredPhotosRaw]);
  /** 그룹별 셀렉 수/단일 셀렉 id를 selectedIds가 바뀔 때 한 번만 파생 — 갤러리와 동일한 패턴 */
  const groupSelectionInfo = useMemo(
    () => buildGroupSelectionInfo(membersByGroup, selectedIds),
    [membersByGroup, selectedIds]
  );
  const filteredPhotos = useMemo(
    () =>
      groupingActive
        ? filterToGroupFrontPhotos(filteredPhotosRaw, groupsById, photoIdSet, groupSelectionInfo)
        : filteredPhotosRaw,
    [filteredPhotosRaw, groupingActive, groupsById, photoIdSet, groupSelectionInfo]
  );

  const currentIndex = filteredPhotos.findIndex((p) => p.id === activePhotoId);
  const current = currentIndex >= 0
    ? filteredPhotos[currentIndex]
    : (contextPhotos ?? []).find((p) => p.id === activePhotoId) ?? null;

  /** 그룹 펼침 상태(힌트 pill/PC 미니 스트립/모바일 바텀시트 공용).
   *  groupId별로 "마지막 펼침 여부"를 기억한다(그룹핑이 켜져 있는 동안 세션 내내 유지) —
   *  최초로 그 그룹에 진입할 때만 "지금 보는 사진이 표지가 아니면 1회 자동으로 편다"를 판단하고,
   *  이후로는(다른 그룹/미소속 사진에 갔다 돌아와도) 사용자의 마지막 의도(수동 조작이든 최초
   *  자동판단 결과든)를 그대로 유지한다 — 셀렉/표지 변경이 펼침 상태에 영향을 주면 안 되기 때문.
   *  그룹핑 토글을 껐다 다시 켜면 전부 초기화되어 "새 진입"으로 취급된다. */
  const groupExpandStateRef = useRef<Map<string, boolean>>(new Map());
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  /** 사용자가 펼치기/접기 버튼을 직접 눌렀을 때 쓰는 공용 setter — 상태(expandedGroupId)뿐 아니라
   *  groupExpandStateRef에도 기록해야 재진입 시 이 선택이 유지된다. */
  const setGroupExpanded = useCallback((groupId: string, expand: boolean) => {
    groupExpandStateRef.current.set(groupId, expand);
    setExpandedGroupId(expand ? groupId : null);
  }, []);

  useEffect(() => {
    if (!current || !groupingActive) {
      setExpandedGroupId(null);
      groupExpandStateRef.current = new Map(); // 그룹핑을 껐다 켜면 모든 그룹을 "새 진입"으로 취급
      return;
    }
    const groupId = current.similarityGroupId ?? null;
    if (!groupId) {
      setExpandedGroupId((prev) => (prev !== null ? null : prev));
      return;
    }
    if (groupExpandStateRef.current.has(groupId)) {
      // 이미 방문한 적 있는 그룹 — 마지막 상태(수동 조작이든 최초 자동판단 결과든) 그대로 적용,
      // 다시 판단하지 않는다(셀렉/표지 변경으로 인한 재평가 차단).
      setExpandedGroupId(groupExpandStateRef.current.get(groupId) ? groupId : null);
      return;
    }
    // 이 그룹에 처음 진입 — 지금 보는 사진이 표지가 아니면 1회만 자동으로 편다.
    const group = groupsById.get(groupId);
    const info = groupSelectionInfo.get(groupId);
    const shouldExpand = !!group && getGroupFrontPhotoId(group, info) !== current.id;
    groupExpandStateRef.current.set(groupId, shouldExpand);
    setExpandedGroupId(shouldExpand ? groupId : null);
  }, [current, groupingActive, groupsById, groupSelectionInfo]);

  /** prev/next 기준 인덱스 — 앞자리가 아닌 멤버를 미리보기 중이면(filteredPhotos엔 앞자리만 있어
   *  currentIndex가 -1) 그 그룹 앞자리 사진의 위치를 앵커로 사용해 "다음/이전"이 항상 그룹 단위로
   *  동작한다(앞자리는 대표컷이거나, 그룹 내 셀렉이 정확히 1장이면 그 셀렉된 사진). */
  const navAnchorIndex = useMemo(() => {
    if (currentIndex >= 0) return currentIndex;
    if (!current || !groupingActive) return currentIndex;
    const groupId = current.similarityGroupId;
    const group = groupId ? groupsById.get(groupId) : undefined;
    if (!group) return currentIndex;
    const frontId = getGroupFrontPhotoId(group, groupId ? groupSelectionInfo.get(groupId) : undefined);
    if (!photoIdSet.has(frontId)) return currentIndex;
    return filteredPhotos.findIndex((p) => p.id === frontId);
  }, [currentIndex, current, groupingActive, groupsById, photoIdSet, filteredPhotos, groupSelectionInfo]);

  const currentGroupId = current?.similarityGroupId ?? null;
  const currentGroup = currentGroupId ? groupsById.get(currentGroupId) : undefined;
  const showGroupHint = groupingActive && !!currentGroup && currentGroup.photoCount > 1;

  const star  = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color  : undefined;

  const [presignedPreviewUrl, setPresignedPreviewUrl] = useState<string | null>(null);

  // activePhotoId 변경마다 preview presigned URL 발급
  useEffect(() => {
    if (!token || !activePhotoId) return;
    setPresignedPreviewUrl(null);
    let cancelled = false;
    fetch(`/api/c/presign-preview?token=${encodeURIComponent(token)}&photoId=${activePhotoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { url: string; expiresAt: number } | null) => {
        if (!cancelled && data?.url) setPresignedPreviewUrl(data.url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, activePhotoId]);

  const [hoverStar,      setHoverStar]      = useState(0);
  const [starPressRing,  setStarPressRing]  = useState<number | null>(null);
  const [colorPressRing, setColorPressRing] = useState<ColorTag | null>(null);
  const [draftComment,   setDraftComment]   = useState("");
  const [isCommentEditing, setIsCommentEditing] = useState(false);
  const [showShortcuts,  setShowShortcuts]  = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);

  const N = project?.requiredCount ?? 0;
  const canConfirm  = N > 0 && Y === N;
  const progressPct = N > 0 ? Math.min(Math.round((Y / N) * 100), 100) : 0;
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

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
      window.location.href = `/c/${token}/confirmed`;
    } catch (e) {
      console.error(e);
      setConfirming(false);
      setConfirmError("네트워크 오류가 발생했습니다");
    }
  }, [project?.id, token, selectedIds]);

  const filmstripRef     = useRef<HTMLDivElement>(null);
  const filmstripSeenRef = useRef(false); // 마운트 후 첫 실행 여부 추적

  useEffect(() => {
    const container = filmstripRef.current;
    if (!container) return;
    const THUMB_W = 150;
    const GAP     = 16;
    const step    = THUMB_W + GAP;
    // 비대표 멤버를 미리보기 중이면 메인 필름스트립엔 없으므로(navAnchorIndex) 그룹 대표컷 위치로 스크롤
    const anchor  = navAnchorIndex >= 0 ? navAnchorIndex : 0;
    const target  = anchor * step - container.clientWidth / 2 + THUMB_W / 2;
    // 첫 마운트(갤러리→뷰어 진입)는 instant, 이후 사진 전환은 smooth
    const behavior = filmstripSeenRef.current ? "smooth" : "instant";
    filmstripSeenRef.current = true;
    container.scrollTo({ left: Math.max(0, target), behavior });
  }, [navAnchorIndex]);

  useEffect(() => {
    // Do not overwrite text currently being composed, but do reflect the
    // latest server state from another customer tab once editing ends.
    if (current?.id && !isCommentEditing) {
      setDraftComment(photoStates[current.id]?.comment ?? "");
    }
  }, [current?.id, photoStates, isCommentEditing]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setStar = useCallback((s: StarRating) => {
    if (!current) return;
    const raw = photoStates[current.id]?.rating;
    const cur = raw != null ? (Number(raw) as StarRating) : undefined;
    updatePhotoState(current.id, { rating: cur === s ? undefined : s });
    setHoverStar(0);
    window.setTimeout(() => setHoverStar(0), 0);
  }, [current, photoStates, updatePhotoState]);

  const setColor = useCallback((c: ColorTag) => {
    if (!current) return;
    toggleColor(current.id, c);
  }, [current, toggleColor]);

  const saveComment = useCallback(() => {
    if (!current) return;
    const trimmed = draftComment.trim();
    if (trimmed === (photoStates[current.id]?.comment ?? "")) return;
    updatePhotoState(current.id, { comment: trimmed });
  }, [current, draftComment, photoStates, updatePhotoState]);

  const toggleSelect = useCallback(() => { if (current) toggle(current.id); }, [current, toggle]);

  // ── Navigation ───────────────────────────────────────────────────────────

  // router.push 대신 history.replaceState 사용 → 컴포넌트 재마운트 없이 URL만 갱신
  const navigateTo = useCallback((id: string) => {
    setActivePhotoId(id);
    window.history.replaceState(null, "", `/c/${token}/viewer/${id}${queryString}`);
  }, [token, queryString]);

  // 그룹핑 활성 시 filteredPhotos엔 대표컷만 남아있어, navAnchorIndex 기준 이동은 자동으로 그룹을 건너뛴다.
  const goPrev = useCallback(() => {
    if (navAnchorIndex <= 0) return;
    navigateTo(filteredPhotos[navAnchorIndex - 1].id);
  }, [navAnchorIndex, filteredPhotos, navigateTo]);

  const goNext = useCallback(() => {
    if (navAnchorIndex < 0 || navAnchorIndex >= filteredPhotos.length - 1) return;
    navigateTo(filteredPhotos[navAnchorIndex + 1].id);
  }, [navAnchorIndex, filteredPhotos, navigateTo]);

  // 그룹핑 활성 시에는 대표컷 경계에서 멈춰야 하므로(순간이동 wrap 금지) goPrev/goNext에 위임한다.
  // 그룹핑 비활성(기존 낱장 순회) 상태의 wrap 동작은 이번 기능과 무관한 기존 동작이라 그대로 유지한다.
  const goPrevWrap = useCallback(() => {
    if (groupingActive) { goPrev(); return; }
    if (!filteredPhotos.length) return;
    const anchor = navAnchorIndex >= 0 ? navAnchorIndex : 0;
    navigateTo(filteredPhotos[(anchor - 1 + filteredPhotos.length) % filteredPhotos.length].id);
  }, [groupingActive, goPrev, navAnchorIndex, filteredPhotos, navigateTo]);

  const goNextWrap = useCallback(() => {
    if (groupingActive) { goNext(); return; }
    if (!filteredPhotos.length) return;
    const anchor = navAnchorIndex >= 0 ? navAnchorIndex : 0;
    navigateTo(filteredPhotos[(anchor + 1) % filteredPhotos.length].id);
  }, [groupingActive, goNext, navAnchorIndex, filteredPhotos, navigateTo]);

  // ── Touch swipe ───────────────────────────────────────────────────────────

  const touchStartXRef      = useRef(0);
  const mobileImageZoomedRef = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mobileImageZoomedRef.current) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNextWrap() : goPrevWrap(); }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (showConfirmModal) {
      if (e.key === "Escape" && !confirming) setShowConfirmModal(false);
      return;
    }
    if (e.key === "?" || (e.shiftKey && e.key === "/")) { setShowShortcuts(s => !s); return; }
    if (e.key === "Escape") {
      router.push(buildGalleryHrefWithFocus(token, searchParams, activePhotoId));
      return;
    }
    switch (e.code) {
      case "Digit1": setStar(1); setStarPressRing(1); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit2": setStar(2); setStarPressRing(2); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit3": setStar(3); setStarPressRing(3); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit4": setStar(4); setStarPressRing(4); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit5": setStar(5); setStarPressRing(5); setTimeout(() => setStarPressRing(null), 200); break;
      case "KeyQ": setColor("red");    setColorPressRing("red");    setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyW": setColor("yellow"); setColorPressRing("yellow"); setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyE": setColor("green");  setColorPressRing("green");  setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyR": setColor("blue");   setColorPressRing("blue");   setTimeout(() => setColorPressRing(null), 200); break;
      case "KeyT": setColor("purple"); setColorPressRing("purple"); setTimeout(() => setColorPressRing(null), 200); break;
      case "ArrowLeft":  e.preventDefault(); goPrevWrap(); break;
      case "ArrowRight": e.preventDefault(); goNextWrap(); break;
    }
  }, [setStar, setColor, goPrevWrap, goNextWrap, showConfirmModal, confirming, router, token, searchParams, activePhotoId]);

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (showConfirmModal) return;
      // keyup은 브라우저가 repeat을 설정하지 않지만(누르고 있는 동안은 keydown만 반복),
      // 방어적으로 가드를 남겨둔다 — 실제 겹친 요청 방지는 SelectionContext의
      // photoId별 저장 큐(flushSelection)가 담당한다.
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); e.stopPropagation(); toggleSelect(); }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, toggleSelect, showConfirmModal]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed" || project.status === "editing") router.replace(`/c/${token}/locked`);
  }, [project?.status, project, token, router]);

  if (!project) return null;
  if (!current) {
    const galleryHref = buildGalleryHrefWithFocus(token, searchParams, activePhotoId);
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-white">
        <div>
          <h1 className="text-lg font-bold">사진을 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-white/65">사진이 삭제되었거나 올바르지 않은 주소입니다.</p>
          <Link href={galleryHref} className="mt-6 inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-black">
            갤러리로 돌아가기
          </Link>
        </div>
      </main>
    );
  }
  if (project.status === "confirmed" || project.status === "editing") return null;

  const displayRating      = hoverStar || star || 0;
  const isCurrentSelected  = selectedIds.has(current.id);
  const filename           = getPhotoDisplayName(current);
  // presigned preview 우선, 발급 전에는 공개 URL 폴백 (Phase B: R2 public 유지)
  const viewerSrc = presignedPreviewUrl ?? viewerImageUrl(current);
  // photoId(라우트 파라미터)는 최초 진입 사진 id에 고정돼 있음(navigateTo가 history.replaceState만
  // 사용) — 필름스트립/화살표로 다른 사진을 보다가 닫으면 activePhotoId를 써야 실제로 보던 사진으로 돌아간다.
  const galleryHref        = buildGalleryHrefWithFocus(token, searchParams, activePhotoId);

  return (
    <div
      style={{ background: "#000", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;900&family=Space+Mono:wght@400;700&display=swap');

        .fs-grid-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.15;
          background-image: linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .fs-hud {
          background: rgba(10, 11, 13, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .fs-nav-btn {
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          border: 1px solid var(--border-subtle);
          color: var(--foreground);
          transition: all 0.2s ease;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .fs-nav-btn:hover { background: var(--accent); color: black; border-color: var(--accent); }
        .fs-nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .fs-nav-btn:disabled:hover { background: rgba(0,0,0,0.4); color: var(--foreground); border-color: var(--border-subtle); }
        .fs-thumb {
          height: 100px; width: 150px; flex-shrink: 0;
          border: 1px solid var(--border-subtle);
          filter: grayscale(1); opacity: 0.5;
          transition: all 0.3s ease; cursor: pointer; position: relative; overflow: hidden;
        }
        .fs-thumb.active {
          filter: grayscale(0); opacity: 1;
          border-color: var(--accent); transform: scale(1.05); z-index: 5;
        }
        .fs-thumb:not(.active):hover { opacity: 0.75; filter: grayscale(0.4); }
        .fs-hide-scrollbar::-webkit-scrollbar { display: none; }
        .fs-hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .fs-comment-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          outline: none; font-size: 13px; color: var(--foreground);
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .fs-comment-input::placeholder { color: var(--placeholder-foreground); }
        .fs-comment-input:focus { border-color: rgba(var(--accent-rgb), 0.4); }
        .fs-star { cursor: pointer; transition: transform 0.1s; }
        .fs-star:hover { transform: scale(1.2); }

        /* ── 유사컷 그룹 힌트/펼침 (PC) ── */
        .fs-group-hint {
          display: flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 12px; flex-shrink: 0;
          background: rgba(0,0,0,0.4); border: 1px solid #FF4D00; color: #FF4D00;
          font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 11px; font-weight: 700;
          cursor: pointer; transition: all 0.15s ease;
        }
        .fs-group-hint:hover { background: #FF4D00; color: #000; }
        .fs-mini-strip-wrap {
          flex-shrink: 0; background: rgba(255,77,0,0.06);
          border-top: 1px solid rgba(255,77,0,0.25); border-bottom: 1px solid rgba(255,77,0,0.25);
          padding: 10px 28px;
        }
        .fs-mini-strip-label {
          font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 10px;
          color: #FF4D00; letter-spacing: 0.06em; margin-bottom: 8px;
        }
        .fs-mini-strip { display: flex; gap: 10px; overflow-x: auto; }
        .fs-mini-thumb {
          height: 64px; width: 96px; flex-shrink: 0; position: relative;
          border: 1px solid var(--border-subtle); cursor: pointer; overflow: hidden;
          filter: grayscale(1); opacity: 0.6; transition: all 0.2s ease;
        }
        .fs-mini-thumb:hover { opacity: 0.85; filter: grayscale(0.3); }
        .fs-mini-thumb.active { filter: grayscale(0); opacity: 1; border-color: var(--accent); }
        .fs-mini-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        /* 메인 필름스트립: 펼쳐진 그룹의 표지(front) 사진에 오렌지 링(.active의 border/transform과 레이어 분리) */
        .fs-thumb.group-expanded { box-shadow: 0 0 0 2px #FF4D00; }
      `}</style>

      {/* Grid background */}
      <div className="fs-grid-bg" />

      {/* ════ DESKTOP (md+) ════ */}
      <div className="hidden md:flex flex-col" style={{ height: "100vh" }}>

        {/* Header HUD bar */}
        <header style={{
          flexShrink: 0, zIndex: 40,
          background: "rgba(10, 11, 13, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
            padding: "16px 28px", width: "100%", minHeight: 64,
          }}>
            {/* Back link */}
            <Link href={galleryHref} scroll={false} title="갤러리로"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, color: "var(--subtle-foreground)", textDecoration: "none", flexShrink: 0, transition: "color 0.15s", borderRadius: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle-foreground)")}>
              <X style={{ width: 18, height: 18 }} strokeWidth={2} />
            </Link>

            {/* Divider */}
            <div style={{ width: 1, height: 36, background: "var(--border)", flexShrink: 0 }} />

            {/* 사진 정보만 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1, justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, background: "var(--accent)", flexShrink: 0 }} />
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--foreground)",
                  lineHeight: 1.25,
                }}>
                  {filename}
                </h2>
              </div>
              <p style={{
                fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
                fontSize: 11,
                color: "var(--muted-foreground)",
                letterSpacing: "0.06em",
                margin: 0,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {project?.name ?? "PROJECT"}
              </p>
            </div>
          </div>
        </header>

        {/* Main image area */}
        <main style={{ flex: 1, height: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 10, overflow: "hidden" }}>

          <PrevNextButton
            direction="prev"
            onClick={goPrev}
            disabled={navAnchorIndex <= 0}
            size="lg"
            align="edge"
            style={{ zIndex: 20 }}
          />
          <PrevNextButton
            direction="next"
            onClick={goNext}
            disabled={navAnchorIndex < 0 || navAnchorIndex === filteredPhotos.length - 1}
            size="lg"
            align="edge"
            style={{ zIndex: 20 }}
          />

          {/* Image frame */}
          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}
            onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}>
            {viewerSrc ? (
              <img
                src={viewerSrc}
                alt={filename}
                {...viewerImageBlockDownloadHandlers}
                style={{
                  maxHeight: "100%",
                  maxWidth: "calc(100vw - 140px)",
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                  boxShadow: "0 25px 50px rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  ...viewerImageBlockDownloadStyle,
                }}
              />
            ) : (
              <div style={{ color: "var(--muted-foreground)", padding: 16 }}>사진 없음</div>
            )}
            {/* 필름스트립과 동일: 선택 시 좌상단 오렌지 체크 */}
            {isCurrentSelected && viewerSrc ? (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 22,
                  height: 22,
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 12,
                  pointerEvents: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                }}
                aria-hidden
              >
                <Check style={{ width: 12, height: 12, color: "#000" }} strokeWidth={3} />
              </div>
            ) : null}
            {/* EXIF decorative */}
            <div style={{
              position: "absolute", bottom: -28, left: 0,
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9,
              textTransform: "uppercase", letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap",
              pointerEvents: "none",
            }}>
              {filename}
            </div>
          </div>
        </main>

        {/* 별·라벨·메모·선택 — 메인 이미지와 필름스트립 사이 */}
        <section
          className="fs-hud"
          style={{
            flexShrink: 0,
            zIndex: 35,
            borderTop: "1px solid #1A1A1A",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "14px 28px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, padding: "4px 0" }}>
                {([1, 2, 3, 4, 5] as const).map((s) => {
                  const filled = s <= displayRating;
                  return (
                    <span
                      key={s}
                      className="fs-star"
                      onClick={() => setStar(s)}
                      onMouseEnter={() => setHoverStar(s)}
                      onMouseLeave={() => setHoverStar(0)}
                      style={{
                        fontSize: 20,
                        lineHeight: 1,
                        userSelect: "none",
                        color: filled ? "var(--accent)" : "var(--border-strong)",
                        transform: starPressRing === s ? "scale(1.2)" : undefined,
                      }}
                    >
                      {filled ? "★" : "☆"}
                    </span>
                  );
                })}
              </div>
              <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {COLOR_OPTIONS.map((opt) => {
                  const isActive = color?.includes(opt.key) ?? false;
                  const showRing = isActive || colorPressRing === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      title={opt.key}
                      onClick={() => setColor(opt.key)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: opt.color,
                        cursor: "pointer",
                        border: showRing ? "2px solid white" : "2px solid rgba(0,0,0,0.35)",
                        boxShadow: showRing ? "0 0 0 2px rgba(255,255,255,0.2)" : "none",
                        flexShrink: 0,
                        position: "relative",
                        transition: "transform 0.1s",
                      }}
                    >
                      {isActive && (
                        <Check
                          style={{ position: "absolute", inset: 0, margin: "auto", width: 10, height: 10, color: "white" }}
                          strokeWidth={3}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {showGroupHint && currentGroup && (
                <>
                  <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
                  <button
                    type="button"
                    className="fs-group-hint"
                    onClick={() => setGroupExpanded(currentGroup.id, expandedGroupId !== currentGroup.id)}
                  >
                    ◧ 유사컷 {currentGroup.photoCount - 1}장 {expandedGroupId === currentGroup.id ? "접기 ▴" : "▾"}
                  </button>
                </>
              )}
            </div>

            <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <input
                type="text"
                className="fs-comment-input"
                value={draftComment}
                onFocus={() => { setIsCommentEditing(true); clearSaveError(); }}
                onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                onBlur={() => { setIsCommentEditing(false); saveComment(); }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="코멘트..."
                style={{ flex: 1, padding: "0 14px", height: 38, borderRadius: 8, minWidth: 0 }}
              />
              {saveError && <p role="alert" className="mt-1 text-xs text-red-400">{saveError}</p>}
            </div>

            <button
              type="button"
              onClick={toggleSelect}
              style={{
                ...SELECT_BASE,
                ...(isCurrentSelected ? SELECT_ACTIVE : SELECT_INACTIVE),
              }}
            >
              <Check style={{ width: 14, height: 14 }} strokeWidth={3} />
              <span>{isCurrentSelected ? `선택됨 ${Y}/${N}` : "선택"}</span>
            </button>
          </div>
        </section>

        {/* 유사컷 미니 스트립 (PC 펼침) */}
        {groupingActive && expandedGroupId && (
          <div className="fs-mini-strip-wrap">
            <div className="fs-mini-strip-label">
              이 그룹의 유사컷 ({(membersByGroup.get(expandedGroupId) ?? []).length}장)
            </div>
            <div className="fs-mini-strip">
              {(membersByGroup.get(expandedGroupId) ?? []).map((member) => {
                const isMemberActive = member.id === current.id;
                const isMemberSelected = selectedIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className={`fs-mini-thumb${isMemberActive ? " active" : ""}`}
                    onClick={() => navigateTo(member.id)}
                  >
                    <img src={member.url} alt={getPhotoDisplayName(member)} loading="lazy" decoding="async" />
                    {isMemberSelected && (
                      <div style={{
                        position: "absolute", top: 4, left: 4, width: 14, height: 14,
                        background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check style={{ width: 8, height: 8, color: "black" }} strokeWidth={4} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filmstrip footer */}
        <footer style={{
          height: 160, background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.08)",
          zIndex: 30, display: "flex", alignItems: "center", padding: "0 32px",
          position: "relative", flexShrink: 0,
        }}>
          <div
            ref={filmstripRef}
            className="fs-hide-scrollbar"
            style={{ display: "flex", gap: 16, overflowX: "auto", width: "100%", padding: "16px 0", alignItems: "center" }}
          >
            {filteredPhotos.map((photo, i) => {
              const isActive  = i === navAnchorIndex;
              const thumbSrc  = photo.url; // r2_thumb_url — 필름스트립은 썸네일로 충분
              const thumbName = getPhotoDisplayName(photo);
              const isSelected = selectedIds.has(photo.id);
              const photoGroup = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
              const showExpandRing = groupingActive && !!photoGroup && expandedGroupId === photoGroup.id;
              return (
                <div
                  key={photo.id}
                  className={`fs-thumb${isActive ? " active" : ""}${showExpandRing ? " group-expanded" : ""}`}
                  onClick={() => navigateTo(photo.id)}
                >
                  <img
                    src={thumbSrc}
                    alt={thumbName}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <span style={{
                    position: "absolute", bottom: 4, right: 4,
                    fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 8,
                    background: "rgba(0,0,0,0.8)", padding: "0 4px", color: "var(--foreground)",
                  }}>
                    {String(i + 1).padStart(3, "0")}
                  </span>
                  {isSelected && (
                    <div style={{
                      position: "absolute", top: 4, left: 4, width: 14, height: 14,
                      background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check style={{ width: 8, height: 8, color: "black" }} strokeWidth={4} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Decorative lat/lng */}
          <div style={{
            position: "absolute", bottom: 8, right: 24,
            opacity: 0.3, pointerEvents: "none",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 7, textAlign: "right", color: "white" }}>
              <p style={{ margin: 0 }}>37.5665° N</p>
              <p style={{ margin: 0 }}>126.9780° E</p>
            </div>
            <div style={{ width: 16, height: 16, border: "1px solid rgba(255,255,255,0.2)" }} />
          </div>
        </footer>

        {/* Selection footer (show on complete OR over-select, like gallery) */}
        <div
          style={{
            maxHeight: N > 0 && Y >= N ? 88 : 0,
            overflow: "hidden",
            transition: "max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            flexShrink: 0,
          }}
          aria-hidden={!(N > 0 && Y >= N)}
        >
          <SelectionConfirmFooter
            Y={Y}
            N={N}
            position="static"
            disabled={!canConfirm}
            onConfirm={() => setShowConfirmModal(true)}
            zIndex={50}
          />
        </div>
      </div>

      {/* ════ MOBILE (<md): fullscreen stack ════ */}
      <div className="md:hidden fixed inset-0 flex flex-col" style={{ background: "#030303" }}>

        {/* Topbar */}
        <div style={{
          background: "rgba(0,0,0,0.78)", backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0, zIndex: 20,
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}>
          <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 16px" }}>
            <Link href={galleryHref} scroll={false}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 10, color: "var(--foreground)", fontSize: 14, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
              ← 갤러리
            </Link>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
              {filename}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", color: "var(--accent)", flexShrink: 0 }}>
              {(navAnchorIndex >= 0 ? navAnchorIndex : 0) + 1} / {filteredPhotos.length}
            </span>
          </div>
        </div>

        {/* Image */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, minWidth: 0 }}>
          {viewerSrc
            ? (
              <MobileViewerPinchPhoto
                src={viewerSrc}
                alt={filename}
                showBadge={isCurrentSelected}
                onZoomStateChange={(z) => { mobileImageZoomedRef.current = z; }}
              />
            )
            : <div style={{ color: "var(--muted-foreground)", padding: 16 }}>사진 없음</div>
          }
          <PrevNextButton direction="prev" onClick={goPrevWrap} disabled={groupingActive && navAnchorIndex <= 0} size="sm" />
          <PrevNextButton direction="next" onClick={goNextWrap} disabled={groupingActive && (navAnchorIndex < 0 || navAnchorIndex === filteredPhotos.length - 1)} size="sm" />

          {showGroupHint && currentGroup && (
            <button
              type="button"
              onClick={() => setGroupExpanded(currentGroup.id, expandedGroupId !== currentGroup.id)}
              style={{
                position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                display: "flex", alignItems: "center", gap: 6,
                height: 30, padding: "0 14px", zIndex: 15,
                background: "rgba(0,0,0,0.7)",
                border: "1px solid #FF4D00",
                color: "#FF4D00",
                fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ◧ 유사컷 {currentGroup.photoCount - 1}장 {expandedGroupId === currentGroup.id ? "닫기 ✕" : "▾"}
            </button>
          )}

          {/* 시트가 열려 있는 동안 이미지 영역만 시각적으로 딤 처리(하단 액션바는 가리지 않음) */}
          {groupingActive && expandedGroupId && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "none", zIndex: 10 }} />
          )}
        </div>

        {/* 유사컷 바텀시트 (모바일 펼침) — 문서 흐름 안의 일반 flex 자식으로 배치해 하단 액션바(별점/코멘트) 위를
         *  덮지 않고 그 위에 별도 패널로 쌓인다(예전엔 position:fixed 오버레이였는데, 뷰포트 전체를 덮어 액션바를
         *  가려버리는 문제가 있었음). 스와이프/이전·다음 버튼은 이 패널 밖(이미지 영역)에 있으므로 계속 동작한다. */}
        {groupingActive && expandedGroupId && current && (
          <div
            style={{
              flexShrink: 0, zIndex: 25, background: "rgba(10,10,11,0.97)", backdropFilter: "blur(12px)",
              borderTop: "1px solid #FF4D00", maxHeight: "34vh", overflow: "hidden",
              padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#FF4D00", letterSpacing: "0.06em" }}>
                이 사진과 유사한 사진 ({(membersByGroup.get(expandedGroupId) ?? []).length}장)
              </span>
              {currentGroup && (
                <button
                  type="button"
                  onClick={() => setGroupExpanded(currentGroup.id, false)}
                  style={{ background: "none", border: "none", color: "var(--muted-foreground)", padding: 4, cursor: "pointer" }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {(membersByGroup.get(expandedGroupId) ?? []).map((member) => {
                const isMemberActive = member.id === current.id;
                const isMemberSelected = selectedIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    onClick={() => navigateTo(member.id)}
                    style={{
                      position: "relative", width: 88, height: 66, flexShrink: 0, overflow: "hidden",
                      border: isMemberActive ? "2px solid var(--accent)" : "1px solid rgba(255,255,255,0.15)",
                      opacity: isMemberActive ? 1 : 0.75,
                    }}
                  >
                    <img
                      src={member.url}
                      alt={getPhotoDisplayName(member)}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {isMemberSelected && (
                      <div style={{
                        position: "absolute", top: 2, right: 2, width: 14, height: 14,
                        background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check style={{ width: 8, height: 8, color: "black" }} strokeWidth={4} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom action bar */}
        <div style={{
          background: "rgba(10,10,11,0.96)", backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* Row 1: Stars · Colors */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Stars */}
            <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= (hoverStar || star || 0);
                return (
                  <button key={s} type="button"
                    onClick={() => setStar(s)}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    style={{ fontSize: 20, lineHeight: 1, padding: "4px 2px", color: filled ? "var(--accent)" : "var(--border-strong)", background: "none", border: "none", cursor: "pointer" }}>
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 22, background: "var(--border)", flexShrink: 0 }} />

            {/* Color tags */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {COLOR_OPTIONS.map((opt) => {
                const isActive = color?.includes(opt.key) ?? false;
                return (
                  <button key={opt.key} type="button" onClick={() => setColor(opt.key)}
                    style={{ width: 22, height: 22, borderRadius: "50%", background: opt.color, border: isActive ? "2px solid white" : "2px solid transparent", boxShadow: isActive ? "0 0 0 2px rgba(255,255,255,0.25)" : "none", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                    {isActive && <Check style={{ position: "absolute", inset: 0, margin: "auto", width: 10, height: 10, color: "white" }} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />
          </div>

          {/* Row 2: Comment */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={draftComment}
              onFocus={() => { setIsCommentEditing(true); clearSaveError(); }}
              onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
              onBlur={() => { setIsCommentEditing(false); saveComment(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="코멘트..."
              style={{
                flex: 1, height: 38, padding: "0 12px",
                background: "rgba(29, 30, 35, 0.6)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, color: "var(--foreground)", fontSize: 13,
                fontFamily: "'Inter', system-ui, sans-serif", outline: "none",
              }}
            />

            {/* Select button (right of comment) */}
            <button
              type="button"
              onClick={toggleSelect}
              style={{
                ...SELECT_BASE_MOBILE,
                ...(isCurrentSelected ? SELECT_ACTIVE : SELECT_INACTIVE),
                height: 38,
              }}
            >
              {isCurrentSelected
                ? <><Check style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={3} /><span>선택됨 {Y}/{N}</span></>
                : <span>선택 {Y}/{N}</span>
              }
            </button>
          </div>
        </div>

      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowShortcuts(false)}
        >
          <div className="fs-hud" style={{ padding: "28px 32px", minWidth: 320, borderRadius: 2 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "var(--accent)", letterSpacing: "0.1em" }}>KEYBOARD SHORTCUTS</div>
              <button type="button" onClick={() => setShowShortcuts(false)}
                style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "var(--muted-foreground)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 24px" }}>
              <span style={{ color: "var(--accent)" }}>← →</span><span>이전 / 다음 사진</span>
              <span style={{ color: "var(--accent)" }}>SPACE</span><span>선택 / 선택 해제</span>
              <span style={{ color: "var(--accent)" }}>1 – 5</span><span>별점 설정</span>
              <span style={{ color: "var(--accent)" }}>Q W E R T</span><span>색상 태그</span>
              <span style={{ color: "var(--accent)" }}>?</span><span>단축키 보기 / 닫기</span>
              <span style={{ color: "var(--accent)" }}>ESC</span><span>창 닫기</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Selection modal */}
      {showConfirmModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16 }}
          onClick={() => !confirming && setShowConfirmModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 8, padding: 32, position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 24,
              textTransform: "uppercase", fontStyle: "italic",
              margin: 0, marginBottom: 16, color: "var(--foreground)",
            }}>
              Confirm Selection
            </h3>
            <p style={{ color: "var(--muted-foreground)", fontSize: 13, lineHeight: 1.7, margin: 0, marginBottom: 28 }}>
              총 <span style={{ color: "var(--accent)", fontWeight: 700 }}>{Y}장</span>의 사진이 선택되었습니다.
            </p>

            {confirmError && (
              <p style={{ color: "#ef4444", fontSize: 12, margin: 0, marginBottom: 16 }} role="alert">{confirmError}</p>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => !confirming && setShowConfirmModal(false)}
                disabled={confirming}
                style={{
                  flex: 1, height: 44, borderRadius: 8,
                  border: "1px solid var(--border-subtle)", background: "transparent",
                  color: "var(--muted-foreground)", fontFamily: MONO, fontSize: 12, fontWeight: 700,
                  cursor: confirming ? "not-allowed" : "pointer", transition: "all 0.15s",
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  flex: 1, height: 44, borderRadius: 8,
                  background: "var(--accent)", color: "#000",
                  fontFamily: MONO, fontSize: 12, fontWeight: 700,
                  border: "1px solid var(--accent)",
                  cursor: confirming ? "not-allowed" : "pointer",
                  opacity: confirming ? 0.6 : 1,
                }}
              >
                {confirming ? "처리 중..." : "확정 및 전송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
