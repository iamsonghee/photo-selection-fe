"use client";

/**
 * S5 — 셀렉 갤러리.
 *
 * 단계 0 조사에서 확인한 대로, 기존 고객 갤러리(GalleryPageClient)는 PC/모바일을 별도
 * 렌더 분기 없이 "하나의 반응형 트리 + CSS"로 처리한다(md:hidden 같은 이중 분기가 0개).
 * 단계 4 고해상도 목업에서는 검토 편의를 위해 PC 전용 구성을 별도로 그렸지만, 실제 코드
 * 단계에서는 이 검증된 기존 방식(반응형 단일 트리)을 따르는 게 더 안전하다고 판단해
 * 그 쪽을 재사용했다 — CSS grid의 auto-fill로 넓은 화면에서 열 수만 늘어난다.
 *
 * 필터링은 기존 `@/lib/gallery-filter`의 순수 함수를 그대로 쓴다(재사용 대상으로 이미 검증됨).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Layers, Share2 } from "lucide-react";
import { getFilteredPhotos, getPhotoDisplayName, type GalleryFilterState, type QualityFilterFlag } from "@/lib/gallery-filter";
import { GalleryDesktopHeader } from "@/components/customer/GalleryDesktopHeader";
import { GalleryMobileFilterSheet } from "@/components/customer/GalleryMobileFilterSheet";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { GalleryMobileToolbar } from "@/components/customer/GalleryMobileToolbar";
import CustomerSelectionViewer, { type CustomerSelectionViewerAdapter } from "@/components/customer/CustomerSelectionViewer";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { useDesktopViewport } from "@/hooks/useDesktopViewport";
import { SelectionContextOverride, type SelectionContextValue } from "@/contexts/SelectionContext";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { ColorTag, Project, SortOrder, StarRating } from "@/types";
import {
  activeParticipants,
  disagreementIds,
  useCustomerSelectStore,
} from "../../_lib/real-store";
import { collapseSimilarityGroups, galleryAnchorPhotoId } from "../../_lib/gallery-view";
import { NicknamePrompt } from "../../_lib/NicknamePrompt";
import { ParticipantAccessEndedScreen, ParticipantJoinScreen } from "../../_lib/ParticipantJoinScreen";
import { EphemeralChat } from "../../_lib/EphemeralChat";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import ui from "../../_lib/ui.module.css";

type Tab = "all" | "selected" | "disagree";

type MobileColumns = 2 | 3 | 4;
type DesktopDensity = "compact" | "standard" | "large";
type GridLayout = { cols: number; gap: number; rowHeight: number };

const DESKTOP_GRID_MIN_CELL: Record<DesktopDensity, number> = { compact: 150, standard: 180, large: 230 };
const DESKTOP_GRID_GAP = 12;
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 4 / 3 },
  3: { gap: 8, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};
export default function CustomerSelectGalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const desktop = useDesktopViewport();
  const { project, hydrated, isOwner, currentIdentity, participantReady, accessDenied, shareUrl, syncStatus, setViewingPhoto, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, saveError, clearSaveError } =
    useCustomerSelectStore();

  const [tab, setTab] = useState<Tab>("all");
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [nameFilter, setNameFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const [starFilter, setStarFilter] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [colorFilter, setColorFilter] = useState<ColorTag[]>([]);
  const [colorFilterMode, setColorFilterMode] = useState<"any" | "all">("any");
  const [qualityFilter, setQualityFilter] = useState<QualityFilterFlag[]>([]);
  const [groupedView, setGroupedView] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [desktopDensity, setDesktopDensity] = useState<DesktopDensity>("standard");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [layout, setLayout] = useState<GridLayout>({ cols: 4, gap: DESKTOP_GRID_GAP, rowHeight: DESKTOP_GRID_MIN_CELL.standard + DESKTOP_GRID_GAP });
  const galleryRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const densityAnchorIdRef = useRef<string | null>(null);
  const restoredPositionKeyRef = useRef("");
  const positionKey = `ps:self-gallery-position:${projectId}`;

  async function handleShare() {
    if (!shareUrl) {
      router.push(`/customer-select/${projectId}/settings#sharing`);
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt("아래 링크를 복사해서 공유하세요", shareUrl);
    }
  }

  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const disagree = useMemo(() => new Set(disagreementIds(project)), [project]);
  const participants = useMemo(() => activeParticipants(project), [project]);
  const onlineParticipants = useMemo(() => new Set(project.onlineParticipants ?? []), [project.onlineParticipants]);
  const viewingNames = useMemo(() => Object.fromEntries(Object.entries(project.participantViews ?? {}).flatMap(([color, photoId]) => {
    const photo = project.photos.find((item) => item.id === photoId);
    return photo ? [[color, getPhotoDisplayName(photo)]] : [];
  })), [project.participantViews, project.photos]);
  const colorLabel = useCallback((color: ColorTag) => color === currentIdentity ? "내 찜" : `${project.participantNicknames[color] || "참가자"} 찜`, [currentIdentity, project.participantNicknames]);
  const colorOptions = useMemo(() => participants.map((participant) => ({ key: participant.id, hex: participant.hex, label: colorLabel(participant.id) })), [participants, colorLabel]);

  const baseList = useMemo(() => {
    if (tab === "selected") return project.photos.filter((p) => selectedIds.has(p.id));
    if (tab === "disagree") return project.photos.filter((p) => disagree.has(p.id));
    return project.photos;
  }, [tab, project.photos, selectedIds, disagree]);

  const filterState = useMemo<GalleryFilterState>(() => ({
    starFilter: starFilter === 0 ? "all" : starFilter as StarRating,
    colorFilter: colorFilter.length ? colorFilter : "all",
    colorFilterMode,
    selectedFilter: "all",
    sortOrder,
    nameFilter,
    qualityFilter,
    groupedView,
  }), [colorFilter, colorFilterMode, groupedView, nameFilter, qualityFilter, sortOrder, starFilter]);
  const filteredList = useMemo(
    () => getFilteredPhotos(baseList, selectedIds, project.photoStates, filterState),
    [baseList, selectedIds, project.photoStates, filterState]
  );
  const groupMembers = useMemo(() => {
    const groups = new Map<string, typeof filteredList>();
    filteredList.forEach((photo) => {
      if (!photo.similarityGroupId) return;
      const members = groups.get(photo.similarityGroupId) ?? [];
      members.push(photo);
      groups.set(photo.similarityGroupId, members);
    });
    return groups;
  }, [filteredList]);
  const similarityGroupCount = useMemo(
    () => Array.from(groupMembers.values()).filter((members) => members.length > 1).length,
    [groupMembers]
  );
  const groupOrdinal = useMemo(() => {
    const ordinals = new Map<string, number>();
    let index = 0;
    groupMembers.forEach((members, groupId) => {
      if (members.length > 1) ordinals.set(groupId, ++index);
    });
    return ordinals;
  }, [groupMembers]);
  const list = useMemo(
    () => groupedView ? collapseSimilarityGroups(filteredList, expandedGroupIds) : filteredList,
    [expandedGroupIds, filteredList, groupedView]
  );

  const disagreeCount = disagreementIds(project).length;
  const target = project.target || 1;
  const selectedCount = project.selectedIds.length;
  const hasBlurryPhotos = project.photos.some((photo) => photo.isBlurry === true);
  const hasEyesClosedPhotos = project.photos.some((photo) => photo.faceDetected === true && photo.eyesClosed === true);
  const qualityFilterSet = useMemo(() => new Set(qualityFilter), [qualityFilter]);
  const activeFilterCount = (starFilter > 0 ? 1 : 0) + colorFilter.length + qualityFilter.length + (nameFilter.trim() ? 1 : 0);

  useEffect(() => {
    if (!hydrated || !participantReady) return;
    const timer = window.setTimeout(() => setViewingPhoto(openPhotoId), 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, openPhotoId, participantReady, setViewingPhoto]);

  useEffect(() => () => setViewingPhoto(null), [setViewingPhoto]);

  const viewerSelection = useMemo<SelectionContextValue>(() => ({
    project: {
      id: project.id,
      name: project.name,
      requiredCount: project.target,
      photoCount: project.photoCount,
      status: "selecting",
    } as Project,
    photos: project.photos,
    photoGroups: [],
    selectedIds,
    photoStates: project.photoStates,
    Y: selectedCount,
    N: project.target,
    toggle: (photoId) => {
      const selected = selectedIds.has(photoId);
      toggleSelect(photoId);
      return selected ? "deselected" : "selected";
    },
    includeRecommendations: async () => "failed",
    selectionSaving: false,
    isSelected: (photoId) => selectedIds.has(photoId),
    updatePhotoState: (photoId, patch) => {
      if ("rating" in patch) setStar(photoId, (patch.rating ?? 0) as StarRating | 0);
      if ("comment" in patch) setComment(photoId, patch.comment ?? "");
    },
    toggleColor: toggleLike,
    projectId,
    projectStatus: "selecting",
    loading: false,
    commentSaveStates: {},
    saveError,
    clearSaveError,
  }), [project, selectedIds, selectedCount, toggleSelect, setStar, setComment, toggleLike, projectId, saveError, clearSaveError]);

  const viewerAdapter = useMemo<CustomerSelectionViewerAdapter | null>(() => openPhotoId ? ({
    token: projectId,
    photoId: openPhotoId,
    participant: {
      color: currentIdentity,
      initial: (project.participantNicknames[currentIdentity] || "나").slice(0, 2),
    },
    roster: project.participantNicknames,
    viewerHref: (photoId) => `#photo-${photoId}`,
    galleryHref: "#",
    onClose: () => setOpenPhotoId(null),
    onReview: () => router.push(`/customer-select/${projectId}/review`),
    onSaveParticipant: (participant) => setNickname(participant.initial),
    canEditFinalSelection: isOwner,
    opinionsForPhoto: (photoId) => Object.entries(project.participantOpinions[photoId] ?? {}).flatMap(([color, opinion]) =>
      opinion && (opinion.rating || opinion.comment) ? [{ color: color as ColorTag, name: project.participantNicknames[color] || "참가자", ...opinion }] : []
    ),
  }) : null, [openPhotoId, projectId, currentIdentity, project.participantNicknames, project.participantOpinions, isOwner, router, setNickname]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const mobile = window.innerWidth <= 767;
      const spec = MOBILE_GRID[mobileColumns];
      const gap = mobile ? spec.gap : DESKTOP_GRID_GAP;
      const cols = mobile ? mobileColumns : Math.max(1, Math.floor((width + gap) / (DESKTOP_GRID_MIN_CELL[desktopDensity] + gap)));
      const cellWidth = (width - gap * (cols - 1)) / cols;
      const rowHeight = Math.ceil(cellWidth / (mobile ? spec.aspect : 1)) + gap;
      setLayout((current) => current.cols === cols && current.gap === gap && current.rowHeight === rowHeight
        ? current
        : { cols, gap, rowHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [desktopDensity, hydrated, mobileColumns]);

  const rowCount = Math.ceil(list.length / layout.cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => galleryRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
    // virtualizer 참조는 렌더마다 달라질 수 있어 실제 행 높이만 추적한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.rowHeight]);

  useEffect(() => {
    galleryRef.current?.scrollTo({ top: 0 });
  }, [tab, nameFilter, sortOrder, starFilter, colorFilter, colorFilterMode, qualityFilter, groupedView]);

  useEffect(() => {
    if (!hydrated || !participantReady || !list.length || restoredPositionKeyRef.current === positionKey) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        let anchorId: string | null = null;
        try { anchorId = sessionStorage.getItem(positionKey); } catch {}
        restoredPositionKeyRef.current = positionKey;
        if (!anchorId) return;
        const index = list.findIndex((photo) => photo.id === anchorId);
        if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / layout.cols), { align: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
    // virtualizer는 렌더마다 새 참조라 실제 복원 조건만 추적한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, participantReady, positionKey, list, layout.cols, layout.rowHeight, mobileColumns, desktopDensity]);

  useEffect(() => {
    try {
      const stored = Number(sessionStorage.getItem(`ps:self-gallery-density:${projectId}`));
      if (stored >= 2 && stored <= 4) setMobileColumns(stored as MobileColumns);
      const desktopStored = sessionStorage.getItem(`ps:self-gallery-desktop-density:${projectId}`);
      if (desktopStored === "compact" || desktopStored === "standard" || desktopStored === "large") setDesktopDensity(desktopStored);
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFiltersOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

  useEffect(() => {
    const anchorId = densityAnchorIdRef.current;
    if (!anchorId || layout.cols !== mobileColumns) return;
    const index = list.findIndex((photo) => photo.id === anchorId);
    densityAnchorIdRef.current = null;
    if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / layout.cols), { align: "start" });
  }, [layout.cols, list, mobileColumns, virtualizer]);

  function applyMobileColumns(next: MobileColumns) {
    const firstRow = virtualizer.getVirtualItems()[0]?.index ?? 0;
    densityAnchorIdRef.current = list[firstRow * layout.cols]?.id ?? null;
    setMobileColumns(next);
    try { sessionStorage.setItem(`ps:self-gallery-density:${projectId}`, String(next)); } catch {}
  }

  function applyDesktopDensity(next: DesktopDensity) {
    setDesktopDensity(next);
    try { sessionStorage.setItem(`ps:self-gallery-desktop-density:${projectId}`, next); } catch {}
  }

  function toggleQuality(flag: QualityFilterFlag) {
    setQualityFilter((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);
  }

  function resetFilters() {
    setStarFilter(0);
    setHoverStar(0);
    setColorFilter([]);
    setColorFilterMode("any");
    setNameFilter("");
    setQualityFilter([]);
  }

  const footerMeta = isOwner
    ? `${selectedCount}장 선택 · 목표 ${target}장`
    : project.participantDone[currentIdentity]
      ? "내 의견을 제출했어요"
      : "찜과 의견을 남긴 뒤 완료해 주세요";

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
  if (!hydrated) {
    return <SystemLoadingScreen title="셀렉 갤러리를 불러오고 있어요" homeHref="/customer-select" />;
  }
  if (accessDenied) return <ParticipantAccessEndedScreen />;
  if (!isOwner && !participantReady) return <ParticipantJoinScreen />;

  return (
    <CustomerSelectShell
      viewportLocked
      compactHeader={!desktop || compactHeader}
      compactTitle={<h1><Link href="/customer-select" className="block max-w-[calc(100vw-72px)] truncate text-[14px] font-bold tracking-[-0.02em] text-foreground hover:text-accent md:max-w-[min(32vw,420px)] md:text-[16px]">{project.name || "이름 없는 프로젝트"}</Link></h1>}
      headerMeta={<div className="flex items-center gap-3"><div className={ui.selectParticipants}>{participants.map((participant) => participant.id === currentIdentity
        ? <NicknamePrompt key={participant.id} hex={participant.hex} isDone={Boolean(project.participantDone[participant.id])} online={onlineParticipants.has(participant.id)} />
        : viewingNames[participant.id] && onlineParticipants.has(participant.id)
          ? <button key={participant.id} type="button" className={`${ui.participantPill} ${ui.participantViewTarget} ${project.participantDone[participant.id] ? ui.participantDone : ""}`} onClick={() => setOpenPhotoId(project.participantViews[participant.id] ?? null)} aria-label={`${participant.name}님이 보는 ${viewingNames[participant.id]} 열기`}><i style={{ background: participant.hex }} />{participant.name} · {viewingNames[participant.id]}<span className={ui.participantOnline}>보는 중</span></button>
          : <span key={participant.id} className={`${ui.participantPill} ${project.participantDone[participant.id] ? ui.participantDone : ""}`}><i style={{ background: participant.hex }} />{participant.name} {project.participantDone[participant.id] ? "완료" : "고르는 중"}{onlineParticipants.has(participant.id) ? <span className={ui.participantOnline}>온라인</span> : null}</span>)}</div><div className={ui.selectHeaderActions}>{participants.length > 1 && <button type="button" className={`${ui.selectHeaderButton} ${ui.selectDoneButton}`} aria-pressed={Boolean(project.participantDone[currentIdentity])} onClick={() => toggleDone(currentIdentity)}><CheckCircle2 size={15} />{project.participantDone[currentIdentity] ? "선택 다시 열기" : "내 선택 완료"}</button>}{isOwner && <button type="button" className={ui.selectHeaderButton} onClick={handleShare}><Share2 size={15} />{project.shareEnabled ? (shareCopied ? "복사됨" : "공유") : "공유 중지됨"}</button>}<div className="gld-selected"><span className="gld-selected-label">선택</span><span className="gld-selected-count">{selectedCount} <span>/ {target}</span></span></div></div></div>}
    >
    <div className={ui.selectWorkspace}>
      {syncStatus !== "connected" && (
        <div role="status" className={syncStatus === "offline" ? "border-b border-danger/20 bg-danger/8 px-5 py-2 text-center text-xs font-semibold text-danger" : "border-b border-border-subtle bg-surface px-5 py-2 text-center text-xs font-semibold text-muted-foreground"}>
          {syncStatus === "offline" ? "연결이 불안정해요. 변경 내용을 다시 동기화하고 있습니다." : "함께 고르는 내용을 동기화하고 있어요…"}
        </div>
      )}
      {saveError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: "#fff0ea", borderBottom: "1px solid #ffd9c2", fontSize: 12.5, color: "#ff4d00", fontWeight: 600 }}>
          <span style={{ flex: 1 }}>{saveError}</span>
          <button type="button" onClick={clearSaveError} style={{ border: "none", background: "transparent", color: "#ff4d00", fontSize: 12.5, fontWeight: 700 }}>
            닫기
          </button>
        </div>
      )}
      <div className={ui.selectFrame}>
        <div className={ui.selectDesktopOnly}>
          <GalleryDesktopHeader
            token={projectId}
            homeHref="/customer-select"
            position="static"
            projectName={project.name || "이름 없는 프로젝트"}
            photographerName={null}
            deadlineLabel="사진 셀렉"
            dDayLabel=""
            dDayTone="time"
            Y={selectedCount}
            N={target}
            recommendedCount={0}
            tabFilter="all"
            onTabFilterChange={() => {}}
            tabs={[
              { value: "all", label: `전체 사진 ${project.photos.length}` },
              { value: "selected", label: `최종 선택 ${selectedCount}` },
              ...(participants.length > 1 ? [{ value: "disagree", label: `의견 갈림 ${disagreeCount}` }] : []),
            ]}
            activeTab={tab}
            onActiveTabChange={(value) => setTab(value as Tab)}
            starFilter={starFilter}
            hoverStar={hoverStar}
            onStarFilterChange={setStarFilter}
            onHoverStarChange={setHoverStar}
            colorFilter={colorFilter}
            usedColors={participants.map((participant) => participant.id)}
            myColor={currentIdentity}
            colorLabel={colorLabel}
            colorFilterMode={colorFilterMode}
            onColorFilterModeChange={setColorFilterMode}
            onColorFilterChange={setColorFilter}
            showSimilarityToggle={similarityGroupCount > 0}
            similarityToggleOn={groupedView}
            onSimilarityToggleChange={(value) => { setGroupedView(value); setExpandedGroupIds(new Set()); }}
            hasBlurryPhotos={hasBlurryPhotos}
            hasEyesClosedPhotos={hasEyesClosedPhotos}
            qualityFilter={qualityFilterSet}
            onToggleQualityFilter={toggleQuality}
            onResetFilters={resetFilters}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            searchValue={nameFilter}
            onSearchValueChange={setNameFilter}
            onJumpToFirst={() => virtualizer.scrollToIndex(0)}
            onJumpToLast={() => virtualizer.scrollToIndex(Math.max(0, rowCount - 1), { align: "end" })}
            densityControl={<div className={ui.selectDesktopDensity} role="group" aria-label="사진 크기">
              {(["compact", "standard", "large"] as const).map((density, index) => <button key={density} type="button" aria-pressed={desktopDensity === density} title={`${["작게", "보통", "크게"][index]} 보기`} onClick={() => applyDesktopDensity(density)}>{["작게", "보통", "크게"][index]}</button>)}
            </div>}
          />
        </div>
        <div className={`${ui.selectHeader} ${compactHeader ? ui.selectHeaderCompact : ""}`}>
          <div className={ui.selectHeaderTop}>
            <div className={ui.selectParticipants}>
              {participants.map((p) => {
                const isDone = project.participantDone[p.id];
                if (p.id === currentIdentity) return <NicknamePrompt key={p.id} hex={p.hex} isDone={Boolean(isDone)} online={onlineParticipants.has(p.id)} />;
                const viewingName = viewingNames[p.id];
                if (viewingName && onlineParticipants.has(p.id)) return <button key={p.id} type="button" className={`${ui.participantPill} ${ui.participantViewTarget} ${isDone ? ui.participantDone : ""}`} onClick={() => setOpenPhotoId(project.participantViews[p.id] ?? null)} aria-label={`${p.name}님이 보는 ${viewingName} 열기`}><i style={{ background: p.hex }} />{p.name} · {viewingName}<span className={ui.participantOnline}>보는 중</span></button>;
                return (
                  <span key={p.id} className={`${ui.participantPill} ${isDone ? ui.participantDone : ""}`}>
                    <i style={{ background: p.hex }} />
                    {p.name} {isDone ? "완료" : "고르는 중"}
                    {onlineParticipants.has(p.id) ? <span className={ui.participantOnline}>온라인</span> : null}
                  </span>
                );
              })}
            </div>
            <div className={ui.selectHeaderActions}>
              {participants.length > 1 ? (
                <button type="button" className={`${ui.selectHeaderButton} ${ui.selectDoneButton}`} aria-pressed={Boolean(project.participantDone[currentIdentity])} onClick={() => toggleDone(currentIdentity)}>
                  <CheckCircle2 size={15} aria-hidden />
                  {project.participantDone[currentIdentity] ? "선택 다시 열기" : "내 선택 완료"}
                </button>
              ) : null}
              {isOwner ? (
                <button type="button" className={ui.selectHeaderButton} onClick={handleShare}>
                  <Share2 size={15} aria-hidden />
                  {project.shareEnabled ? (shareCopied ? "복사됨" : "공유") : "공유 중지됨"}
                </button>
              ) : null}
            </div>
          </div>

          <GalleryMobileToolbar
            compact={compactHeader}
            scopeOptions={[
              { value: "all", label: "전체 사진", count: project.photos.length },
              { value: "selected", label: "최종 선택", count: selectedCount },
              ...(participants.length > 1 ? [{ value: "disagree", label: "의견 갈림", count: disagreeCount }] : []),
            ]}
            scopeValue={tab}
            scopeOpen={scopeOpen}
            onScopeOpenChange={(open) => { setScopeOpen(open); if (open) { setSearchOpen(false); setFiltersOpen(false); } }}
            onScopeChange={(value) => setTab(value as Tab)}
            columns={mobileColumns}
            onColumnsChange={(columns) => { applyMobileColumns(columns); setScopeOpen(false); setSearchOpen(false); setFiltersOpen(false); }}
            extraAction={similarityGroupCount > 0 ? <button type="button" className="gmc-tool-btn" aria-label="유사컷 묶어보기" aria-pressed={groupedView} onClick={() => { setGroupedView((value) => !value); setExpandedGroupIds(new Set()); }}><Layers size={15} /></button> : undefined}
            filtersOpen={filtersOpen}
            onOpenFilters={() => { setFiltersOpen(true); setSearchOpen(false); setScopeOpen(false); }}
            activeFilterCount={activeFilterCount}
            searchOpen={searchOpen}
            onSearchOpenChange={(open) => { setSearchOpen(open); setFiltersOpen(false); setScopeOpen(false); }}
            searchValue={nameFilter}
            onSearchValueChange={setNameFilter}
            activeFilters={[
              ...(starFilter > 0 ? [{ key: "star", label: `${starFilter}점 이상`, icon: "star" as const, onRemove: () => setStarFilter(0) }] : []),
              ...colorFilter.map((color) => ({ key: `color-${color}`, label: colorLabel(color), color: colorOptions.find((option) => option.key === color)?.hex, onRemove: () => setColorFilter((current) => current.filter((item) => item !== color)) })),
              ...(colorFilter.length > 1 && colorFilterMode === "all" ? [{ key: "color-mode", label: "모두 찜", onRemove: () => setColorFilterMode("any") }] : []),
              ...qualityFilter.map((quality) => ({ key: quality, label: quality === "blurry" ? "흐림" : "눈감음", onRemove: () => toggleQuality(quality) })),
              ...(nameFilter.trim() ? [{ key: "search", label: nameFilter.trim(), icon: "search" as const, onRemove: () => setNameFilter("") }] : []),
            ]}
          />
        </div>

        <GalleryMobileFilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} onReset={resetFilters} starFilter={starFilter} onStarFilterChange={setStarFilter} colorFilter={colorFilter} colorOptions={colorOptions} onColorFilterChange={setColorFilter} colorFilterMode={colorFilterMode} onColorFilterModeChange={setColorFilterMode} hasBlurryPhotos={hasBlurryPhotos} hasEyesClosedPhotos={hasEyesClosedPhotos} qualityFilter={qualityFilterSet} onToggleQualityFilter={toggleQuality} />

        <div ref={galleryRef} className={`${ui.selectGallery} gl-density-${mobileColumns}`} onScroll={(event) => {
          const scrollTop = event.currentTarget.scrollTop;
          setCompactHeader(scrollTop > 72);
          if (restoredPositionKeyRef.current !== positionKey) return;
          const anchorId = galleryAnchorPhotoId(list, scrollTop, layout.cols, layout.rowHeight);
          if (anchorId) {
            try { sessionStorage.setItem(positionKey, anchorId); } catch {}
          }
        }}>
          <div ref={gridRef} className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]}`} style={{ height: list.length ? virtualizer.getTotalSize() : "100%" }}>
            {list.length === 0 ? (
              <div className={ui.selectEmpty}>
                <strong>조건에 맞는 사진이 없어요</strong>
                <span>검색어나 필터를 바꿔보세요.</span>
                <button type="button" onClick={() => { setTab("all"); resetFilters(); }}>필터 초기화</button>
              </div>
            ) : virtualizer.getVirtualItems().map((row) => (
              <div key={row.key} className={ui.selectGridRow} style={{ height: Math.max(0, row.size - layout.gap), gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap, transform: `translateY(${row.start}px)` }}>
                {Array.from({ length: layout.cols }, (_, column) => list[row.index * layout.cols + column]).filter(Boolean).map((photo) => {
                  const state = project.photoStates[photo.id];
                  const groupId = photo.similarityGroupId;
                  const members = groupId ? groupMembers.get(groupId) ?? [] : [];
                  const groupExpanded = Boolean(groupId && expandedGroupIds.has(groupId));
                  return (
                    <GalleryPhotoCard
                      key={photo.id}
                      token={projectId}
                      href="#"
                      photo={photo}
                      selected={selectedIds.has(photo.id)}
                      showCheck={isOwner}
                      rating={state?.rating}
                      colorTags={state?.color ?? []}
                      colorLabel={colorLabel}
                      hasComment={Boolean(state?.comment) || Object.values(project.participantOpinions[photo.id] ?? {}).some((opinion) => Boolean(opinion?.comment))}
                      showGroupBadge={groupedView && members.length > 1 && !groupExpanded}
                      groupId={groupId ?? undefined}
                      groupLabel={groupId && groupOrdinal.has(groupId) ? `묶음 ${groupOrdinal.get(groupId)}` : undefined}
                      restCount={Math.max(0, members.length - 1)}
                      totalCount={members.length}
                      selectedCount={members.filter((member) => selectedIds.has(member.id)).length}
                      isGroupExpanded={groupExpanded}
                      inExpandedGroup={groupExpanded}
                      presignedThumb={photo.url}
                      thumbQueue={thumbQueue}
                      viewerQueryString=""
                      density={layout.cols}
                      showFilename={nameFilter.trim().length > 0}
                      onPhotoClick={(event) => { event.preventDefault(); setOpenPhotoId(photo.id); }}
                      onCheckClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleSelect(photo.id); }}
                      onGroupBadgeClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!groupId) return;
                        setExpandedGroupIds((current) => {
                          const next = new Set(current);
                          if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
                          return next;
                        });
                      }}
                      onRate={(photoId, rating) => setStar(photoId, (rating ?? 0) as StarRating | 0)}
                      onThumbError={() => {}}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <SelectionConfirmFooter
          Y={selectedCount}
          N={target}
          position="static"
          disabled={isOwner ? selectedCount === 0 : false}
          onConfirm={() => isOwner ? router.push(`/customer-select/${projectId}/review`) : toggleDone(currentIdentity)}
          buttonLabel={isOwner ? "최종 검토하기" : project.participantDone[currentIdentity] ? "의견 다시 열기" : "내 의견 완료"}
          progressLabel={isOwner ? "선택한 사진" : "최종 선택은 소유자가 결정해요"}
          theme="customerLight"
          mobileGallery
          metaText={footerMeta}
        />
      </div>

      {participants.length > 1 ? <EphemeralChat
        channelKey={project.realtimeKey}
        currentIdentity={currentIdentity}
        nicknames={project.participantNicknames}
        hasRecipient={project.onlineParticipants?.some((color) => color !== currentIdentity) ?? false}
        elevated={Boolean(openPhotoId)}
      /> : null}
      {viewerAdapter && (
        <SelectionContextOverride value={viewerSelection}>
          <CustomerSelectionViewer adapter={viewerAdapter} />
        </SelectionContextOverride>
      )}
    </div>
    </CustomerSelectShell>
  );
}
