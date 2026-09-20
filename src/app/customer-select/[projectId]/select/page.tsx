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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, EyeOff, Grid2X2, Share2, SlidersHorizontal, Star } from "lucide-react";
import { getFilteredPhotos, type GalleryFilterState, type QualityFilterFlag } from "@/lib/gallery-filter";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import CustomerSelectionViewer, { type CustomerSelectionViewerAdapter } from "@/components/customer/CustomerSelectionViewer";
import { PhotoSortSelect } from "@/components/photographer/PhotoSortSelect";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { SimilarityToggleButton } from "@/components/ui/SimilarityToggleButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { SelectionContextOverride, type SelectionContextValue } from "@/contexts/SelectionContext";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Project, SortOrder, StarRating } from "@/types";
import {
  activeParticipants,
  disagreementIds,
  useCustomerSelectStore,
} from "../../_lib/real-store";
import { collapseSimilarityGroups } from "../../_lib/gallery-view";
import { NicknamePrompt } from "../../_lib/NicknamePrompt";
import ui from "../../_lib/ui.module.css";

type Tab = "all" | "selected" | "disagree" | "mine";

type MobileColumns = 2 | 3 | 4;
type GridLayout = { cols: number; gap: number; rowHeight: number };

const DESKTOP_GRID_MIN_CELL = 180;
const DESKTOP_GRID_GAP = 12;
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 4 / 3 },
  3: { gap: 8, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};
const SORT_OPTIONS: ReadonlyArray<{ value: SortOrder; label: string }> = [
  { value: "oldest", label: "번호순" },
  { value: "filename", label: "파일명순" },
  { value: "newest", label: "최신순" },
];

export default function CustomerSelectGalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated, isOwner, currentIdentity, shareUrl, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, saveError, clearSaveError } =
    useCustomerSelectStore();

  const [tab, setTab] = useState<Tab>("all");
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [nameFilter, setNameFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const [starFilter, setStarFilter] = useState<StarRating | "all">("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilterFlag[]>([]);
  const [groupedView, setGroupedView] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [layout, setLayout] = useState<GridLayout>({ cols: 4, gap: DESKTOP_GRID_GAP, rowHeight: DESKTOP_GRID_MIN_CELL + DESKTOP_GRID_GAP });
  const galleryRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
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

  const baseList = useMemo(() => {
    if (tab === "selected") return project.photos.filter((p) => selectedIds.has(p.id));
    if (tab === "disagree") return project.photos.filter((p) => disagree.has(p.id));
    if (tab === "mine") return project.photos.filter((p) => project.photoStates[p.id]?.color?.includes(currentIdentity));
    return project.photos;
  }, [tab, project.photos, project.photoStates, selectedIds, disagree, currentIdentity]);

  const filterState = useMemo<GalleryFilterState>(() => ({
    starFilter,
    colorFilter: "all",
    colorFilterMode: "any",
    selectedFilter: "all",
    sortOrder,
    nameFilter,
    qualityFilter,
    groupedView,
  }), [groupedView, nameFilter, qualityFilter, sortOrder, starFilter]);
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
  const myLikeCount = Object.values(project.photoStates).filter((s) => s.color?.includes(currentIdentity)).length;
  const target = project.target || 1;
  const selectedCount = project.selectedIds.length;
  const hasBlurryPhotos = project.photos.some((photo) => photo.isBlurry === true);
  const hasEyesClosedPhotos = project.photos.some((photo) => photo.faceDetected === true && photo.eyesClosed === true);

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
  }) : null, [openPhotoId, projectId, currentIdentity, project.participantNicknames, router, setNickname]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const mobile = window.innerWidth <= 767;
      const spec = MOBILE_GRID[mobileColumns];
      const gap = mobile ? spec.gap : DESKTOP_GRID_GAP;
      const cols = mobile ? mobileColumns : Math.max(1, Math.floor((width + gap) / (DESKTOP_GRID_MIN_CELL + gap)));
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
  }, [hydrated, mobileColumns]);

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
  }, [tab, nameFilter, sortOrder, starFilter, qualityFilter, groupedView, mobileColumns]);

  function toggleQuality(flag: QualityFilterFlag) {
    setQualityFilter((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);
  }

  const footerMeta = selectedCount < target
    ? `목표보다 ${target - selectedCount}장 적어요`
    : selectedCount > target
      ? `목표보다 ${selectedCount - target}장 많아요`
      : "목표 수에 맞게 골랐어요";

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
  if (!hydrated) {
    return <SystemLoadingScreen title="셀렉 갤러리를 불러오고 있어요" homeHref="/customer-select" />;
  }

  return (
    <div className={ui.selectWorkspace}>
      <NicknamePrompt projectId={projectId} />
      {saveError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: "#fff0ea", borderBottom: "1px solid #ffd9c2", fontSize: 12.5, color: "#ff4d00", fontWeight: 600 }}>
          <span style={{ flex: 1 }}>{saveError}</span>
          <button type="button" onClick={clearSaveError} style={{ border: "none", background: "transparent", color: "#ff4d00", fontSize: 12.5, fontWeight: 700 }}>
            닫기
          </button>
        </div>
      )}
      <div className={ui.selectFrame}>
        <div className={`${ui.selectHeader} ${compactHeader ? ui.selectHeaderCompact : ""}`}>
          <div className={ui.selectHeaderTop}>
            <div className={ui.selectTitleGroup}>
              <Link href="/customer-select" className={ui.selectBrandLink} aria-label="셀프 고객 메인으로 이동">
                <span className={ui.selectBrandMark} aria-hidden>A</span>
              </Link>
              <div>
                <span className={ui.selectEyebrow}>사진 셀렉</span>
                <strong className={ui.selectProjectName}>{project.name || "이름 없는 프로젝트"}</strong>
              </div>
            </div>
            <div className={ui.selectParticipants}>
              {participants.map((p) => {
                const isDone = project.participantDone[p.id];
                return (
                  <span key={p.id} className={`${ui.participantPill} ${isDone ? ui.participantDone : ""}`}>
                    <i style={{ background: p.hex }} />
                    {p.name} {isDone ? "완료" : "고르는 중"}
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
                  {shareCopied ? "복사됨" : "공유"}
                </button>
              ) : null}
            </div>
          </div>

          <div className={ui.selectToolbarMain}>
            <div className={ui.selectTabs} role="group" aria-label="사진 보기 범위">
              <button type="button" aria-pressed={tab === "all"} className={`${ui.chip} ${tab === "all" ? ui.chipOn : ""}`} onClick={() => setTab("all")}>전체 {project.photos.length}</button>
              <button type="button" aria-pressed={tab === "selected"} className={`${ui.chip} ${tab === "selected" ? ui.chipOn : ""}`} onClick={() => setTab("selected")}>선택 {selectedCount}</button>
              {participants.length > 1 ? <button type="button" aria-pressed={tab === "disagree"} className={`${ui.chip} ${tab === "disagree" ? ui.chipOn : ""}`} onClick={() => setTab("disagree")}>의견 갈림 {disagreeCount}</button> : null}
              <button type="button" aria-pressed={tab === "mine"} className={`${ui.chip} ${tab === "mine" ? ui.chipOn : ""}`} onClick={() => setTab("mine")}>내 찜 {myLikeCount}</button>
            </div>
            <div className={ui.selectMobileTools}>
              <button type="button" className={ui.selectIconButton} aria-label={`현재 ${mobileColumns}열, 사진 크기 변경`} onClick={() => setMobileColumns((value) => value === 4 ? 2 : (value + 1) as MobileColumns)}>
                <Grid2X2 size={17} aria-hidden /><span>{mobileColumns}</span>
              </button>
              <button type="button" className={`${ui.selectIconButton} ${filtersOpen ? ui.selectIconButtonOn : ""}`} aria-label="검색 및 필터" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
                <SlidersHorizontal size={17} aria-hidden />
              </button>
            </div>
          </div>

          <div className={`${ui.selectFilterTools} ${filtersOpen ? ui.selectFilterToolsOpen : ""}`}>
            <FilenameSearchInput value={nameFilter} onChange={setNameFilter} className={ui.selectSearch} style={{ "--fsi-width": "220px" } as React.CSSProperties} />
            <PhotoSortSelect value={sortOrder} options={SORT_OPTIONS} onChange={setSortOrder} />
            <div className={ui.selectStarFilter} role="group" aria-label="별점 필터">
              {([1, 2, 3, 4, 5] as const).map((star) => (
                <button key={star} type="button" aria-label={`별점 ${star}점 이상`} aria-pressed={starFilter === star} onClick={() => setStarFilter((current) => current === star ? "all" : star)}>
                  <Star size={17} fill={starFilter !== "all" && star <= starFilter ? "currentColor" : "none"} aria-hidden />
                </button>
              ))}
            </div>
            {hasBlurryPhotos ? <button type="button" className={`${ui.selectFilterButton} ${qualityFilter.includes("blurry") ? ui.selectFilterButtonOn : ""}`} aria-pressed={qualityFilter.includes("blurry")} onClick={() => toggleQuality("blurry")}><AlertTriangle size={14} aria-hidden />흐림</button> : null}
            {hasEyesClosedPhotos ? <button type="button" className={`${ui.selectFilterButton} ${qualityFilter.includes("eyesClosed") ? ui.selectFilterButtonOn : ""}`} aria-pressed={qualityFilter.includes("eyesClosed")} onClick={() => toggleQuality("eyesClosed")}><EyeOff size={14} aria-hidden />눈감음</button> : null}
            {similarityGroupCount > 0 ? <SimilarityToggleButton active={groupedView} count={similarityGroupCount} size="compact" onClick={() => { setGroupedView((value) => !value); setExpandedGroupIds(new Set()); }} /> : null}
          </div>
        </div>

        <div ref={galleryRef} className={ui.selectGallery} onScroll={(event) => setCompactHeader(event.currentTarget.scrollTop > 72)}>
          <div ref={gridRef} className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]}`} style={{ height: list.length ? virtualizer.getTotalSize() : "100%" }}>
            {list.length === 0 ? (
              <div className={ui.selectEmpty}>
                <strong>조건에 맞는 사진이 없어요</strong>
                <span>검색어나 필터를 바꿔보세요.</span>
                <button type="button" onClick={() => { setTab("all"); setNameFilter(""); setStarFilter("all"); setQualityFilter([]); }}>필터 초기화</button>
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
                      rating={state?.rating}
                      colorTags={state?.color ?? []}
                      hasComment={Boolean(state?.comment)}
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
          disabled={selectedCount === 0}
          onConfirm={() => router.push(`/customer-select/${projectId}/review`)}
          buttonLabel="최종 검토하기"
          progressLabel="선택한 사진"
          theme="customerLight"
          mobileGallery
          metaText={footerMeta}
        />
      </div>

      {viewerAdapter && (
        <SelectionContextOverride value={viewerSelection}>
          <CustomerSelectionViewer adapter={viewerAdapter} />
        </SelectionContextOverride>
      )}
    </div>
  );
}
