"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Star, ArrowLeft, Check, Layers, MessageSquare, X } from "lucide-react";
import { useSelection, type SelectionToggleResult } from "@/contexts/SelectionContext";
import { CommentSaveIndicator } from "@/components/customer/CommentSaveIndicator";
import { PrevNextButton } from "@/components/PrevNextButton";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { SelectionLimitSnackbar } from "@/components/customer/SelectionLimitSnackbar";
import { ParticipantSheet } from "@/components/customer/ParticipantSheet";
import { PhotoPositionBar } from "@/components/customer/PhotoPositionBar";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import {
  fetchRoster,
  getUsedColors,
  readParticipant,
  saveRosterName,
  writeParticipant,
  type Participant,
  type ParticipantRoster,
} from "@/lib/customer-participant";
import {
  COLOR_OPTIONS,
  getReadableInk,
  parseFilterFromSearchParams,
  buildFilterQueryString,
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
import { triggerSelectionHaptic } from "@/lib/selection-feedback";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";

const COMMENT_MAX_LENGTH = 150;
const PREVIEW_URL_CACHE_MAX = 100;
const PREVIEW_DECODE_CACHE_MAX = 6;
const PREVIEW_EXPIRY_SAFETY_SECONDS = 60;

type PresignedPreviewInfo = {
  url: string;
  expiresAt: number;
};

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (params?.token as string) ?? "";
  const photoId = (params?.photoId as string) ?? "";
  const { project, photos: contextPhotos, photoGroups, selectedIds, Y, toggle, photoStates, updatePhotoState, toggleColor, commentSaveStates } = useSelection();

  // 로컬 state로 현재 사진 관리 — router.push 없이 전환해 컴포넌트 재마운트 방지
  const [activePhotoId, setActivePhotoId] = useState(photoId);
  const [selectionFeedback, setSelectionFeedback] = useState<{ photoId: string; key: number } | null>(null);
  const [selectionLimitNoticeKey, setSelectionLimitNoticeKey] = useState<number | null>(null);
  const selectionFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (selectionFeedbackTimerRef.current) clearTimeout(selectionFeedbackTimerRef.current);
  }, []);

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
  const commentSaveStatus = current ? (commentSaveStates[current.id] ?? "idle") : "idle";

  /** 그룹 펼침 상태(힌트 pill/PC 미니 스트립/모바일 그룹 필름스트립 공용).
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

  const totalVisiblePhotos = filteredPhotos.length;
  const currentPhotoOrdinal = totalVisiblePhotos > 0 ? Math.max(1, navAnchorIndex + 1) : 0;

  const currentGroupId = current?.similarityGroupId ?? null;
  const currentGroup = currentGroupId ? groupsById.get(currentGroupId) : undefined;
  const showGroupHint = groupingActive && !!currentGroup && currentGroup.photoCount > 1;

  const star  = current ? photoStates[current.id]?.rating : undefined;
  const color = current ? photoStates[current.id]?.color  : undefined;

  const previewUrlCacheRef = useRef<Map<string, PresignedPreviewInfo>>(new Map());
  const previewRequestPendingRef = useRef<Set<string>>(new Set());
  const decodedPreviewImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [presignedPreviewUrls, setPresignedPreviewUrls] = useState<Map<string, PresignedPreviewInfo>>(
    () => new Map()
  );

  /** 인접 사진은 URL 발급만 해두지 않고 실제 이미지 decode까지 시작한다. Image 객체는
   *  최근 6장만 유지해 모바일 디코딩 메모리가 사진 수에 비례해 늘어나지 않게 한다. */
  const preloadPreview = useCallback((photoId: string, info: PresignedPreviewInfo, highPriority: boolean) => {
    const existing = decodedPreviewImagesRef.current.get(photoId);
    if (existing?.src === info.url) {
      if (highPriority) existing.fetchPriority = "high";
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = highPriority ? "high" : "low";
    image.src = info.url;
    decodedPreviewImagesRef.current.delete(photoId);
    decodedPreviewImagesRef.current.set(photoId, image);
    while (decodedPreviewImagesRef.current.size > PREVIEW_DECODE_CACHE_MAX) {
      const oldestId = decodedPreviewImagesRef.current.keys().next().value as string | undefined;
      if (!oldestId) break;
      decodedPreviewImagesRef.current.delete(oldestId);
    }
    void image.decode().catch(() => {
      // 메인 <img>가 동일 URL을 다시 시도할 수 있으므로 preload 실패는 화면 오류로 승격하지 않는다.
    });
  }, []);

  const ensurePreviewUrls = useCallback(async (photoIds: string[], priorityPhotoId: string) => {
    if (!token || photoIds.length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    const uniqueIds = [...new Set(photoIds)];
    const idsToFetch: string[] = [];

    for (const photoId of uniqueIds) {
      const cached = previewUrlCacheRef.current.get(photoId);
      if (cached && cached.expiresAt > now + PREVIEW_EXPIRY_SAFETY_SECONDS) {
        preloadPreview(photoId, cached, photoId === priorityPhotoId);
        continue;
      }
      if (cached) previewUrlCacheRef.current.delete(photoId);
      if (!previewRequestPendingRef.current.has(photoId)) {
        previewRequestPendingRef.current.add(photoId);
        idsToFetch.push(photoId);
      }
    }
    if (idsToFetch.length === 0) return;

    try {
      const res = await fetch(
        `/api/c/presign-preview?token=${encodeURIComponent(token)}&photoIds=${encodeURIComponent(idsToFetch.join(","))}`
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => ({ presignedUrls: {} })) as {
        presignedUrls?: Record<string, PresignedPreviewInfo>;
      };
      for (const [photoId, info] of Object.entries(data.presignedUrls ?? {})) {
        if (!info?.url || info.expiresAt <= now) continue;
        previewUrlCacheRef.current.delete(photoId);
        previewUrlCacheRef.current.set(photoId, info);
        preloadPreview(photoId, info, photoId === priorityPhotoId);
      }
      while (previewUrlCacheRef.current.size > PREVIEW_URL_CACHE_MAX) {
        const oldestId = previewUrlCacheRef.current.keys().next().value as string | undefined;
        if (!oldestId) break;
        previewUrlCacheRef.current.delete(oldestId);
      }
      setPresignedPreviewUrls(new Map(previewUrlCacheRef.current));
    } catch {
      // 현재 사진에는 공개 preview URL 폴백이 있으므로 인접 preload 실패는 조용히 복구한다.
    } finally {
      idsToFetch.forEach((photoId) => previewRequestPendingRef.current.delete(photoId));
    }
  }, [preloadPreview, token]);

  // PC는 이전 1장·다음 2장, 모바일은 양옆 1장씩 선발급·선로딩한다.
  // 데이터 절약 모드에서는 현재 사진만 요청한다.
  useEffect(() => {
    // SelectionContext hydration 전에 현재 사진만 따로 요청하면 곧바로 인접 사진 요청이
    // 한 번 더 발생한다. 탐색 목록이 준비된 뒤 첫 호출부터 묶어서 발급한다.
    if (!activePhotoId || filteredPhotos.length === 0) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = connection?.saveData === true;
    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    const offsets = saveData ? [0] : isMobileViewport ? [-1, 0, 1] : [-1, 0, 1, 2];
    const ids = [activePhotoId];
    if (navAnchorIndex >= 0) {
      for (const offset of offsets) {
        const photo = filteredPhotos[navAnchorIndex + offset];
        if (photo) ids.push(photo.id);
      }
    }
    void ensurePreviewUrls(ids, activePhotoId);
  }, [activePhotoId, navAnchorIndex, filteredPhotos, ensurePreviewUrls]);

  const [hoverStar,      setHoverStar]      = useState(0);
  const [starPressRing,  setStarPressRing]  = useState<number | null>(null);
  const [draftComment,   setDraftComment]   = useState("");
  const [isCommentEditing, setIsCommentEditing] = useState(false);
  /** 모바일: 사진을 탭하면 별점/색상/필름스트립/코멘트 오버레이를 숨겨 사진에 집중할 수 있게 한다 */
  /* 사진 탭/클릭 → 전체화면 집중 보기. 화면마다 자기 챙을 숨기는 대신 공통 오버레이 하나를 쓴다. */
  const [focusOpen, setFocusOpen] = useState(false);
  /** 이 기기가 어떤 색(=참가자)인지. 첫 "찜" 시점에 시트로 물어본다. */
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [participantSheetOpen, setParticipantSheetOpen] = useState(false);
  /** "mark" = 찜하려다 신원이 없어서 열림(확정 후 그 찜을 이어서 적용), "edit" = 이름/색만 고치러 열림 */
  const [participantSheetIntent, setParticipantSheetIntent] = useState<"mark" | "edit">("mark");
  /** 색 → 표시 이름. 서버 공유라 다른 참가자의 마크에도 이름을 붙일 수 있다. */
  const [roster, setRoster] = useState<ParticipantRoster>({});
  const [showShortcuts,  setShowShortcuts]  = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming,       setConfirming]       = useState(false);
  const [confirmError,     setConfirmError]     = useState<string | null>(null);

  const N = project?.requiredCount ?? 0;
  const canConfirm  = N > 0 && Y === N;
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const handleConfirm = useCallback(async () => {
    if (!project?.id || !token || !canConfirm || confirming) return;
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
  }, [project?.id, token, selectedIds, canConfirm, confirming]);

  const filmstripRef     = useRef<HTMLDivElement>(null);
  const mobileFilmstripRef = useRef<HTMLDivElement>(null);
  const mobileCommentRef = useRef<HTMLTextAreaElement>(null);
  const filmstripSeenRef = useRef(false); // 마운트 후 첫 실행 여부 추적

  /* ── PC 필름스트립 윈도우 렌더링 ──────────────────────────────────────
   * 예전엔 filteredPhotos 전체를 실 DOM으로 그렸다 — 베타 사용자 프로젝트 사진 한도가
   * 2000장(§beta-limits)이라 "수천 장"은 가정이 아니라 실제 지원 범위였고, 그 규모에서
   * 매번 수천 개 DOM 노드를 레이아웃하는 비용이 그대로 쌓인다.
   * 지금 위치 기준 앞뒤 RADIUS장만 그린다 — 최대 3000장 프로젝트도 실 DOM은 최대
   * RADIUS*2+1개로 고정된다. 클릭/이전·다음 이동은 이 창을 그대로 재중심화하고,
   * 클릭 없이 직접 끝까지 드래그해 훑어보는 경우만 스크롤이 가장자리에 닿을 때
   * 그 방향으로 이어붙인다(무한 스크롤과 같은 모양). */
  const FILMSTRIP_THUMB_W = 150;
  const FILMSTRIP_GAP = 16;
  const FILMSTRIP_STEP = FILMSTRIP_THUMB_W + FILMSTRIP_GAP;
  const FILMSTRIP_WINDOW_RADIUS = 60;
  const FILMSTRIP_GROW_BATCH = 60;
  const FILMSTRIP_EDGE_PX = FILMSTRIP_STEP * 3;

  const filmstripAnchor = navAnchorIndex >= 0 ? navAnchorIndex : 0;
  /* 재중심 창은 navAnchorIndex의 순수 파생값이다 — state+effect로 만들면 "새 창 계산 →
   * 리렌더 → 그제서야 스크롤"의 한 프레임 사이에 옛 창(다른 스크롤 폭) 기준으로 스크롤
   * 명령이 나가 버려, 정확히 이 작업의 발단이 된 "처음 위치에서 밀려오는" 증상을 스스로
   * 만든다. useMemo로 같은 렌더 안에서 확정해야 그 프레임이 아예 생기지 않는다. */
  const filmstripRecenteredWindow = useMemo(() => ({
    start: Math.max(0, filmstripAnchor - FILMSTRIP_WINDOW_RADIUS),
    end: Math.min(filteredPhotos.length, filmstripAnchor + FILMSTRIP_WINDOW_RADIUS + 1),
  }), [filmstripAnchor, filteredPhotos.length]);
  /* 클릭 없이 자유 스크롤로 훑어볼 때만 늘어나는 여분 — 사진을 이동하면(navAnchorIndex
   * 변경) 그 즉시 원래 폭으로 되돌아간다. */
  const [filmstripManualExpand, setFilmstripManualExpand] = useState({ before: 0, after: 0 });
  useEffect(() => {
    setFilmstripManualExpand({ before: 0, after: 0 });
  }, [filmstripAnchor]);
  const filmstripWindow = useMemo(() => ({
    start: Math.max(0, filmstripRecenteredWindow.start - filmstripManualExpand.before),
    end: Math.min(filteredPhotos.length, filmstripRecenteredWindow.end + filmstripManualExpand.after),
  }), [filmstripRecenteredWindow, filmstripManualExpand, filteredPhotos.length]);
  const filmstripPhotos = useMemo(
    () => filteredPhotos.slice(filmstripWindow.start, filmstripWindow.end),
    [filteredPhotos, filmstripWindow.start, filmstripWindow.end]
  );

  useEffect(() => {
    const container = filmstripRef.current;
    if (!container) return;
    // filmstripWindow는 navAnchorIndex와 같은 렌더에서 확정되므로, 이 시점의 DOM은
    // 이미 새 창 기준으로 그려져 있다 — 옛 창을 향해 스크롤한 뒤 다시 보정하지 않는다.
    const relativeIndex = filmstripAnchor - filmstripWindow.start;
    const target = relativeIndex * FILMSTRIP_STEP - container.clientWidth / 2 + FILMSTRIP_THUMB_W / 2;
    // 첫 마운트(갤러리→뷰어 진입)는 instant, 이후 사진 전환은 smooth
    const behavior = filmstripSeenRef.current ? "smooth" : "instant";
    filmstripSeenRef.current = true;
    container.scrollTo({ left: Math.max(0, target), behavior });
  }, [navAnchorIndex, filmstripWindow.start]);

  /* 가장자리 근처까지 자유 스크롤하면 그 방향으로 창을 넓힌다. 앞쪽(start)을 넓히는
   * 건 기존 항목들 앞에 새 항목을 끼워 넣는 것이라 scrollLeft가 그만큼 밀린다 —
   * 늘어난 폭을 그대로 더해 보정한다(뒤쪽 확장은 끝에 붙기만 하므로 보정 불필요). */
  const prevFilmstripStartRef = useRef(filmstripWindow.start);
  useLayoutEffect(() => {
    const container = filmstripRef.current;
    const prevStart = prevFilmstripStartRef.current;
    if (container && prevStart > filmstripWindow.start) {
      container.scrollLeft += (prevStart - filmstripWindow.start) * FILMSTRIP_STEP;
    }
    prevFilmstripStartRef.current = filmstripWindow.start;
  }, [filmstripWindow.start]);

  const handleFilmstripScroll = useCallback(() => {
    const container = filmstripRef.current;
    if (!container) return;
    if (container.scrollLeft <= FILMSTRIP_EDGE_PX && filmstripWindow.start > 0) {
      setFilmstripManualExpand((current) => ({ ...current, before: current.before + FILMSTRIP_GROW_BATCH }));
    }
    const distanceFromEnd = container.scrollWidth - container.clientWidth - container.scrollLeft;
    if (distanceFromEnd <= FILMSTRIP_EDGE_PX && filmstripWindow.end < filteredPhotos.length) {
      setFilmstripManualExpand((current) => ({ ...current, after: current.after + FILMSTRIP_GROW_BATCH }));
    }
  }, [filmstripWindow.start, filmstripWindow.end, filteredPhotos.length]);

  /* 기본 상태는 필름스트립 대신 얇은 위치 인디케이터를 쓰므로, 썸네일 행은
   * "유사컷 그룹을 펼쳐서 멤버를 골라야 하는" 경우에만 필요하다. */
  const mobileGroupMembers = groupingActive && expandedGroupId
    ? (membersByGroup.get(expandedGroupId) ?? [])
    : [];

  useEffect(() => {
    const container = mobileFilmstripRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(`[data-mobile-photo-id="${activePhotoId}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activePhotoId, expandedGroupId, mobileGroupMembers.length]);

  useEffect(() => {
    // Do not overwrite text currently being composed, but do reflect the
    // latest server state from another customer tab once editing ends.
    if (current?.id && !isCommentEditing && commentSaveStatus !== "error") {
      setDraftComment(photoStates[current.id]?.comment ?? "");
    }
  }, [current?.id, photoStates, isCommentEditing, commentSaveStatus]);

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

  /* 기기에 저장된 참가자(색) 복원 — 없으면 첫 찜 때 시트를 띄운다. */
  useEffect(() => {
    if (!token) return;
    setParticipant(readParticipant(token));
  }, [token]);

  /* 공유 명단(색 → 이름)은 다른 기기가 바꿀 수 있으므로 사진이 바뀔 때마다 최신값을 읽는다. */
  useEffect(() => {
    if (!token || !project?.id) return;
    let alive = true;
    void fetchRoster(token, project.id).then((next) => {
      if (alive) setRoster(next);
    });
    return () => {
      alive = false;
    };
  }, [token, project?.id, activePhotoId]);

  /** 프로젝트에서 이미 쓰인 색 = 참여 중인 사람들(별도 명단 저장 없이 태그에서 역산) */
  const usedColors = useMemo(() => getUsedColors(photoStates), [photoStates]);
  const myColor = participant?.color ?? null;
  const isMarkedByMe = myColor != null && (color?.includes(myColor) ?? false);
  /** #rrggbb → rgba(r,g,b,alpha). 찜 켜짐 틴트를 CSS color-mix 없이 만들기 위함(구형 사파리 대응). */
  const myColorHex = myColor ? COLOR_OPTIONS.find((o) => o.key === myColor)?.hex ?? null : null;
  const myColorVars = useMemo<CSSProperties | undefined>(() => {
    if (!myColorHex) return undefined;
    const r = parseInt(myColorHex.slice(1, 3), 16);
    const g = parseInt(myColorHex.slice(3, 5), 16);
    const b = parseInt(myColorHex.slice(5, 7), 16);
    return {
      "--fv-my-color": myColorHex,
      "--fv-my-ink": getReadableInk(myColorHex),
      "--fv-my-tint": `rgba(${r}, ${g}, ${b}, 0.18)`,
      /* 바 안에서는 테두리 없이 "채움"만으로 켜짐을 알려야 해서 더 진한 틴트가 필요하다 */
      "--fv-my-tint-strong": `rgba(${r}, ${g}, ${b}, 0.34)`,
      "--fv-my-line": `rgba(${r}, ${g}, ${b}, 0.55)`,
    } as CSSProperties;
  }, [myColorHex]);

  const otherMarks = useMemo(
    () => (color ?? []).filter((c) => c !== myColor),
    [color, myColor],
  );
  /** 다른 참가자 마크를 사진 위에 얹기 위한 표시용 데이터.
   * 이름 없는 원은 "찜은 있는데 누군지 모른다"를 그대로 드러내 정체불명으로 읽혔다 —
   * 이름을 등록해줄 수 있는 건 그 기기의 참가자 본인뿐이라 여기서는 "미등록"임을 `?`로 명시한다. */
  const otherMarkChips = useMemo(
    () =>
      otherMarks.map((mark) => {
        const name = roster[mark] || "";
        const hex = COLOR_OPTIONS.find((o) => o.key === mark)?.hex ?? "#888";
        return {
          key: mark,
          hex,
          ink: getReadableInk(hex),
          text: name ? name.slice(0, 2) : "?",
          named: name.length > 0,
          label: name ? `${name} 찜` : "이름을 등록하지 않은 참가자가 찜함",
        };
      }),
    [otherMarks, roster],
  );

  /** 찜 토글 — 아직 내 색을 안 정했으면 먼저 "누구세요?" 시트를 연다. */
  const toggleMyMark = useCallback(() => {
    if (!myColor) {
      setParticipantSheetIntent("mark");
      setParticipantSheetOpen(true);
      return;
    }
    setColor(myColor);
  }, [myColor, setColor]);

  /** 내 표시(이름·색) 고치기 — 찜 상태는 건드리지 않는다. */
  const editMyIdentity = useCallback(() => {
    setParticipantSheetIntent("edit");
    setParticipantSheetOpen(true);
  }, []);

  const saveComment = useCallback(() => {
    if (!current) return;
    const trimmed = draftComment.trim();
    if (trimmed === (photoStates[current.id]?.comment ?? "")) return;
    updatePhotoState(current.id, { comment: trimmed });
  }, [current, draftComment, photoStates, updatePhotoState]);

  useEffect(() => {
    if (!current?.id || !isCommentEditing) return;
    if (draftComment.trim() === (photoStates[current.id]?.comment ?? "")) return;
    const timer = window.setTimeout(saveComment, 600);
    return () => window.clearTimeout(timer);
  }, [current?.id, draftComment, isCommentEditing, photoStates, saveComment]);

  const toggleSelect = useCallback((): SelectionToggleResult => {
    if (!current) return "unavailable";
    const result = toggle(current.id);
    if (result === "limit-reached") {
      triggerSelectionHaptic("limit");
      setSelectionLimitNoticeKey((value) => (value ?? 0) + 1);
    }
    return result;
  }, [current, toggle]);

  const showSelectedPhotos = useCallback(() => {
    setSelectionLimitNoticeKey(null);
    const selectedFilter = { ...filterState, selectedFilter: "selected" as const };
    const query = buildFilterQueryString(selectedFilter);
    router.push(`/c/${token}/gallery${query}`);
  }, [filterState, router, token]);

  // ── Navigation ───────────────────────────────────────────────────────────

  // router.push 대신 history.replaceState 사용 → 컴포넌트 재마운트 없이 URL만 갱신
  const navigateTo = useCallback((id: string) => {
    saveComment();
    setIsCommentEditing(false);
    setActivePhotoId(id);
    window.history.replaceState(null, "", `/c/${token}/viewer/${id}${queryString}`);
  }, [token, queryString, saveComment]);

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

  /* 뷰어는 스크롤할 것이 없는 전체화면이다. 그런데 코멘트 입력으로 키보드가 뜨면 브라우저가 문서를
   * 위로 스크롤하고, 키보드가 닫힌 뒤에도 그 스크롤이 남아 하단에 검은 띠가 보였다.
   * 문서 스크롤을 아예 잠가 두고(고무줄 스크롤 포함), 시트가 닫힐 때 원위치로 되돌린다. */
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prev = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      overscroll: body.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  /* 키보드가 닫히는 시점(시트 종료)에 남아 있는 스크롤을 걷어낸다. */
  useEffect(() => {
    if (isCommentEditing) return;
    const reset = () => window.scrollTo(0, 0);
    reset();
    /* iOS는 키보드 접힘 애니메이션이 끝난 뒤에 한 번 더 밀어 올리는 경우가 있어 뒤늦게 한 번 더 맞춘다 */
    const timer = setTimeout(reset, 300);
    return () => clearTimeout(timer);
  }, [isCommentEditing]);

  /** 코멘트 시트 열기 — 하단 아이콘 버튼과 "위로 스와이프" 제스처가 함께 쓴다. */
  const openCommentEditor = useCallback(() => {
    setIsCommentEditing(true);
    requestAnimationFrame(() => mobileCommentRef.current?.focus());
  }, []);

  /** 얇은 위치 인디케이터를 탭/드래그해 임의 위치로 점프 — 필름스트립이 하던 "점프" 역할을 대신한다. */
  const seekToRatio = useCallback((ratio: number) => {
    if (!filteredPhotos.length) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    const index = Math.round(clamped * (filteredPhotos.length - 1));
    const photo = filteredPhotos[index];
    if (photo && photo.id !== activePhotoId) navigateTo(photo.id);
  }, [filteredPhotos, activePhotoId, navigateTo]);

  // ── Touch swipe ───────────────────────────────────────────────────────────

  const touchStartXRef      = useRef(0);
  const touchStartYRef      = useRef(0);
  const mobileImageZoomedRef = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mobileImageZoomedRef.current) return;
    const dx = touchStartXRef.current - e.changedTouches[0].clientX;
    const dy = touchStartYRef.current - e.changedTouches[0].clientY;
    /* 대각선 스와이프는 어느 쪽도 아닌 걸로 취급 — 한쪽이 뚜렷하게(1.5배 이상) 커야 그 방향으로 확정한다 */
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) goNextWrap();
      else goPrevWrap();
      return;
    }
    /* 위로 스와이프 — 코멘트를 남기는 손짓(끌어올려 시트를 연다)과 방향이 맞다.
     * 아래로 당기기(갤러리 복귀)는 브라우저 스크롤·키보드 닫기와 헷갈려 제거했다 — 복귀는 좌상단 뒤로가기로. */
    if (dy > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      openCommentEditor();
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (focusOpen) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (showConfirmModal) {
      if (e.key === "Escape" && !confirming) setShowConfirmModal(false);
      return;
    }
    if (showShortcuts) {
      if (e.key === "Escape" || e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts(false);
      }
      return;
    }
    if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); setShowShortcuts(true); return; }
    if (e.key === "Escape") {
      router.push(buildGalleryHrefWithFocus(token, searchParams, activePhotoId));
      return;
    }
    /* Cmd/Ctrl+1~9(브라우저 탭 전환), Cmd/Ctrl+F(페이지 찾기), 윈도우 Alt+←/→(뒤로/앞으로
     * 가기)와 겹치지 않게 막는다 — 숫자키는 별점, F는 찜, 방향키는 사진 이동이라 조합키까지
     * 그대로 반응하면 브라우저 기능이 씹히고 엉뚱한 곳에서 별점·찜이 바뀐다. */
    if (hasShortcutModifier(e)) return;
    switch (e.code) {
      case "Digit1": setStar(1); setStarPressRing(1); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit2": setStar(2); setStarPressRing(2); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit3": setStar(3); setStarPressRing(3); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit4": setStar(4); setStarPressRing(4); setTimeout(() => setStarPressRing(null), 200); break;
      case "Digit5": setStar(5); setStarPressRing(5); setTimeout(() => setStarPressRing(null), 200); break;
      /* 색은 참가자 식별자이므로 남의 색을 찍을 수 있는 색별 단축키 대신 "내 찜" 하나만 둔다 */
      case "KeyF": toggleMyMark(); break;
      /* 선택은 keyup에서 한 번만 바꾸되, keydown의 기본 스크롤은 여기서 먼저 막는다. */
      case "Space": e.preventDefault(); break;
      case "ArrowLeft":  e.preventDefault(); goPrevWrap(); break;
      case "ArrowRight": e.preventDefault(); goNextWrap(); break;
    }
  }, [focusOpen, setStar, toggleMyMark, goPrevWrap, goNextWrap, showConfirmModal, showShortcuts, confirming, router, token, searchParams, activePhotoId]);

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (focusOpen) return;
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
  }, [focusOpen, handleKeyDown, toggleSelect, showConfirmModal]);

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
  // 사진별 캐시를 사용하므로 빠르게 넘겨도 이전 사진의 presigned URL이 새 사진에 섞이지 않는다.
  // 발급 전이나 일시 실패 시에는 공개 preview URL로 즉시 표시한다(Phase B: R2 public 유지).
  const cachedPreview = presignedPreviewUrls.get(current.id);
  const viewerSrc = cachedPreview && cachedPreview.expiresAt > Math.floor(Date.now() / 1000)
    ? cachedPreview.url
    : viewerImageUrl(current);
  // photoId(라우트 파라미터)는 최초 진입 사진 id에 고정돼 있음(navigateTo가 history.replaceState만
  // 사용) — 필름스트립/화살표로 다른 사진을 보다가 닫으면 activePhotoId를 써야 실제로 보던 사진으로 돌아간다.
  const galleryHref        = buildGalleryHrefWithFocus(token, searchParams, activePhotoId);

  // 고객 상세뷰어의 완료 동작은 고정된 하단에서 제공해 선택 시 사진 높이가 변하지 않는다.
  const selectionCompletion = (
    <div className="fs-completion" aria-label="셀렉 진행">
      <span aria-live="polite">{Y} / {N}장 선택{canConfirm ? " 완료" : Y > N ? ` · ${Y - N}장 줄여주세요` : ` · ${Math.max(0, N - Y)}장 남음`}</span>
      <button type="button" disabled={!canConfirm || confirming} onClick={() => { setConfirmError(null); setShowConfirmModal(true); }}>셀렉 확정하기</button>
    </div>
  );

  return (
    <div
      className="fs-page-root"
      style={{ background: "#0f1113", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
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
          background: transparent;
          border: 0;
        }
        .fs-page-root {
          --viewer-surface: #191c1f;
          --viewer-surface-raised: #24282c;
          --viewer-stage: #0f1113;
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
        /* 위치 표시(PhotoPositionBar)를 필름스트립 윗변에 놓는다 */
        .fs-strip-gallery { position: relative; flex: 1; min-width: 0; padding: 0 24px; }
        .fs-completion { box-sizing: border-box; flex: 0 0 320px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; text-align: center; }
        .fs-completion span { color: rgba(255,255,255,.72); font: 600 13px/1.3 Pretendard, sans-serif; }
        .fs-completion button { width: 100%; height: 42px; border: 0; border-radius: 9px; background: var(--accent); color: white; font: 700 13px/1 Pretendard, sans-serif; cursor: pointer; }
        .fs-completion button:disabled { background: rgba(255,255,255,.08); color: rgba(255,255,255,.38); cursor: not-allowed; }
        .fs-completion button:focus-visible { outline: 2px solid white; outline-offset: 2px; }
        @media (max-width: 1200px) { .fs-completion { flex-basis: 288px; } }
        @media (max-width: 767px) {
          .fv-bottom-overlay .fs-completion { flex-direction: row; align-items: center; justify-content: space-between; padding: 4px 20px 8px; height: 56px; gap: 12px; }
          .fv-bottom-overlay .fs-completion span { font-size: 12px; }
          .fv-bottom-overlay .fs-completion button { width: 132px; flex-shrink: 0; }
        }
        .fs-position { position: absolute; top: 0; left: 24px; right: 24px; height: 18px; }

        /* ── PC 2단 구성: 사진(가변) + 우측 컨트롤 패널(고정) ──
         * 세로 화면과 달리 PC에서 사진은 "세로"에 갇혀 있고 좌우가 비어 있었다.
         * 컨트롤을 아래가 아니라 옆으로 보내면 그만큼 사진 높이가 늘어난다. */
        .fs-stage-row { flex: 1; min-height: 0; display: flex; }
        .fs-side {
          flex: 0 0 320px; width: 320px; min-width: 0;
          display: flex; flex-direction: column;
          background: var(--viewer-surface);
          overflow-y: auto;
        }
        /* 폭이 넉넉하지 않으면 패널이 사진을 너무 잡아먹으므로 조금 줄인다 */
        @media (max-width: 1200px) { .fs-side { flex-basis: 288px; width: 288px; } }
        .fs-side .fs-mini-strip { flex-wrap: wrap; }
        .fs-side .fs-mini-thumb { width: 80px; height: 54px; }
        /* 실제 단축키는 있었지만 여는 버튼이 없어 발견할 수 없었다. 작업 패널의 마지막 정보로
         * 짧은 요약을 상시 두고, 상세 목록은 눌렀을 때만 보여 사진 작업보다 앞서지 않게 한다. */
        .fs-select-big {
          margin: 16px 20px 0; box-sizing: border-box;
          display: flex; align-items: center; gap: 14px;
          padding: 16px; border-radius: 12px;
          border: 1.5px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.04);
          color: rgba(255,255,255,.92); cursor: pointer; text-align: left;
          transition: border-color 140ms ease, background-color 140ms ease;
        }
        .fs-select-big:hover { border-color: rgba(255,255,255,.34); background: rgba(255,255,255,.07); }
        .fs-select-big:focus-visible { outline: 2px solid white; outline-offset: 2px; }
        /* 미선택 상자는 흰 채움 — 갤러리 카드·모바일 뷰어와 같은 규칙이다(어두운 바탕에서도 상자로 읽힌다) */
        .fs-select-big-box {
          width: 34px; height: 34px; flex: 0 0 34px; border-radius: 8px;
          border: 2px solid rgba(255,255,255,.55); background: rgba(255,255,255,.92);
          display: grid; place-items: center;
        }
        .fs-select-big-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .fs-select-big-text strong { font: 700 15px/1.2 Pretendard, 'Noto Sans KR', sans-serif; letter-spacing: -.2px; }
        .fs-select-big-text small { font: 500 11px/1.2 Pretendard, 'Noto Sans KR', sans-serif; color: rgba(255,255,255,.45); }
        /* 주황은 "선택됨" 전용 */
        .fs-select-big.is-selected { border-color: var(--accent); background: rgba(255,77,0,.12); }
        .fs-select-big.is-selected .fs-select-big-box { background: var(--accent); border-color: var(--accent); }
        .fs-shortcuts {
          margin-top: auto; padding: 12px 20px 14px;
          border: 0; border-top: 1px solid rgba(255,255,255,.08);
          background: transparent; color: rgba(255,255,255,.42);
          font: 500 11px/17px Pretendard, 'Noto Sans KR', sans-serif;
          letter-spacing: -.15px; text-align: left; cursor: pointer;
          transition: color 140ms ease, background-color 140ms ease;
        }
        .fs-shortcuts:hover { color: rgba(255,255,255,.72); background: rgba(255,255,255,.025); }
        .fs-shortcuts:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
        .fs-shortcuts b { color: rgba(255,255,255,.72); font-weight: 700; }
        .fs-shortcuts-line { display: block; }
        .fs-help {
          position: fixed; inset: 0; z-index: 210;
          display: grid; place-items: center; padding: 20px;
          background: rgba(0,0,0,.72); backdrop-filter: blur(4px);
        }
        .fs-help-card {
          width: 100%; max-width: 360px; box-sizing: border-box;
          padding: 24px; border-radius: 14px;
          background: #16181b; border: 1px solid var(--border); color: #fff;
        }
        .fs-help-card h3 { margin: 0 0 16px; font: 800 16px/1 Pretendard, sans-serif; }
        .fs-help-card dl { margin: 0 0 20px; display: flex; flex-direction: column; gap: 10px; }
        .fs-help-card dl > div { display: flex; align-items: center; gap: 12px; }
        .fs-help-card dt { flex: 0 0 88px; display: flex; gap: 4px; margin: 0; }
        .fs-help-card dd { margin: 0; font: 400 13px/1.4 Pretendard, sans-serif; color: var(--muted-foreground); }
        .fs-help-card kbd {
          min-width: 26px; box-sizing: border-box; padding: 4px 6px; text-align: center;
          border: 1px solid rgba(255,255,255,.24); border-radius: 6px;
          background: rgba(255,255,255,.08);
          font: 700 11px/1 Pretendard, sans-serif; color: #fff;
        }
        .fs-help-card > button {
          width: 100%; height: 40px; border: 1px solid rgba(255,255,255,.28); border-radius: 10px;
          background: transparent; color: #fff; cursor: pointer; font: 700 13px/1 Pretendard, sans-serif;
        }
        .fs-help-card > button:hover { background: rgba(255,255,255,.1); }

        .fs-thumb {
          height: 88px; width: 132px; flex-shrink: 0;
          border: 2px solid transparent; border-radius: 4px;
          filter: grayscale(1); opacity: 0.45;
          transition: all 0.3s ease; cursor: pointer; position: relative; overflow: hidden;
        }
        /* 현재 위치는 흰 테두리 — 주황은 "선택됨"(체크 배지) 전용이라 같은 색을 쓰면 둘이 구분되지 않는다 */
        .fs-thumb.active {
          filter: grayscale(0); opacity: 1;
          border-color: #fff; transform: scale(1.05); z-index: 5;
        }
        .fs-thumb:not(.active):hover { opacity: 0.75; filter: grayscale(0.4); }
        .fs-hide-scrollbar::-webkit-scrollbar { display: none; }
        .fs-hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .fs-comment-input {
          background: #181818;
          border: 1px solid #a8abae;
          outline: none; font-size: 13px; line-height: 1.55; color: #fff;
          font-family: Pretendard, 'Noto Sans KR', sans-serif;
          resize: none;
        }
        .fs-comment-input::placeholder { color: #d6d6d6; }
        .fs-comment-input:focus { border-color: rgba(var(--accent-rgb), 0.4); }
        .fs-comment-input-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
        .fs-comment-input-icon { position: absolute; left: 14px; color: #d6d6d6; pointer-events: none; }
        .fs-star { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; background: transparent; cursor: pointer; transition: transform 0.1s; }
        .fs-star:hover { transform: scale(1.2); }
        .fs-panel-label {
          display: block; margin: 2px 0 0;
          color: rgba(255,255,255,.56);
          font: 600 12px/1 Pretendard, 'Noto Sans KR', sans-serif;
          letter-spacing: -.2px;
        }
        @keyframes fv-check-pop {
          0% { opacity: 0; transform: scale(.6); }
          70% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fv-check-glyph {
          0% { opacity: 0; transform: scale(.72); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fv-image-selection-flash {
          0% { opacity: .7; box-shadow: inset 0 0 0 2px #ff4d00; }
          100% { opacity: 0; box-shadow: inset 0 0 0 2px #ff4d00; }
        }
        /* ── 유사컷 그룹 힌트/펼침 (PC) ── */
        /* 주황은 "선택"(작가에게 전달되는 결과물) 전용 — 유사컷은 탐색 보조라 중립색을 쓴다.
         * 같은 주황을 쓰면 그룹 밴드가 화면에서 가장 강한 요소가 되어 선택 상태와 경쟁했다. */
        .fs-group-hint {
          display: flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 12px; flex-shrink: 0; border-radius: 999px;
          background: rgba(0,0,0,0.4); border: 1px solid var(--border); color: #fff;
          font-family: Pretendard, 'Noto Sans KR', sans-serif; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s ease;
        }
        .fs-group-hint:hover { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.5); }
        .fs-mini-strip-wrap {
          flex-shrink: 0; background: rgba(255,255,255,0.045);
          padding: 14px 20px;
        }
        .fs-mini-strip-label {
          font-family: Pretendard, 'Noto Sans KR', sans-serif; font-size: 11px; font-weight: 600;
          color: var(--muted-foreground); margin-bottom: 8px;
        }
        .fs-mini-strip { display: flex; gap: 10px; overflow-x: auto; }
        .fs-mini-thumb {
          height: 64px; width: 96px; flex-shrink: 0; position: relative;
          border: 2px solid transparent; border-radius: 4px; cursor: pointer; overflow: hidden;
          filter: grayscale(1); opacity: 0.55; transition: all 0.2s ease;
        }
        .fs-mini-thumb:hover { opacity: 0.85; filter: grayscale(0.3); }
        .fs-mini-thumb.active { filter: grayscale(0); opacity: 1; border-color: #fff; }
        .fs-mini-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        /* 메인 필름스트립: 펼쳐진 그룹의 표지(front) 사진 표시(.active의 border/transform과 레이어 분리).
         * 탐색 보조이므로 주황이 아니라 옅은 흰 링을 쓴다. */
        .fs-thumb.group-expanded { box-shadow: 0 0 0 2px rgba(255,255,255,.45); }

        /* ── Figma #56109 모바일 상세 ── */
        .fv-mobile {
          /* 높이는 inset으로만 정한다 — 100dvh를 함께 주면 over-constrained가 되어
           * URL 바·키보드 전환마다 높이가 흔들린다.
           * 주의: 이 규칙의 position이 클래스로 붙은 Tailwind fixed를 덮으므로(같은 명시도, 늦은 순서)
           * 여기서 직접 fixed/inset을 선언해야 한다. relative로 두면 높이가 0이 된다. */
          position: fixed; inset: 0;
          background: #000; color: #fff;
          font-family: Pretendard, 'Noto Sans KR', sans-serif;
          overflow: hidden;
          /* 챙 높이는 여기서만 정의하고 아래 각 행과 사진 stage offset이 모두 이 값을 참조한다
           * (행 높이를 바꿔도 사진 정렬이 따로 놀지 않도록 단일 출처로 유지). */
          --fv-appbar-h: 56px;
          /* 컨트롤 행은 위치 트랙(20px) + 알약 행(56px)을 한 덩어리로 품는다 */
          --fv-controls-h: 76px;
          /* 추가 행은 유사컷 그룹을 펼쳤을 때만 — 그때는 위치 트랙 대신 멤버 썸네일이 위치를 알려준다 */
          --fv-strip-h: 0px;
          --fv-top-chrome: calc(env(safe-area-inset-top) + var(--fv-appbar-h) + 12px);
          --fv-bottom-chrome: calc(56px + 20px + var(--fv-controls-h) + var(--fv-strip-h) + 14px + env(safe-area-inset-bottom));
        }
        .fv-mobile.fv-group-expanded { --fv-controls-h: 56px; --fv-strip-h: 68px; }

        /* 사진에 집중할 수 있도록 컨트롤은 별도 검은 띠가 아니라 사진 위 그라디언트 오버레이로 띄운다.
         * 사진을 탭하면 오버레이가 페이드아웃되는 "챙 숨기기" 모드(onSingleTap)와 짝을 이룬다. */
        .fv-top-overlay {
          position: absolute; top: 0; left: 0; right: 0; z-index: 30;
          background: linear-gradient(to bottom, rgba(0,0,0,.78) 0%, rgba(0,0,0,.48) 62%, transparent 100%);
          padding-bottom: 12px;
          transition: opacity 200ms ease, transform 200ms ease;
        }
        .fv-bottom-overlay {
          position: absolute; bottom: 0; left: 0; right: 0; z-index: 30;
          /* 사진은 챙 사이 영역(.fv-image-stage)에 놓이므로 스크림이 사진을 덮지 않는다.
           * 흐린 배경 위에서 컨트롤이 읽힐 정도만 유지하고, 대비는 요소별 그림자로 보강한다. */
          background: linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.5) 55%, transparent 100%);
          padding-top: 20px;
          /* 바가 화면 끝에 딱 붙으면 답답하다 — safe area 위에 실제 여백을 얹는다 */
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
          transition: opacity 200ms ease, transform 200ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .fv-top-overlay, .fv-bottom-overlay { transition: opacity 200ms ease; }
        }

        .fv-appbar { padding-top: env(safe-area-inset-top); }
        .fv-appbar-row { height: var(--fv-appbar-h); padding: 0 16px 0 20px; display: flex; align-items: center; gap: 10px; }
        .fv-back { width: 24px; height: 44px; flex: 0 0 24px; margin-left: -4px; padding: 0; border: 0; background: transparent; color: #fff; display: grid; place-items: center; }
        /* 파일명 대신 "몇 장 골랐는지"를 가장 높은 위계로 — 셀렉의 실제 목표를 상시 노출한다. */
        .fv-title { min-width: 0; flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .fv-selection-count { min-width: 0; font: 600 17px/22px Pretendard, sans-serif; letter-spacing: -.2px; white-space: nowrap; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
        /* 보조 줄 — 사진 위에 얹히므로 그림자로 대비를 준다. 길면 잘라낸다(전체는 title 속성으로 남는다). */
        .fv-filename { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px/13px 'Space Mono', Pretendard, sans-serif; color: rgba(255,255,255,.62); text-shadow: 0 1px 3px rgba(0,0,0,.7); }
        .fv-selection-count strong { color: #ff4d00; font-weight: 700; }
        /* 신원 칩 — 이름·색은 사진마다 바뀌는 값이 아니라 "이 세션에서 나는 누구"라 앱바에 둔다.
         * 파일명·진행 바를 걷어낸 자리라 새 공간을 쓰지 않는다. */
        .fv-identity {
          flex: 0 0 auto; height: 32px; padding: 0 11px 0 8px;
          display: flex; align-items: center; gap: 6px;
          border: 1px solid rgba(255,255,255,.28); border-radius: 999px;
          background: rgba(0,0,0,.42); color: #fff;
          font: 600 13px/1 Pretendard, sans-serif; letter-spacing: -.2px;
        }
        .fv-identity-dot { width: 14px; height: 14px; flex: 0 0 14px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
        /* 이름 미등록 — 사진 위 마크와 같은 점선 언어로 "색으로만 보이는 중"임을 알린다 */
        .fv-identity-unnamed { border-style: dashed; color: rgba(255,255,255,.72); }
        .fv-identity-unnamed .fv-identity-dot { opacity: .75; }
        .fv-identity:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        /* C6. 체크박스만 :focus-visible 규칙이 없어 브라우저 기본 파란 링이 그대로 나왔다. */
        .fv-back:focus-visible, .fv-star:focus-visible, .fv-thumb:focus-visible, .fv-photo-checkbox:focus-visible { outline: 2px solid #fff; outline-offset: 2px; border-radius: 10px; }
        .fv-photo-checkbox:focus:not(:focus-visible) { outline: none; }
        /* 위치 트랙(윗변) + 알약 행을 한 덩어리로 품는다 */
        .fv-controls {
          height: var(--fv-controls-h); box-sizing: border-box;
          padding: 20px 14px 0; display: flex; align-items: center;
          justify-content: space-between; gap: 8px; position: relative;
        }
        .fv-mobile.fv-group-expanded .fv-controls { padding-top: 0; }

        /* ── 하단 컨트롤 바 ──
         * 별점·유사컷·코멘트·찜을 각각 알약으로 감쌌더니 둥근 1px 테두리가 4겹으로 반복되고
         * 찜 안쪽 dot까지 더해져 동심원이 됐다. 껍데기는 이 바 하나만 갖고 내부는 무테로 둔다. */
        .fv-bar {
          flex: 1; min-width: 0; height: 52px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 0 4px 0 10px;
          border: 1px solid rgba(255,255,255,.22); border-radius: 999px;
          background: rgba(0,0,0,.5);
          box-shadow: 0 2px 10px rgba(0,0,0,.4);
        }
        .fv-bar-right { display: flex; align-items: center; gap: 2px; min-width: 0; }

        /* 바 안의 항목 — 크기·정렬만 공유하고 테두리/배경은 갖지 않는다 */
        .fv-pill {
          height: 44px; box-sizing: border-box; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          border: 0; border-radius: 999px;
          background: transparent; color: #fff;
          font: 600 13px/18px Pretendard, sans-serif;
        }

        .fv-stars { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
        .fv-star { width: 28px; height: 42px; padding: 0; border: 0; background: transparent; color: #737373; font-size: 22px; line-height: 22px; display: grid; place-items: center; text-shadow: 0 1px 3px rgba(0,0,0,.85); }

        /* 찜은 신원 구획을 떼어내 순수 토글이 됐다 — 두 구획으로 나눴더니 "이름 vs 찜함" 택1로 읽혔다.
         * 이름·색을 고치는 곳은 앱바의 신원 칩(.fv-identity)이다. */
        .fv-mark-toggle { padding: 0 16px; }
        /* 켜진 찜은 주황이 아니라 "내 색" — 주황과 겹치면 선택과 구분이 안 되고, 색이 곧 사람이라 의미도 맞다 */
        /* 켜짐은 테두리가 아니라 내 색으로 "채운" 면 — 바 안에서 테두리를 또 그리면 동심원이 된다.
         * 채움이 충분히 진해야 상태가 읽히므로 별도의 strong 틴트를 쓴다. */
        .fv-mark-toggle-on {
          background: var(--fv-my-tint-strong, rgba(255,77,0,.34));
          color: #fff;
        }
        .fv-image { position: absolute; inset: 0; overflow: hidden; background: #000; }
        .fv-image-stage {
          position: absolute; left: 0; right: 0;
          top: var(--fv-top-chrome); bottom: var(--fv-bottom-chrome);
          transition: top 220ms ease, bottom 220ms ease;
        }
        .fv-detail-arrows button { background: rgba(0,0,0,.18) !important; border-color: rgba(255,255,255,.12) !important; }
        @media (prefers-reduced-motion: reduce) {
          .fv-image-stage { transition: none; }
        }
        /* 유사컷 pill(좌) + 코멘트 버튼(우)을 한 줄에 모은 메타 행 */
        /* 다른 항목이 44px인데 혼자 23px이라 통일했다던 시각 언어가 깨져 있었다 */
        .fv-group-pill { height: 44px; min-width: 44px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: rgba(255,255,255,.8); display: flex; align-items: center; justify-content: center; gap: 5px; font: 600 12px/1 Pretendard, sans-serif; }
        .fv-group-pill-active { color: #fff; background: rgba(255,255,255,.14); }
        .fv-filmstrip { height: var(--fv-strip-h); box-sizing: border-box; display: flex; align-items: center; overflow-x: auto; gap: 6px; padding: 10px 20px; scroll-padding-inline: 20px; scroll-snap-type: x proximity; }
        /* 위치 인디케이터(PhotoPositionBar)를 컨트롤 행의 "윗변"에 놓는다 — 시각적 선은 3px이지만
         * 위쪽 20px 전체가 탭/드래그 영역이라 알약과 타깃이 겹치지 않는다. */
        .fv-position {
          position: absolute; top: 0; left: 14px; right: 14px; height: 20px;
          box-sizing: border-box;
        }
        .fv-thumb { width: 42px; height: 42px; box-sizing: border-box; flex: 0 0 42px; padding: 0; border: 1px solid #4f545a; background: #636971; opacity: .68; overflow: hidden; position: relative; scroll-snap-align: center; transition: width 150ms ease, height 150ms ease, flex-basis 150ms ease, opacity 150ms ease; }
        .fv-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; filter: grayscale(1); }
        .fv-thumb-active { width: 48px; height: 48px; flex-basis: 48px; border: 2px solid #fff; opacity: 1; }
        .fv-thumb-active img { filter: none; }
        .fv-thumb-selected-mark { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 0; background: #ff4d00; color: #fff; display: grid; place-items: center; box-shadow: 0 1px 4px rgba(0,0,0,.45); opacity: 0; transform: scale(.75); transition: opacity 140ms ease, transform 140ms ease; pointer-events: none; }
        .fv-thumb-selected-mark-visible { opacity: 1; transform: scale(1); }
        .fv-thumb-selected-mark-enter { animation: fv-check-pop 200ms cubic-bezier(.2,.8,.2,1) both; }
        .fv-thumb-selected-mark-enter svg { animation: fv-check-glyph 140ms 40ms ease-out both; }
        .fv-selection-flash { position: absolute; z-index: 2; pointer-events: none; animation: fv-image-selection-flash 300ms ease-out both; }
        /* 선택된 사진의 테두리 — 사진 실제 렌더 영역(object-fit: contain 계산값)에 딱 맞춘다.
         * 안쪽 흰 선을 한 겹 둬서 주황과 사진이 비슷한 색일 때도 경계가 살아남는다. */
        /* 다른 참가자의 찜 — 사진 우측 상단. 사진 위에 얹히므로 어두운 링으로 밝은 사진에서도 살린다. */
        .fv-photo-marks {
          position: absolute; z-index: 3; pointer-events: none;
          display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 4px;
        }
        .fv-photo-mark {
          min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box;
          border-radius: 999px; display: grid; place-items: center;
          font: 700 11px/1 Pretendard, sans-serif;
          letter-spacing: -.3px; white-space: nowrap;
          border: 1.5px solid rgba(255,255,255,.9);
          box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.4);
        }
        /* 이름 없는 원은 "찜은 있는데 누군지 모른다"로 읽혔다 — 점선 테두리 + 물음표로 미등록임을 드러낸다 */
        .fv-photo-mark-unnamed { border-style: dashed; }
        .fv-selected-frame {
          position: absolute; z-index: 2; pointer-events: none;
          box-shadow: inset 0 0 0 3px #ff4d00, inset 0 0 0 4px rgba(255,255,255,.5);
        }
        /* 코멘트: 별점·찜과 같은 .fv-pill 껍데기를 쓰고 내용만 다르다 —
         * 비어 있으면 아이콘만, 내용이 있으면 흰 점, 저장 실패면 재시도 라벨로 바뀐다. */
        .fv-comment-fab {
          flex: 0 1 auto; min-width: 44px; max-width: 200px;
          gap: 6px; padding: 0 12px;
        }
        /* 주황은 "선택"(작가에게 전달되는 결과물) 전용 — 코멘트 유무는 중립 흰색으로 알린다 */
        .fv-comment-fab-filled { color: #fff; }
        .fv-comment-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; flex-shrink: 0; }
        .fv-comment-fab-error { color: #ff6262; }
        .fv-comment-fab-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
        .fv-comment-fab:focus-visible, .fv-mark-toggle:focus-visible, .fv-group-pill:focus-visible { outline: 2px solid #fff; outline-offset: -2px; border-radius: 999px; }
        .fv-comment-sheet { position: fixed; left: 50%; bottom: 0; z-index: 80; width: min(100%, 375px); transform: translateX(-50%); background: #fff; color: #191918; box-shadow: 0 -4px 8px rgba(0,0,0,.12); border-radius: 12px 12px 0 0; padding: 16px 20px calc(20px + env(safe-area-inset-bottom)); }
        .fv-comment-sheet textarea { width: 100%; min-height: 72px; max-height: 144px; padding: 0; resize: none; border: 0; outline: 0; background: transparent; color: #191918; font: 400 15px/24px Pretendard, sans-serif; letter-spacing: -.36px; }
        .fv-comment-sheet-actions { min-height: 36px; margin-top: 4px; display: flex; align-items: center; justify-content: space-between; }
        .fv-comment-save { width: 48px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: #ff4d00; color: #fff; display: grid; place-items: center; }
        @media (prefers-reduced-motion: reduce) {
          .fv-thumb, .fv-image * { scroll-behavior: auto !important; transition: none !important; }
          .fv-thumb-selected-mark-enter, .fv-thumb-selected-mark-enter svg { animation: none !important; }
          .fv-selection-flash { display: none !important; }
        }

        /* PC(≥768px)도 모바일 Figma #56109와 같은 다크 사진 워크스페이스 톤을 쓴다.
         * .fs-grid-bg(사이버펑크 격자 장식)만 모바일처럼 숨긴다 — 나머지 .fs-* 색상은 모바일 .fv-* 팔레트를 참고해 조정했다. */
        @media (min-width: 768px) {
          .fs-grid-bg { display: none; }
        }
      `}</style>

      {/* Grid background */}
      <div className="fs-grid-bg" />

      {/* ════ DESKTOP (md+) ════ */}
      <div className="hidden md:flex flex-col" style={{ height: "100vh", ...myColorVars }}>

        {/* Header HUD bar */}
        <header style={{
          flexShrink: 0, zIndex: 40,
          background: "var(--viewer-surface)",
          borderBottom: 0,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
            padding: "14px 24px", width: "100%", minHeight: 68,
          }}>
            {/* Back link */}
            <Link href={galleryHref} scroll={false} title="갤러리로"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, color: "#fff", textDecoration: "none", flexShrink: 0, transition: "color 0.15s", borderRadius: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#fff")}>
              <X style={{ width: 18, height: 18 }} strokeWidth={2} />
            </Link>

            {/* Divider */}

            {/* 셀렉의 목표(몇 장 골랐는지)를 최상위 위계로 — 파일명은 고객에게 의미가 없어 보조로 내린다.
              * 모바일 앱바가 `Y / N장 선택`을 상시 노출하는 것과 같은 계약이다. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1, justifyContent: "center" }}>
              <h2 style={{
                fontFamily: "Pretendard, 'Noto Sans KR', sans-serif",
                fontWeight: 600,
                fontSize: 17,
                letterSpacing: "-0.02em",
                margin: 0,
                whiteSpace: "nowrap",
                color: "#fff",
                lineHeight: 1.3,
              }}>
                <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{Y}</strong> / {N}장 선택
              </h2>
              <p style={{
                fontFamily: "Pretendard, 'Noto Sans KR', sans-serif",
                fontSize: 12,
                color: "var(--muted-foreground)",
                margin: 0,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {filename}{project?.name ? ` · ${project.name}` : ""}
              </p>
            </div>


            {/* 신원 칩 — 모바일 앱바와 같은 자리·같은 규칙(이름·색은 세션 단위 정보) */}
            {myColor && (
              <button
                type="button"
                onClick={editMyIdentity}
                title="내 표시(이름·색) 바꾸기"
                aria-label={
                  participant?.initial
                    ? `내 표시 바꾸기 (현재 ${participant.initial})`
                    : "이름 등록하기 — 다른 참가자에게 색으로만 보여요"
                }
                style={{
                  flexShrink: 0, height: 32, padding: "0 11px 0 8px",
                  display: "flex", alignItems: "center", gap: 6,
                  border: `1px ${participant?.initial ? "solid" : "dashed"} var(--border)`,
                  borderRadius: 999, background: "transparent",
                  color: participant?.initial ? "#fff" : "var(--muted-foreground)",
                  font: "600 13px/1 Pretendard, 'Noto Sans KR', sans-serif",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: "50%", background: myColorHex ?? undefined, boxShadow: "0 0 0 1px rgba(0,0,0,.35)" }} />
                <span>{participant?.initial || "이름"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Main image area */}
        <div className="fs-stage-row">
        <main style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, zIndex: 10, overflow: "hidden", background: "var(--viewer-stage)" }}>

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
                  maxWidth: "100%",
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                  boxShadow: "none",
                  border: 0,
                  ...viewerImageBlockDownloadStyle,
                  cursor: "zoom-in",
                }}
                onClick={() => setFocusOpen(true)}
              />
            ) : (
              <div style={{ color: "var(--muted-foreground)", padding: 16 }}>사진 없음</div>
            )}
            {/* 선택 체크박스 — 헤더/HUD의 별도 CTA 대신 사진 좌측 상단에 배치 */}
            {viewerSrc && (
              <button
                type="button"
                onClick={toggleSelect}
                aria-label={isCurrentSelected ? "사진 선택 해제" : "사진 선택"}
                aria-pressed={isCurrentSelected}
                className="fv-photo-checkbox"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 12,
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    /* 갤러리 카드·모바일 뷰어와 같은 규칙 — 미선택은 흰 채움이라 어두운 사진에서도 빈 체크박스로 읽힌다 */
                    background: isCurrentSelected ? "var(--accent)" : "rgba(255,255,255,0.92)",
                    border: isCurrentSelected ? "2px solid var(--accent)" : "2px solid rgba(255,255,255,0.95)",
                    boxShadow: isCurrentSelected
                      ? "0 0 0 1px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.35)"
                      : "0 0 0 1px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.35)",
                    transition: "background-color 160ms ease, border-color 160ms ease",
                  }}
                >
                  {isCurrentSelected && <Check style={{ width: 20, height: 20, color: "#fff" }} strokeWidth={3} />}
                </span>
              </button>
            )}
          </div>
        </main>

        {/* 별·찜·코멘트·유사컷 — 사진 오른쪽 패널 */}
        <aside className="fs-side">
        <section
          className="fs-hud"
          style={{
            flexShrink: 0,
            zIndex: 35,
            borderLeft: "none",
            borderRight: "none",
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 10,
              width: "100%",
            }}
          >
            <span className="fs-panel-label">별점 · 찜</span>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, padding: "4px 0" }}>
                {([1, 2, 3, 4, 5] as const).map((s) => {
                  const filled = s <= displayRating;
                  const previewing = hoverStar > 0;
                  return (
                    <button
                      type="button"
                      aria-label={`별점 ${s}점`}
                      aria-pressed={star === s}
                      key={s}
                      className="fs-star"
                      onClick={() => setStar(s)}
                      onMouseEnter={() => setHoverStar(s)}
                      onMouseLeave={() => setHoverStar(0)}
                      onPointerDown={() => setHoverStar(s)}
                      style={{
                        fontSize: 20,
                        lineHeight: 1,
                        userSelect: "none",
                        color: filled ? (previewing ? "rgba(255,77,0,.7)" : "#FF4D00") : "#777B7F",
                        transform: starPressRing === s ? "scale(1.2)" : undefined,
                      }}
                    >
                      <Star size={22} fill={filled ? "currentColor" : "none"} strokeWidth={2} aria-hidden="true" style={{ display: "block", flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {/* 다른 참가자가 찜한 표시 — 읽기 전용. 이름 미등록은 점선 테두리 + `?`로 구분한다 */}
                {otherMarkChips.map((mark) => (
                  <span
                    key={mark.key}
                    title={mark.label}
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: "0 4px",
                      boxSizing: "border-box",
                      borderRadius: 999,
                      background: mark.hex,
                      color: mark.ink,
                      border: mark.named ? "1.5px solid transparent" : "1.5px dashed rgba(0,0,0,.4)",
                      boxShadow: "0 0 0 1px rgba(0,0,0,.4)",
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      font: "700 10px/1 Pretendard, sans-serif",
                      letterSpacing: "-.3px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {mark.text}
                  </span>
                ))}
                {/* 신원(이름·색)은 헤더 칩으로 뺐다 — 두 구획으로 나누면 "이름 vs 찜함" 택1 라디오로 읽힌다.
                  * 여기 남는 건 모바일과 같은 순수 토글 하나. */}
                <button
                  type="button"
                  onClick={toggleMyMark}
                  aria-pressed={isMarkedByMe}
                  title={isMarkedByMe ? "내 찜 해제" : "내 찜 추가"}
                  style={{
                    flexShrink: 0,
                    height: 32,
                    padding: "0 14px 0 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    border: `1px solid ${isMarkedByMe && myColorHex ? myColorHex : "var(--border)"}`,
                    background: isMarkedByMe ? "var(--fv-my-tint, transparent)" : "transparent",
                    color: "#fff",
                    font: "600 13px/18px Pretendard, 'Noto Sans KR', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                      boxSizing: "border-box",
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,.8)",
                      background: isMarkedByMe && myColorHex ? myColorHex : "transparent",
                    }}
                  />
                  <span>{isMarkedByMe ? "찜함" : "찜"}</span>
                </button>
              </div>

              {showGroupHint && currentGroup && (
                <>
                  <button
                    type="button"
                    className="fs-group-hint"
                    onClick={() => setGroupExpanded(currentGroup.id, expandedGroupId !== currentGroup.id)}
                  >
                    <Layers size={14} strokeWidth={1.8} aria-hidden />
                    유사컷 {currentGroup.photoCount - 1}장 {expandedGroupId === currentGroup.id ? "접기" : "보기"}
                  </button>
                </>
              )}
            </div>

            <span className="fs-panel-label" style={{ marginTop: 8 }}>사진별 요청</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, minWidth: 0 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, minWidth: 0 }}>
                <div style={{ minHeight: 14, display: "flex", alignItems: "center" }}>
                  <CommentSaveIndicator status={commentSaveStatus} onRetry={saveComment} />
                </div>
                <div className="fs-comment-input-wrap">
                  <MessageSquare size={14} strokeWidth={1.8} className="fs-comment-input-icon" aria-hidden />
                  <textarea
                    className="fs-comment-input"
                    value={draftComment}
                    onFocus={() => setIsCommentEditing(true)}
                    onChange={(e) => setDraftComment(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                    onBlur={() => { setIsCommentEditing(false); saveComment(); }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.target as HTMLTextAreaElement).blur();
                    }}
                    placeholder="사진별 요청을 입력해 주세요."
                    aria-label="사진별 요청"
                    style={{ width: "100%", padding: "11px 14px 11px 36px", minHeight: 88, borderRadius: 8, minWidth: 0 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 코멘트 아래 빈 공간에 두는 큰 선택 버튼(PC 패널 전용 — 모바일에는 이 여백이 없다).
          * 사진 좌측 상단의 작은 체크박스는 "지금 상태"를 사진에 붙여 보여주는 자리라 그대로 두고,
          * "고르는 행동"은 눈에 확실히 띄는 크기로 패널에서 한 번 더 제공한다.
          * 하단 `셀렉 확정하기` 자리를 겸하게 만들지 않는 이유: 개수를 채우면 그 버튼이 확정으로
          * 바뀌면서 정작 셀렉을 취소할 방법이 다시 작은 체크박스뿐이 된다(한 버튼에 두 역할 금지).
          * 미선택 상자를 흰 채움으로 두는 것은 갤러리 카드·모바일 뷰어와 같은 규칙이고,
          * 주황은 "선택됨" 전용이라 선택된 상태에서만 쓴다. */}
        <button
          type="button"
          className={`fs-select-big${isCurrentSelected ? " is-selected" : ""}`}
          aria-pressed={isCurrentSelected}
          onClick={() => { void toggleSelect(); }}
        >
          <span className="fs-select-big-box" aria-hidden>
            {isCurrentSelected && <Check style={{ width: 22, height: 22, color: "#fff" }} strokeWidth={3} />}
          </span>
          <span className="fs-select-big-text">
            <strong>{isCurrentSelected ? "선택됨" : "이 사진 선택하기"}</strong>
            <small>
              {isCurrentSelected
                ? "다시 누르면 선택 해제 · Space"
                : canConfirm
                  /* 한도에 찼을 때 — 누르면 기존 한도 스낵바가 뜨지만, 이렇게 큰 버튼이
                   * 아무 설명 없이 거절하면 고장으로 읽힌다. 먼저 할 일을 문구로 말한다. */
                  ? `${N}장을 모두 골랐어요 · 바꾸려면 다른 사진을 먼저 해제하세요`
                  : "Space 키로도 선택할 수 있어요"}
            </small>
          </span>
        </button>

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
        <button type="button" className="fs-shortcuts" onClick={() => setShowShortcuts(true)}>
          <span className="fs-shortcuts-line"><b>Space</b> 선택 · <b>1–5</b> 별점 · <b>F</b> 찜</span>
          <span className="fs-shortcuts-line"><b>← →</b> 이동 · <b>?</b> 전체 단축키</span>
        </button>
        </aside>
        </div>

        {/* Filmstrip footer */}
        <footer className="fs-selection-strip" style={{
          height: 124, background: "var(--viewer-surface)",
          zIndex: 30, display: "flex", alignItems: "center", padding: "0",
          position: "relative", flexShrink: 0,
        }}>
          <div className="fs-strip-gallery">
          {/* 위치 표시 — 헤더의 "N번째 · M장" 텍스트 대신 모바일과 같은 바로 보여준다.
            * 필름스트립 윗변에 붙여 "이 목록 안에서 어디쯤"이라는 뜻이 바로 읽히게 한다. */}
          <PhotoPositionBar
            className="fs-position"
            /* 모바일(.fv-position)과 같은 흰색 — 주황은 선택/제출의 색이라 위치 트랙에 쓰면
             * 바로 아래 풋터 진행바와 같은 모양·같은 색의 가로바가 두 겹이 된다. */
            tone="plain"
            ordinal={currentPhotoOrdinal}
            total={totalVisiblePhotos}
            prefix={groupingActive ? "대표컷 " : ""}
            onSeek={seekToRatio}
          />
          <div
            ref={filmstripRef}
            className="fs-hide-scrollbar"
            style={{ display: "flex", gap: 12, overflowX: "auto", width: "100%", padding: "14px 0", alignItems: "center" }}
            onScroll={handleFilmstripScroll}
          >
            {filmstripPhotos.map((photo, windowIndex) => {
              const i = filmstripWindow.start + windowIndex;
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
          </div>
          {selectionCompletion}
        </footer>

      </div>

      {/* ════ MOBILE (<md): Figma #56109 detail viewer ════ */}
      <div className={`fv-mobile md:hidden fixed inset-0${groupingActive && expandedGroupId ? " fv-group-expanded" : ""}`}>
        <div className="fv-image">
          {viewerSrc ? (
            <div className="fv-image-stage">
              <MobileViewerPinchPhoto
                src={viewerSrc}
                alt={filename}
                /* 사진을 한 번 탭하면 챙뿐 아니라 사진 위 오버레이(체크박스·참가자 마크·선택 테두리)까지
                 * 함께 사라져 "사진만" 남는다 — 집중 모드의 목적이 그것이다. */
                showBadge
                selected={isCurrentSelected}
                onToggleSelect={() => {
                  const result = toggleSelect();
                  if (result === "selected" || result === "deselected") triggerSelectionHaptic("change");
                  if (result === "selected") {
                    setSelectionFeedback((previous) => ({
                      photoId: current.id,
                      key: (previous?.key ?? 0) + 1,
                    }));
                    if (selectionFeedbackTimerRef.current) clearTimeout(selectionFeedbackTimerRef.current);
                    selectionFeedbackTimerRef.current = setTimeout(() => setSelectionFeedback(null), 360);
                  }
                }}
                selectionFlashKey={selectionFeedback?.photoId === current.id ? selectionFeedback.key : 0}
                marks={otherMarkChips}
                onZoomStateChange={(zoomed) => { mobileImageZoomedRef.current = zoomed; }}
                onSingleTap={() => setFocusOpen(true)}
              />
              {filteredPhotos.length > 1 ? (
                <div className="fv-detail-arrows">
                  <PrevNextButton direction="prev" onClick={goPrev} disabled={navAnchorIndex <= 0} size="sm" align="edge" style={{ zIndex: 24 }} />
                  <PrevNextButton direction="next" onClick={goNext} disabled={navAnchorIndex < 0 || navAnchorIndex === filteredPhotos.length - 1} size="sm" align="edge" style={{ zIndex: 24 }} />
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: "#8B8E91", padding: 20 }}>사진 없음</div>
          )}
        </div>

        <div className="fv-top-overlay">
          <header className="fv-appbar">
            <div className="fv-appbar-row">
              <Link className="fv-back" href={galleryHref} scroll={false} aria-label="갤러리로 돌아가기">
                <ArrowLeft size={18} strokeWidth={1.8} />
              </Link>
              {/* 진행 바는 바로 옆 카운터와 같은 사실을 한 번 더 말하면서 위치상 "몇 번째 사진"으로
                * 오독돼 걷어냈다. 파일명도 같이 걷어냈었지만, 격자에서 파일명을 없애면서
                * 앱 전체에 파일명이 남는 곳이 없어져 되살린다 — 작가에게 "이 사진"이라고
                * 짚어 말할 때 쓰는 유일한 번호다. 카운터와 경쟁하지 않도록 PC 헤더와 같은 구성으로
                * (카운터 아래 작은 보조 줄) 둔다. 두 줄을 합쳐도 35px라 앱바 56px 안에 들어간다. */}
              <span className="fv-title">
                <span className="fv-selection-count">
                  <strong>{Y}</strong> / {N}장 선택
                </span>
                <span className="fv-filename" title={filename}>{filename}</span>
              </span>
              {/* 이름·색은 "이 세션에서 내가 누구인가"라 사진마다 바뀌는 값이 아니다 —
                * 사진별 컨트롤 행이 아니라 앱바에 두고, 아래 찜 버튼은 순수 토글로 남긴다.
                * (파일명·진행 바를 걷어내 이 자리가 비어 있다) */}
              {myColor && (
                <button
                  type="button"
                  className={`fv-identity${participant?.initial ? "" : " fv-identity-unnamed"}`}
                  onClick={editMyIdentity}
                  aria-label={
                    participant?.initial
                      ? `내 표시 바꾸기 (현재 ${participant.initial})`
                      : "이름 등록하기 — 다른 참가자에게 색으로만 보여요"
                  }
                >
                  <span className="fv-identity-dot" style={{ background: myColorHex ?? undefined }} />
                  <span>{participant?.initial || "이름"}</span>
                </button>
              )}
            </div>
          </header>
        </div>

        <div
          className="fv-bottom-overlay"
          style={myColorVars}
        >
          {/* 유사컷 멤버 썸네일은 컨트롤 바 "위"에 붙인다 — 아래에 붙이면 바가 화면 끝에서 밀려 올라가
            * 위치가 흔들린다. 위로 열리면 바는 그대로 있고 사진 쪽으로 펼쳐진다. */}
          {groupingActive && expandedGroupId && (
            <div
              ref={mobileFilmstripRef}
              className="fv-filmstrip fs-hide-scrollbar"
              aria-label="유사한 사진 목록"
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
            >
              {mobileGroupMembers.map((photo) => {
                const active = photo.id === activePhotoId;
                const selected = selectedIds.has(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    data-mobile-photo-id={photo.id}
                    className={`fv-thumb${active ? " fv-thumb-active" : ""}${selected ? " fv-thumb-selected" : ""}`}
                    onClick={() => navigateTo(photo.id)}
                    aria-label={`${getPhotoDisplayName(photo)} 상세 보기${active ? ", 현재 사진" : ""}`}
                    aria-current={active ? "true" : undefined}
                  >
                    <img src={photo.url} alt="" loading="lazy" decoding="async" />
                    <span
                      className={`fv-thumb-selected-mark${selected ? " fv-thumb-selected-mark-visible" : ""}${selected && selectionFeedback?.photoId === photo.id ? " fv-thumb-selected-mark-enter" : ""}`}
                      aria-hidden
                    >
                      <Check size={12} strokeWidth={4} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <section
            className="fv-controls"
            aria-label="사진 평가"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
          >
            {/* 위치 표시는 이 행의 "윗변"으로 붙인다 — 별도 행으로 떨어져 있으면 위 컨트롤과
              * 아무 관계 없어 보였다. 유사컷을 펼친 동안은 아래 필름스트립이 위치를 대신 알려주므로 감춘다. */}
            {!(groupingActive && expandedGroupId) && (
              <PhotoPositionBar
                className="fv-position"
                tone="plain"
                ordinal={currentPhotoOrdinal}
                total={totalVisiblePhotos}
                onSeek={seekToRatio}
              />
            )}

            {/* 알약이 나란히 4개면 둥근 테두리가 4겹으로 반복돼 격자처럼 읽혔다 —
              * 껍데기는 이 바 하나가 갖고 내부 컨트롤은 무테로 둔다. */}
            <div className="fv-bar">
            <div className="fv-stars" aria-label="별점">
              {([1, 2, 3, 4, 5] as const).map((value) => {
                const filled = value <= (hoverStar || star || 0);
                const previewing = hoverStar > 0;
                return (
                  <button
                    key={value}
                    type="button"
                    className="fv-star"
                    onClick={() => setStar(value)}
                    onMouseEnter={() => setHoverStar(value)}
                    onMouseLeave={() => setHoverStar(0)}
                    onPointerDown={() => setHoverStar(value)}
                    onPointerUp={() => setHoverStar(0)}
                    aria-label={`${value}점`}
                    aria-pressed={star === value}
                    style={{ color: filled ? (previewing ? "rgba(255, 77, 0, 0.7)" : "#FF4D00") : "#777B7F" }}
                  >
                    <Star size={22} fill={filled ? "currentColor" : "none"} strokeWidth={2} aria-hidden="true" style={{ display: "block", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
            <div className="fv-bar-right">
            {showGroupHint && currentGroup && (
              <button
                type="button"
                className={`fv-group-pill${expandedGroupId === currentGroup.id ? " fv-group-pill-active" : ""}`}
                onClick={() => setGroupExpanded(currentGroup.id, expandedGroupId !== currentGroup.id)}
                aria-label={`유사한 사진 ${currentGroup.photoCount}장 ${expandedGroupId === currentGroup.id ? "닫기" : "보기"}`}
                aria-expanded={expandedGroupId === currentGroup.id}
              >
                <Layers size={16} strokeWidth={1.8} aria-hidden />
                <span>{currentGroup.photoCount}</span>
              </button>
            )}

            {!isCommentEditing && (
              commentSaveStatus === "error" ? (
                <button
                  type="button"
                  className="fv-pill fv-comment-fab fv-comment-fab-error"
                  onClick={saveComment}
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchEnd={(event) => event.stopPropagation()}
                  aria-label="코멘트 저장 실패, 다시 시도"
                >
                  <MessageSquare size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
                  <span className="fv-comment-fab-text">저장 실패 · 재시도</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`fv-pill fv-comment-fab${draftComment.trim() ? " fv-comment-fab-filled" : ""}`}
                  onClick={openCommentEditor}
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchEnd={(event) => event.stopPropagation()}
                  aria-label={draftComment.trim() ? `코멘트 수정: ${draftComment.trim()}` : "코멘트 남기기"}
                >
                  <MessageSquare size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
                  {/* 3글자짜리 잘린 미리보기는 폭만 먹고 못 읽는다 — 유무만 점으로 알리고 내용은 시트에서 본다 */}
                  {draftComment.trim() && <span className="fv-comment-dot" aria-hidden />}
                </button>
              )
            )}

            {/* 다른 참가자 마크는 사진 우측 상단(MobileViewerPinchPhoto marks), 내 이름·색은 앱바 칩에 있다.
              * 여기 남는 건 순수 토글 하나 — 두 구획으로 나눴더니 "신랑 vs 찜함" 택1 라디오로 읽혔다. */}
            <button
              type="button"
              className={`fv-pill fv-mark-toggle${isMarkedByMe ? " fv-mark-toggle-on" : ""}`}
              onClick={toggleMyMark}
              aria-pressed={isMarkedByMe}
              aria-label={isMarkedByMe ? "내 찜 해제" : "내 찜 추가"}
            >
              {/* 알약 안에 또 링(dot)을 두면 동심원이 된다 — 켜짐은 "내 색으로 채워진 배경"으로 알린다.
                * 내 색이 무엇인지는 앱바 신원 칩이 상시 보여주므로 여기서 색을 또 보일 필요가 없다. */}
              <span>{isMarkedByMe ? "찜함" : "찜"}</span>
            </button>
            </div>
            </div>
          </section>
          {selectionCompletion}
        </div>

        {isCommentEditing && (
          <div
            className="fv-comment-sheet"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
          >
            <textarea
              ref={mobileCommentRef}
              autoFocus
              maxLength={COMMENT_MAX_LENGTH}
              value={draftComment}
              onChange={(event) => setDraftComment(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
              onBlur={() => {
                setIsCommentEditing(false);
                saveComment();
              }}
              placeholder="코멘트를 남기세요..."
              aria-label="사진 코멘트"
            />
            <div className="fv-comment-sheet-actions">
              <span aria-live="polite">
                {commentSaveStatus === "saving" ? "저장 중..." : `${draftComment.length}/${COMMENT_MAX_LENGTH}`}
              </span>
              <button
                type="button"
                className="fv-comment-save"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  const commentInput = mobileCommentRef.current;
                  if (commentInput && document.activeElement === commentInput) commentInput.blur();
                  else {
                    saveComment();
                    setIsCommentEditing(false);
                  }
                }}
                aria-label="코멘트 저장"
              >
                <Check size={17} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectionLimitNoticeKey !== null && (
        <SelectionLimitSnackbar
          count={N}
          noticeKey={selectionLimitNoticeKey}
          placement="viewer"
          onViewSelected={showSelectedPhotos}
          onDismiss={() => setSelectionLimitNoticeKey(null)}
        />
      )}

      <PhotoFocusOverlay
        open={focusOpen}
        src={viewerSrc}
        alt={filename}
        onClose={() => setFocusOpen(false)}
        onPrev={goPrevWrap}
        onNext={goNextWrap}
      />

      {participantSheetOpen && (
        <ParticipantSheet
          usedColors={usedColors}
          roster={roster}
          current={participant}
          onClose={() => setParticipantSheetOpen(false)}
          onConfirm={(next) => {
            writeParticipant(token, next);
            setParticipant(next);
            setParticipantSheetOpen(false);
            /* 이름은 다른 참가자에게도 보여야 하므로 공유 명단에 저장한다 */
            setRoster((prev) => ({ ...prev, [next.color]: next.initial }));
            if (project?.id) void saveRosterName(token, project.id, next.color, next.initial);
            /* 찜하려다 열린 경우에만 그 찜을 이어서 적용한다(이름만 고치러 온 경우엔 사진을 건드리지 않는다) */
            if (participantSheetIntent === "mark" && current) toggleColor(current.id, next.color);
          }}
        />
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fs-help" role="dialog" aria-modal="true" aria-label="단축키" onClick={() => setShowShortcuts(false)}>
          <div className="fs-help-card" onClick={(event) => event.stopPropagation()}>
            <h3>단축키</h3>
            <dl>
              <div><dt><kbd>Space</kbd></dt><dd>사진 선택 · 선택 해제</dd></div>
              <div><dt><kbd>1–5</kbd></dt><dd>별점 설정</dd></div>
              <div><dt><kbd>F</kbd></dt><dd>내 찜 표시 · 해제</dd></div>
              <div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>이전 · 다음 사진</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>갤러리로 돌아가기</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>이 도움말 열기 · 닫기</dd></div>
            </dl>
            <button type="button" onClick={() => setShowShortcuts(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* Confirm Selection modal */}
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
  );
}
