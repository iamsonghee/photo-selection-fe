"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, Clipboard, Download,
  Loader2, Sparkles,
} from "lucide-react";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectAssetWorkspaceHeader } from "@/components/photographer/ProjectAssetWorkspaceHeader";
import {
  ProjectAssetMobileContextAction,
  ProjectAssetToolbarButton,
  ProjectAssetMobileSheet,
  ProjectAssetMobileToolbarActions,
  ProjectAssetToolbarViewToggle,
  ProjectAssetWorkspaceToolbar,
} from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { PhotographerPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import { PhotoAnalysisFilterGroup } from "@/components/photographer/PhotoAnalysisFilterGroup";
import { ViewerCommentPanel } from "@/components/photographer/ViewerCommentPanel";
import { ProjectAssetStatusActionBar } from "@/components/photographer/ProjectAssetStatusActionBar";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { useProjectAssetsData } from "@/components/photographer/ProjectAssetsDataProvider";
import { usePriorityImagePreload, matchesFilenameQuery } from "@/lib/gallery-filter";
import { getPhotoDisplayFilename } from "@/lib/photo-display-filename";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { buildGroupsById, buildMembersByGroup, buildPhotoIdSet } from "@/lib/photo-groups";
import { downloadSelectedPhotosToDirectory } from "@/lib/selected-photo-download";
import { useCollapsibleAssetHeader } from "@/hooks/useCollapsibleAssetHeader";
import type { Photo, PhotoGroupInfo } from "@/types";
import styles from "../results/ResultsTheme.module.css";

type ViewMode = "gallery" | "list";
type SortMode = "filename-asc" | "filename-desc" | "comment-first";
type QualityFilter = "eyesClosed" | "blurry";
export type ResultsTab = "original" | "selected";

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getDisplayFilename(photo: Photo) {
  return getPhotoDisplayFilename(photo);
}

export default function ProjectAssetsPageClient({
  activeTab,
  isActive = true,
}: {
  activeTab: ResultsTab;
  isActive?: boolean;
}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const {
    project,
    photos,
    selectedIds,
    photoStates,
    loading,
    error: dataError,
    setProject,
    refreshPhotos,
  } = useProjectAssetsData();
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("filename-asc");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [groupReviewGroupId, setGroupReviewGroupId] = useState<string | null>(null);
  const [groupReviewIndex, setGroupReviewIndex] = useState(0);
  const [representativePendingPhotoId, setRepresentativePendingPhotoId] = useState<string | null>(null);
  const [galleryThumbFocusIndex, setGalleryThumbFocusIndex] = useState<number | null>(null);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroupInfo[]>([]);
  const [similarityVisible, setSimilarityVisible] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [analysisStatus, setAnalysisStatus] = useState<"processing" | "completed" | "failed" | null>(null);
  const [analysisTriggering, setAnalysisTriggering] = useState(false);
  const [qualityByPhotoId, setQualityByPhotoId] = useState<Record<string, Pick<Photo, "isBlurry" | "faceDetected" | "eyesClosed">>>({});
  const [qualityFilter, setQualityFilter] = useState<Set<QualityFilter>>(new Set());
  const [showEditStartModal, setShowEditStartModal] = useState(false);
  const [editStartSubmitting, setEditStartSubmitting] = useState(false);
  const [originalDownloadProgress, setOriginalDownloadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const {
    compact: compactHeader,
    immersive: immersiveHeader,
    handleScroll: handleAssetScroll,
  } = useCollapsibleAssetHeader();

  const loadPhotoGroups = useCallback(async () => {
    try {
      const response = await fetch(`/api/photographer/projects/${id}/photo-groups`);
      if (!response.ok) return;
      const data = await response.json() as { photoGroups?: PhotoGroupInfo[] };
      setPhotoGroups(data.photoGroups ?? []);
    } catch {}
  }, [id]);

  const loadAnalysisStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/photographer/projects/${id}/gemini-analysis`);
      if (!response.ok) return;
      const data = await response.json() as { gemini_analysis_status?: "processing" | "completed" | "failed" | null };
      if (data.gemini_analysis_status !== undefined) setAnalysisStatus(data.gemini_analysis_status);
    } catch {}
  }, [id]);

  useEffect(() => {
    void Promise.all([loadPhotoGroups(), loadAnalysisStatus()]);
  }, [loadAnalysisStatus, loadPhotoGroups]);

  useEffect(() => {
    if (activeTab !== "original") return;
    let cancelled = false;
    fetch(`/api/photographer/projects/${id}/photo-quality`)
      .then((response) => response.ok ? response.json() : null)
      .then((data: { quality?: Record<string, Pick<Photo, "isBlurry" | "faceDetected" | "eyesClosed">> } | null) => {
        if (!cancelled) setQualityByPhotoId(data?.quality ?? {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab, id]);

  useEffect(() => {
    if (analysisStatus !== "processing") return;
    const timer = window.setInterval(() => { void loadAnalysisStatus(); }, 4000);
    return () => window.clearInterval(timer);
  }, [analysisStatus, loadAnalysisStatus]);

  const previousAnalysisStatusRef = useRef(analysisStatus);
  useEffect(() => {
    const previous = previousAnalysisStatusRef.current;
    previousAnalysisStatusRef.current = analysisStatus;
    if (previous !== "processing" || analysisStatus !== "completed") return;
    void Promise.all([
      loadPhotoGroups(),
      refreshPhotos(),
    ]).then(() => setSimilarityVisible(true));
  }, [analysisStatus, loadPhotoGroups, refreshPhotos]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mobileToolsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileToolsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileToolsOpen]);

  const displayPhotos = useMemo(
    () => photos.map((photo) => qualityByPhotoId[photo.id] ? { ...photo, ...qualityByPhotoId[photo.id] } : photo),
    [photos, qualityByPhotoId],
  );
  const selectedPhotos = useMemo(
    () => displayPhotos.filter((photo) => selectedIds.has(photo.id)),
    [displayPhotos, selectedIds],
  );

  const qualityCounts = useMemo(() => ({
    eyesClosed: displayPhotos.filter((photo) => photo.faceDetected === true && photo.eyesClosed === true).length,
    blurry: displayPhotos.filter((photo) => photo.isBlurry === true).length,
  }), [displayPhotos]);
  const toggleQualityFilter = useCallback((filter: QualityFilter) => {
    setQualityFilter((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }, []);

  const ungroupedFilteredPhotos = useMemo(() => {
    const tabPhotos = activeTab === "original" ? displayPhotos : selectedPhotos;
    const next = tabPhotos.filter((photo) => {
      if (!matchesFilenameQuery(getDisplayFilename(photo), query)) return false;
      if (activeTab !== "original" || qualityFilter.size === 0) return true;
      return (qualityFilter.has("blurry") && photo.isBlurry === true)
        || (qualityFilter.has("eyesClosed") && photo.faceDetected === true && photo.eyesClosed === true);
    });
    next.sort((a, b) => {
      if (activeTab === "selected" && sortMode === "comment-first") {
        const aHasComment = Boolean(photoStates[a.id]?.comment?.trim());
        const bHasComment = Boolean(photoStates[b.id]?.comment?.trim());
        if (aHasComment !== bHasComment) return aHasComment ? -1 : 1;
      }
      const compared = getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, {
        numeric: true, sensitivity: "base",
      });
      return sortMode === "filename-desc" ? -compared : compared;
    });
    return next;
  }, [activeTab, displayPhotos, photoStates, qualityFilter, query, selectedPhotos, sortMode]);

  const groupsById = useMemo(() => buildGroupsById(photoGroups), [photoGroups]);
  const membersByGroup = useMemo(() => buildMembersByGroup(displayPhotos), [displayPhotos]);
  const photoIdSet = useMemo(() => buildPhotoIdSet(displayPhotos), [displayPhotos]);
  const filteredPhotos = useMemo(() => {
    if (activeTab !== "original" || !similarityVisible || photoGroups.length === 0) {
      return ungroupedFilteredPhotos;
    }
    const visibleById = new Map(ungroupedFilteredPhotos.map((photo) => [photo.id, photo]));
    const seenGroups = new Set<string>();
    const result: Photo[] = [];
    for (const photo of ungroupedFilteredPhotos) {
      const groupId = photo.similarityGroupId;
      const group = groupId ? groupsById.get(groupId) : undefined;
      if (!groupId || !group || !photoIdSet.has(group.representativePhotoId)) {
        result.push(photo);
        continue;
      }
      if (seenGroups.has(groupId)) continue;
      seenGroups.add(groupId);
      const front = visibleById.get(group.representativePhotoId) ?? photo;
      result.push(front);
      if (expandedGroups.has(groupId)) {
        const members = membersByGroup.get(groupId) ?? [];
        result.push(...members.filter((member) => member.id !== front.id && visibleById.has(member.id)));
      }
    }
    return result;
  }, [activeTab, expandedGroups, groupsById, membersByGroup, photoGroups.length, photoIdSet, similarityVisible, ungroupedFilteredPhotos]);

  /** 상세 뷰어의 전체 필름스트립은 업로드 화면과 동일하게 그룹별 대표컷 하나만 남긴다. */
  const viewerOverviewPhotos = useMemo(() => {
    if (activeTab !== "original") return filteredPhotos;
    const visibleById = new Map(ungroupedFilteredPhotos.map((photo) => [photo.id, photo]));
    const seenGroups = new Set<string>();
    const result: Photo[] = [];

    for (const photo of ungroupedFilteredPhotos) {
      const groupId = photo.similarityGroupId;
      const group = groupId ? groupsById.get(groupId) : undefined;
      if (!groupId || !group || group.photoCount < 2) {
        result.push(photo);
        continue;
      }
      if (seenGroups.has(groupId)) continue;
      seenGroups.add(groupId);
      result.push(visibleById.get(group.representativePhotoId) ?? photo);
    }
    return result;
  }, [activeTab, filteredPhotos, groupsById, ungroupedFilteredPhotos]);

  const inGroupReview = groupReviewGroupId !== null;
  const groupReviewGroup = groupReviewGroupId ? groupsById.get(groupReviewGroupId) : undefined;
  const groupReviewMembers = useMemo(
    () => (groupReviewGroupId ? membersByGroup.get(groupReviewGroupId) ?? [] : []),
    [groupReviewGroupId, membersByGroup],
  );
  const originalViewerPhoto = inGroupReview
    ? groupReviewMembers[groupReviewIndex] ?? null
    : lightboxIndex !== null ? viewerOverviewPhotos[lightboxIndex] ?? null : null;
  const activeOverviewGroup = !inGroupReview && originalViewerPhoto?.similarityGroupId
    ? groupsById.get(originalViewerPhoto.similarityGroupId)
    : undefined;
  const canEnterActiveGroup = !!activeOverviewGroup
    && (membersByGroup.get(activeOverviewGroup.id)?.length ?? activeOverviewGroup.photoCount) > 1;
  const viewerFilmstripPhotos = inGroupReview ? groupReviewMembers : viewerOverviewPhotos;
  const viewerFilmstripIndex = inGroupReview ? groupReviewIndex : lightboxIndex;
  const activeSelectionComment = lightboxIndex !== null
    ? photoStates[filteredPhotos[lightboxIndex]?.id]?.comment?.trim() ?? ""
    : "";

  useEffect(() => {
    if (!groupReviewGroupId) return;
    if (!groupReviewGroup || groupReviewMembers.length < 2) {
      setGroupReviewGroupId(null);
      return;
    }
    setGroupReviewIndex((index) => Math.min(index, groupReviewMembers.length - 1));
  }, [groupReviewGroup, groupReviewGroupId, groupReviewMembers.length]);

  useEffect(() => {
    if (lightboxIndex === null || viewerOverviewPhotos.length === 0) return;
    if (lightboxIndex >= viewerOverviewPhotos.length) setLightboxIndex(viewerOverviewPhotos.length - 1);
  }, [lightboxIndex, viewerOverviewPhotos.length]);

  const handleEnterGroupReview = useCallback((photo?: Photo) => {
    const target = photo ?? originalViewerPhoto;
    if (!target?.similarityGroupId || !groupsById.has(target.similarityGroupId)) return;
    const members = membersByGroup.get(target.similarityGroupId) ?? [];
    const index = members.findIndex((member) => member.id === target.id);
    if (index < 0 || members.length < 2) return;
    setGroupReviewGroupId(target.similarityGroupId);
    setGroupReviewIndex(index);
  }, [groupsById, membersByGroup, originalViewerPhoto]);

  const handleOpenOriginalViewer = useCallback((galleryIndex: number) => {
    const photo = filteredPhotos[galleryIndex];
    if (!photo) return;
    const overviewIndex = viewerOverviewPhotos.findIndex((candidate) =>
      photo.similarityGroupId
        ? candidate.similarityGroupId === photo.similarityGroupId
        : candidate.id === photo.id,
    );
    setLightboxIndex(Math.max(overviewIndex, 0));

    const group = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
    const members = photo.similarityGroupId ? membersByGroup.get(photo.similarityGroupId) ?? [] : [];
    if (group && members.length > 1) {
      setGroupReviewGroupId(group.id);
      setGroupReviewIndex(Math.max(members.findIndex((member) => member.id === photo.id), 0));
    } else {
      setGroupReviewGroupId(null);
    }
  }, [filteredPhotos, groupsById, membersByGroup, viewerOverviewPhotos]);

  const handleCloseOriginalViewer = useCallback(() => {
    if (originalViewerPhoto) {
      const galleryIndex = filteredPhotos.findIndex((photo) => photo.id === originalViewerPhoto.id);
      if (galleryIndex >= 0) setGalleryThumbFocusIndex(galleryIndex);
    }
    setLightboxIndex(null);
    setGroupReviewGroupId(null);
  }, [filteredPhotos, originalViewerPhoto]);

  const handleSetRepresentative = useCallback(async (photoId: string, groupId: string) => {
    setRepresentativePendingPhotoId(photoId);
    try {
      const response = await fetch(`/api/photographer/projects/${id}/photo-groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, representativePhotoId: photoId }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; photoGroup?: PhotoGroupInfo };
      if (!response.ok) throw new Error(data.error ?? "대표컷 설정에 실패했습니다.");
      if (data.photoGroup) {
        setPhotoGroups((current) => current.map((group) => group.id === groupId ? data.photoGroup! : group));
      }
      setToast("대표컷을 변경했습니다.");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "대표컷 설정에 실패했습니다.");
    } finally {
      setRepresentativePendingPhotoId(null);
    }
  }, [id]);

  const photoUrls = useMemo(() => filteredPhotos.map((photo) => photo.url), [filteredPhotos]);
  usePriorityImagePreload(photoUrls, galleryThumbFocusIndex);
  const preloadGroups = useMemo(
    () => filteredPhotos.map((photo) => [viewerImageUrl(photo)]),
    [filteredPhotos],
  );
  useAdjacentImagePreload(preloadGroups, lightboxIndex, {
    wrap: true, desktopBefore: 1, desktopAfter: 2, desktopMaxDecoded: 6, mobileMaxDecoded: 3,
  });

  const commentCount = useMemo(
    () => selectedPhotos.filter((photo) => photoStates[photo.id]?.comment?.trim()).length,
    [photoStates, selectedPhotos],
  );
  const exportBaseName = project
    ? `${sanitizeFilenamePart(project.name || "프로젝트")}_${sanitizeFilenamePart(project.customerName || "고객")}_selections`
    : "selections";

  const handleCopyClipboard = async () => {
    try {
      await navigator.clipboard.writeText(selectedPhotos.map(getDisplayFilename).join("\n"));
      setToast("파일명을 클립보드에 복사했습니다.");
    } catch { setToast("클립보드 복사에 실패했습니다."); }
  };
  const handleDownloadCsv = () => {
    const rows = selectedPhotos.map((photo) => [
      csvEscape(getDisplayFilename(photo)),
      csvEscape(photoStates[photo.id]?.comment?.trim() ?? ""),
    ].join(","));
    downloadTextFile(`${exportBaseName}.csv`, ["파일명,코멘트", ...rows].join("\n"), "text/csv;charset=utf-8");
  };
  const handleDownloadTxt = () => downloadTextFile(
    `${exportBaseName}.txt`, selectedPhotos.map(getDisplayFilename).join("\n"), "text/plain;charset=utf-8",
  );
  const selectedDownloadLabel = project?.includeOriginal ? "셀렉 원본" : "셀렉 프리뷰";
  const selectionIsFinal = project ? !["preparing", "selecting"].includes(project.status) : false;
  const handleDownloadSelectedOriginals = async () => {
    if (!project || !selectionIsFinal || originalDownloadProgress) return;
    try {
      const result = await downloadSelectedPhotosToDirectory({
        projectId: id,
        includeOriginal: project.includeOriginal,
        expectedCount: selectedPhotos.length,
        onDirectoryReady: () => exportMenuRef.current?.removeAttribute("open"),
        onProgress: (completed, total) => setOriginalDownloadProgress({ completed, total }),
      });
      if (!result) return;
      setToast(`${result.downloadKind === "preview" ? "셀렉 프리뷰" : "셀렉 원본"} ${result.fileCount.toLocaleString()}개를 저장했습니다.`);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : `${selectedDownloadLabel} 다운로드에 실패했습니다.`);
    } finally {
      setOriginalDownloadProgress(null);
    }
  };

  const handleSimilarityControl = async () => {
    if (photoGroups.length > 0) {
      const nextVisible = !similarityVisible;
      setSimilarityVisible(nextVisible);
      setToast(nextVisible
        ? `유사컷 ${photoGroups.length.toLocaleString()}개 그룹을 묶어서 표시합니다.`
        : "유사컷 묶음을 해제하고 모든 사진을 표시합니다.");
      return;
    }
    if (analysisStatus === "processing" || analysisTriggering) return;
    setAnalysisTriggering(true);
    try {
      const response = await fetch(`/api/photographer/projects/${id}/gemini-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; detail?: string };
      if (!response.ok) throw new Error(data.error ?? data.detail ?? "유사컷 분석을 시작하지 못했습니다.");
      setAnalysisStatus("processing");
      setToast("유사컷 분석을 시작했습니다.");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "유사컷 분석을 시작하지 못했습니다.");
    } finally {
      setAnalysisTriggering(false);
    }
  };

  const handleGroupBadgeClick = (event: MouseEvent, groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const analysisControlLabel = analysisStatus === "processing"
    ? "유사컷 분석 중"
    : photoGroups.length > 0
      ? similarityVisible ? "유사컷 묶음 해제" : "유사컷 묶어보기"
      : analysisStatus === "completed" ? "유사컷 없음" : "유사컷 분석";
  const activeMobileToolCount = Number(query.trim().length > 0)
    + Number(sortMode !== "filename-asc")
    + (activeTab === "original" ? qualityFilter.size : 0);
  const resetMobileTools = () => {
    setQuery("");
    setSortMode("filename-asc");
    setQualityFilter(new Set());
  };

  const handleEditStartConfirm = async () => {
    setEditStartSubmitting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      setShowEditStartModal(false);
      setProject((current) => current ? { ...current, status: "editing" } : current);
      router.push(`/photographer/projects/${id}/assets/retouched`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "상태 변경 실패");
    } finally { setEditStartSubmitting(false); }
  };

  if (loading) return (
    <div data-photographer-viewport-page className={`${styles.lightTheme} ${styles.page}`} aria-busy="true">
      <PhotographerLightPageFrame className="pb-0">
        <div className={styles.skeletonHeader}>
          <span className={`${styles.skeletonBlock} ${styles.skeletonBreadcrumb}`} />
          <span className={`${styles.skeletonBlock} ${styles.skeletonDescription}`} />
        </div>
        <div className="mt-0 px-2 md:mt-3"><span className={`${styles.skeletonBlock} ${styles.skeletonTabs}`} /></div>
        <div className={styles.skeletonToolbar}><span className={`${styles.skeletonBlock} h-5 w-44`} /><span className={`${styles.skeletonBlock} h-10 w-[420px] max-w-[42vw]`} /></div>
      </PhotographerLightPageFrame>
      <div className={styles.skeletonGallery}>
        {Array.from({ length: 14 }, (_, index) => <div key={index} className={styles.skeletonCard}><span className={`${styles.skeletonBlock} h-4 w-24`} /><span className={`${styles.skeletonBlock} ${styles.skeletonMedia}`} /></div>)}
      </div>
      <span className="sr-only" role="status">원본 갤러리를 불러오는 중입니다.</span>
    </div>
  );
  if (!project) return null;

  const workflowStatuses = ["editing", "reviewing_v1", "editing_v2", "reviewing_v2"];
  const headerAction = project.status === "confirmed"
    ? { label: "보정 시작하기", onClick: () => setShowEditStartModal(true) }
    : workflowStatuses.includes(project.status)
      ? {
          label: project.status === "editing" ? "보정본 업로드" : "보정 작업 보기",
          onClick: () => router.push(`/photographer/projects/${id}/assets/retouched`),
        }
      : null;
  const visibleHeaderAction = activeTab === "selected" ? headerAction : null;

  return (
    <div data-photographer-viewport-page className={`${styles.lightTheme} ${styles.page}`}>
      <ProjectAssetWorkspaceHeader
        project={project}
        activeTab={activeTab}
        originalCount={photos.length}
        selectedCount={selectedPhotos.length}
        compact={compactHeader}
        immersive={immersiveHeader}
      />

      <ProjectAssetWorkspaceToolbar
        ariaLabel={activeTab === "original" ? "원본 갤러리 도구" : "셀렉 결과 도구"}
        compactMobile
        mobileHidden={immersiveHeader}
        leading={activeTab === "original" ? (
          <div className="flex w-full min-w-0 items-center gap-2 text-[16px] font-semibold leading-[29px] tracking-[-0.54px] md:w-auto md:shrink-0">
            <div className="md:hidden">
              {photoGroups.length > 0 ? (
                <PhotoAnalysisFilterGroup
                  similarity={{
                    count: photoGroups.length,
                    checked: similarityVisible,
                    onChange: (checked) => { if (checked !== similarityVisible) void handleSimilarityControl(); },
                  }}
                />
              ) : (
                <ProjectAssetMobileContextAction
                  data-similarity-control
                  faceKind="similarity"
                  onClick={handleSimilarityControl}
                  disabled={analysisTriggering || analysisStatus === "completed"}
                  aria-label={analysisControlLabel}
                  title={analysisControlLabel}
                >
                  {analysisStatus === "processing" || analysisTriggering ? <Loader2 size={14} className="animate-spin text-accent" /> : <Sparkles size={14} className="text-accent" />}
                  <span>{analysisStatus === "processing" || analysisTriggering ? "분석 중" : analysisStatus === "completed" ? "유사컷 없음" : "유사컷"}</span>
                </ProjectAssetMobileContextAction>
              )}
            </div>
            <div className="hidden md:block">
              {photoGroups.length === 0 ? (
                <ProjectAssetToolbarButton
                  data-desktop-similarity-control
                  onClick={handleSimilarityControl}
                  disabled={analysisTriggering || analysisStatus === "completed"}
                  aria-label={analysisControlLabel}
                  title={analysisControlLabel}
                  className="px-4"
                >
                  {analysisStatus === "processing" || analysisTriggering ? <Loader2 size={17} className="animate-spin text-accent" /> : <Sparkles size={17} className="text-accent" />}
                  <span>{analysisControlLabel}</span>
                </ProjectAssetToolbarButton>
              ) : null}
            </div>
            <div className="hidden md:block">
              <PhotoAnalysisFilterGroup
                similarity={photoGroups.length > 0 ? {
                  count: photoGroups.length,
                  checked: similarityVisible,
                  onChange: (checked) => { if (checked !== similarityVisible) void handleSimilarityControl(); },
                } : undefined}
                eyesClosed={qualityCounts.eyesClosed > 0 ? {
                  count: qualityCounts.eyesClosed,
                  checked: qualityFilter.has("eyesClosed"),
                  onChange: () => toggleQualityFilter("eyesClosed"),
                } : undefined}
                blurry={qualityCounts.blurry > 0 ? {
                  count: qualityCounts.blurry,
                  checked: qualityFilter.has("blurry"),
                  onChange: () => toggleQualityFilter("blurry"),
                } : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <strong>선택 {selectedPhotos.length.toLocaleString()}장</strong>
            <span className="hidden text-muted-foreground md:inline">· 요청 {commentCount.toLocaleString()}장</span>
          </div>
        )}
        actions={(
          <div className={styles.toolbarControls}>
            <ProjectAssetMobileToolbarActions
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onOpenTools={() => setMobileToolsOpen(true)}
              toolsOpen={mobileToolsOpen}
              toolCount={activeMobileToolCount}
              toolsLabel="검색 및 정렬 설정"
              onOpenExport={activeTab === "selected" ? () => setMobileExportOpen(true) : undefined}
              exportOpen={mobileExportOpen}
              exportLabel="셀렉 결과 내보내기"
            />
            <div className="hidden md:contents">
              {/* 자주 쓰는 파일명 복사는 다운로드 메뉴를 열지 않고 바로 실행한다. */}
              {activeTab === "selected" ? <ProjectAssetToolbarButton onClick={handleCopyClipboard} disabled={selectedPhotos.length === 0}><Clipboard size={16} />파일명 복사</ProjectAssetToolbarButton> : null}
              <FilenameSearchInput value={query} onChange={setQuery} className={styles.search} />
              <label className={`${styles.control} flex shrink-0 items-center gap-2 px-5`}>
                <span className="sr-only">정렬</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="appearance-none bg-transparent pr-5 text-[14px] outline-none">
                  <option value="filename-asc">정렬 : 파일명순</option>
                  <option value="filename-desc">정렬 : 파일명 역순</option>
                  {activeTab === "selected" ? <option value="comment-first">정렬 : 코멘트 우선</option> : null}
                </select>
                <ChevronDown size={16} className="-ml-5 pointer-events-none text-subtle-foreground" />
              </label>
              <ProjectAssetToolbarViewToggle value={viewMode} onChange={setViewMode} />
              {activeTab === "selected" ? <details ref={exportMenuRef} className={styles.exportMenu}>
                <summary className={`${styles.control} ${styles.exportTrigger} flex cursor-pointer list-none items-center gap-2 px-4`} aria-label="셀렉 결과 내보내기"><Download size={17} /><span>내보내기</span></summary>
                <div className={styles.exportPopover}>
                  <button type="button" className={styles.exportButton} onClick={handleCopyClipboard}><Clipboard size={15} /> 파일명 복사</button>
                  <button type="button" className={styles.exportButton} onClick={handleDownloadCsv}><Download size={15} /> CSV 다운로드</button>
                  <button type="button" className={styles.exportButton} onClick={handleDownloadTxt}><Download size={15} /> TXT 다운로드</button>
                  <div className={styles.exportDivider} />
                  <button
                    type="button"
                    className={`${styles.exportButton} ${styles.exportDownloadButton}`}
                    onClick={() => void handleDownloadSelectedOriginals()}
                    disabled={!selectionIsFinal || selectedPhotos.length === 0 || originalDownloadProgress !== null}
                    title={!selectionIsFinal ? "고객 셀렉 확정 후 이용할 수 있습니다." : undefined}
                  >
                    <Download size={15} className={styles.exportAccentIcon} />
                    <span>
                      <strong>{originalDownloadProgress ? `${selectedDownloadLabel} 저장 중` : `${selectedDownloadLabel} 다운로드`}</strong>
                      <small>
                        {!selectionIsFinal
                          ? "고객 셀렉 확정 후 이용 가능"
                          : project.includeOriginal
                            ? `선택된 ${selectedPhotos.length.toLocaleString()}장 · 업로드 원본 그대로`
                            : `선택된 ${selectedPhotos.length.toLocaleString()}장 · 확인용 최대 1200px JPEG`}
                      </small>
                    </span>
                  </button>
                </div>
              </details> : null}
            </div>
          </div>
        )}
      />

      <ProjectAssetMobileSheet
        open={mobileToolsOpen}
        onClose={() => setMobileToolsOpen(false)}
        title={activeTab === "selected" ? "셀렉 사진 찾기" : "사진 찾기"}
        titleId={`mobile-${activeTab}-tools-title`}
        closeLabel="검색 및 정렬 설정 닫기"
        headerAction={(
          <button
            type="button"
            onClick={resetMobileTools}
            disabled={activeMobileToolCount === 0}
            className="h-9 px-2 text-[12px] font-medium text-muted-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-40"
          >
            초기화
          </button>
        )}
      >
            <div className="space-y-5 py-5">
              <section aria-labelledby="mobile-filename-search-title">
                <h3 id="mobile-filename-search-title" className="mb-2 text-[14px] font-semibold text-foreground">파일명 검색</h3>
                <FilenameSearchInput
                  value={query}
                  onChange={setQuery}
                  style={{ "--fsi-height": "48px", "--fsi-radius": "8px" } as React.CSSProperties}
                />
              </section>

              <section className="border-t border-border-subtle pt-5" aria-labelledby="mobile-sort-title">
                <h3 id="mobile-sort-title" className="mb-2 text-[14px] font-semibold text-foreground">정렬</h3>
                <div className={`grid gap-2 ${activeTab === "selected" ? "grid-cols-3" : "grid-cols-2"}`} role="group" aria-label="사진 정렬 방식">
                  {([
                    ["filename-asc", "파일명순"],
                    ["filename-desc", "파일명 역순"],
                    ...(activeTab === "selected" ? [["comment-first", "코멘트 우선"] as const] : []),
                  ] as ReadonlyArray<readonly [SortMode, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSortMode(value)}
                      aria-pressed={sortMode === value}
                      className={`h-11 rounded-lg border text-[14px] font-semibold transition-colors ${
                        sortMode === value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {activeTab === "original" && (qualityCounts.eyesClosed > 0 || qualityCounts.blurry > 0) ? (
                <section className="border-t border-border-subtle pt-5" aria-labelledby="mobile-quality-title">
                  <h3 id="mobile-quality-title" className="mb-2 text-[14px] font-semibold text-foreground">품질 확인</h3>
                  <PhotoAnalysisFilterGroup
                    layout="grid"
                    eyesClosed={qualityCounts.eyesClosed > 0 ? {
                      count: qualityCounts.eyesClosed,
                      checked: qualityFilter.has("eyesClosed"),
                      onChange: () => toggleQualityFilter("eyesClosed"),
                    } : undefined}
                    blurry={qualityCounts.blurry > 0 ? {
                      count: qualityCounts.blurry,
                      checked: qualityFilter.has("blurry"),
                      onChange: () => toggleQualityFilter("blurry"),
                    } : undefined}
                  />
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">두 항목을 함께 선택하면 둘 중 하나에 해당하는 사진을 표시합니다.</p>
                </section>
              ) : null}

            </div>

            <button
              type="button"
              onClick={() => setMobileToolsOpen(false)}
              className="h-12 w-full rounded-lg bg-accent text-[15px] font-bold text-white transition-colors hover:bg-[#e94b0d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2"
            >
              완료
            </button>
      </ProjectAssetMobileSheet>

      <ProjectAssetMobileSheet
        open={activeTab === "selected" && mobileExportOpen}
        onClose={() => setMobileExportOpen(false)}
        title="셀렉 결과 내보내기"
        titleId="mobile-selected-export-title"
        closeLabel="셀렉 결과 내보내기 닫기"
        subtitle={`선택된 ${selectedPhotos.length.toLocaleString()}장`}
      >
            <div className="grid gap-2 py-5">
              <button type="button" className={styles.mobileExportAction} onClick={() => { void handleCopyClipboard(); setMobileExportOpen(false); }}><Clipboard size={18} />파일명 복사</button>
              <button type="button" className={styles.mobileExportAction} onClick={() => { handleDownloadCsv(); setMobileExportOpen(false); }}><Download size={18} />CSV 다운로드</button>
              <button type="button" className={styles.mobileExportAction} onClick={() => { handleDownloadTxt(); setMobileExportOpen(false); }}><Download size={18} />TXT 다운로드</button>
              <button
                type="button"
                className={`${styles.mobileExportAction} ${styles.mobileExportPrimary}`}
                onClick={() => { setMobileExportOpen(false); void handleDownloadSelectedOriginals(); }}
                disabled={!selectionIsFinal || selectedPhotos.length === 0 || originalDownloadProgress !== null}
              >
                <Download size={18} />
                <span>
                  <strong>{originalDownloadProgress ? `${selectedDownloadLabel} 저장 중` : `${selectedDownloadLabel} 다운로드`}</strong>
                  <small>{!selectionIsFinal ? "고객 셀렉 확정 후 이용 가능" : project.includeOriginal ? "업로드 원본 그대로" : "확인용 최대 1200px JPEG"}</small>
                </span>
              </button>
            </div>
      </ProjectAssetMobileSheet>

      <main
        data-project-asset-scroll
        ref={originalScrollRef}
        onScroll={handleAssetScroll}
        className={styles.resultsScroll}
      >
        {dataError || actionError ? <div className={`${styles.mainFeedback} mb-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger`}>{dataError ?? actionError}</div> : null}
        {filteredPhotos.length === 0 ? (
          <div className={`${styles.mainFeedback} flex min-h-[360px] items-center justify-center rounded-xl border border-border-subtle bg-surface text-[14px] text-muted-foreground`}>
            {query.trim() || qualityFilter.size > 0
              ? "검색 결과가 없습니다."
              : activeTab === "original"
                ? "업로드된 원본 사진이 없습니다."
                : "고객이 선택한 사진이 없습니다."}
          </div>
        ) : (
          <PhotographerPhotoGallery
            scrollRef={originalScrollRef}
            photos={filteredPhotos}
            viewMode={viewMode === "gallery" ? "grid" : "list"}
            thumbQueue={thumbQueue}
            onPhotoClick={activeTab === "original" ? handleOpenOriginalViewer : setLightboxIndex}
            active={isActive}
            readonly
            variant={activeTab === "original" ? "original" : "selection"}
            showQualityBadges={activeTab === "original"}
            mobileMinCols={activeTab === "original" ? 3 : 2}
            mobileGridGap={6}
            showMobileFilename={activeTab === "original"}
            mobileSquareMedia={activeTab === "original"}
            getSecondaryText={activeTab === "selected" ? (photo) => photoStates[photo.id]?.comment?.trim() ?? "" : undefined}
            readableComments
            groupsById={groupsById}
            showSimilarityGroups={activeTab === "original" && similarityVisible}
            expandedGroups={expandedGroups}
            onGroupBadgeClick={handleGroupBadgeClick}
          />
        )}
      </main>

      {(project.status === "selecting" || project.status === "reviewing_v1" || project.status === "reviewing_v2" || project.status === "delivered" || (activeTab === "selected" && visibleHeaderAction)) ? (
        <ProjectAssetStatusActionBar
          project={project}
          maxWidth={1920}
          className="shrink-0"
          mobileFixed
          fallbackLeading={activeTab === "selected" && visibleHeaderAction ? (
            <div>
              <p className="text-[14px] font-bold text-foreground">
                고객 셀렉 {selectedPhotos.length.toLocaleString()}장 확인
                {commentCount > 0 ? <span className="ml-2 text-[12px] font-medium text-[var(--customer-foreground)]">코멘트 {commentCount.toLocaleString()}개</span> : null}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {project.status === "confirmed"
                  ? "선택 결과와 고객 코멘트를 확인한 뒤 보정 작업을 시작하세요."
                  : "현재 보정 단계의 작업 화면으로 이동할 수 있습니다."}
              </p>
            </div>
          ) : undefined}
          fallbackActions={activeTab === "selected" && visibleHeaderAction ? (
            <PhotographerLightButton
              type="button"
              onClick={visibleHeaderAction.onClick}
              className="h-11 min-w-[156px] px-5 py-0 text-[14px]"
            >
              {visibleHeaderAction.label}
            </PhotographerLightButton>
          ) : undefined}
        />
      ) : null}

      <PhotographerModal
        open={showEditStartModal}
        onClose={() => setShowEditStartModal(false)}
        closeDisabled={editStartSubmitting}
        title="보정을 시작할까요?"
        description="고객 셀렉 결과를 확정하고 보정 작업 단계로 이동합니다."
        variant="confirmation"
        maxWidth={412}
        footer={<div className="grid grid-cols-2 gap-2"><PhotographerLightButton type="button" variant="secondary" className="h-14" onClick={() => setShowEditStartModal(false)} disabled={editStartSubmitting}>취소</PhotographerLightButton><PhotographerLightButton type="button" className="h-14" onClick={handleEditStartConfirm} disabled={editStartSubmitting}>{editStartSubmitting ? "처리 중…" : "보정 시작하기"}</PhotographerLightButton></div>}
      >
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
          <div className="flex items-start gap-3"><AlertTriangle size={19} className="mt-0.5 shrink-0 text-accent" /><div><p className="text-[14px] font-semibold leading-[22px] text-foreground">시작 후 셀렉 구성이 고정됩니다.</p><p className="mt-1 text-[13px] leading-[21px] text-muted-foreground">고객은 확정을 취소할 수 없고 선택 사진은 읽기 전용으로 전환됩니다.</p></div></div>
        </div>
      </PhotographerModal>

      {lightboxIndex !== null && (activeTab === "original" ? originalViewerPhoto : filteredPhotos[lightboxIndex]) ? (
        activeTab === "original" ? (
          <OriginalPhotoViewer
            photos={viewerFilmstripPhotos}
            activeIndex={viewerFilmstripIndex ?? 0}
            onActiveIndexChange={(index) => {
              if (inGroupReview) setGroupReviewIndex(index);
              else setLightboxIndex(index);
            }}
            onClose={handleCloseOriginalViewer}
            onPrevious={inGroupReview
              ? () => setGroupReviewIndex((index) => index > 0 ? index - 1 : groupReviewMembers.length - 1)
              : () => setLightboxIndex((index) => index! > 0 ? index! - 1 : viewerOverviewPhotos.length - 1)}
            onNext={inGroupReview
              ? () => setGroupReviewIndex((index) => index < groupReviewMembers.length - 1 ? index + 1 : 0)
              : () => setLightboxIndex((index) => index! < viewerOverviewPhotos.length - 1 ? index! + 1 : 0)}
            reviewMode={inGroupReview}
            showGroupShortcut
            canToggleGroup={canEnterActiveGroup}
            onToggleGroup={inGroupReview ? () => setGroupReviewGroupId(null) : () => handleEnterGroupReview()}
            reviewBar={inGroupReview && groupReviewGroup ? (
              <div className="flex min-h-[52px] items-center justify-between gap-3 px-5 py-2 text-white max-md:min-h-12 max-md:px-3 max-md:py-1.5">
                <div className="flex min-w-0 items-center gap-3 max-md:gap-1.5">
                  <button type="button" className="flex items-center gap-1.5 border-0 bg-transparent px-1 py-1.5 text-[13px] font-semibold text-white" onClick={() => setGroupReviewGroupId(null)}>
                    <ChevronLeft size={16} aria-hidden /> 전체 사진
                  </button>
                  <span className="whitespace-nowrap text-[12px] leading-[18px] text-white/60">유사컷 {groupReviewMembers.length.toLocaleString()}장</span>
                </div>
                {project.status === "selecting" && originalViewerPhoto ? (
                  <button
                    type="button"
                    data-representative-action
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/25 bg-white/[0.06] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:cursor-default disabled:opacity-60 max-md:px-2.5"
                    disabled={representativePendingPhotoId !== null || groupReviewGroup.representativePhotoId === originalViewerPhoto.id}
                    onClick={() => void handleSetRepresentative(originalViewerPhoto.id, groupReviewGroup.id)}
                    aria-label={groupReviewGroup.representativePhotoId === originalViewerPhoto.id
                      ? `${getDisplayFilename(originalViewerPhoto)} 현재 대표컷`
                      : `${getDisplayFilename(originalViewerPhoto)} 대표컷으로 지정`}
                  >
                    {representativePendingPhotoId === originalViewerPhoto.id ? (
                      <><Loader2 size={13} className="animate-spin" aria-hidden /> 변경 중</>
                    ) : groupReviewGroup.representativePhotoId === originalViewerPhoto.id ? (
                      <><Check size={13} aria-hidden /> 대표컷</>
                    ) : "대표컷 지정"}
                  </button>
                ) : null}
              </div>
            ) : undefined}
            onThumbnailClick={(photo, index) => {
              if (inGroupReview) setGroupReviewIndex(index);
              else {
                const group = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
                const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
                if (group && count > 1) handleEnterGroupReview(photo);
                else setLightboxIndex(index);
              }
            }}
            getThumbnailAriaLabel={(photo, index, isActive) => {
              const group = !inGroupReview && photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
              const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
              return group && count > 1
                ? `${getDisplayFilename(photo)} 유사컷 ${count}장 보기`
                : `${index + 1}번째 사진${isActive ? " (현재)" : ""}`;
            }}
            renderThumbnailOverlay={(photo) => {
              const group = !inGroupReview && photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
              const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
              const representative = inGroupReview && groupReviewGroup?.representativePhotoId === photo.id;
              return <>
                {group && count > 1 ? <span className="absolute bottom-[5px] right-[5px] z-[2] inline-flex h-5 min-w-[25px] items-center justify-center rounded-full border border-white/45 bg-[#111315]/80 px-1.5 text-[10px] font-bold text-white">+{(count - 1).toLocaleString()}</span> : null}
                {representative ? <span className="absolute bottom-0.5 left-0.5 z-[2] rounded-[3px] bg-accent px-1 py-px text-[8px] font-bold text-accent-foreground">대표</span> : null}
              </>;
            }}
          />
        ) : (
          <OriginalPhotoViewer
            photos={filteredPhotos}
            activeIndex={lightboxIndex}
            onActiveIndexChange={setLightboxIndex}
            onClose={() => { setGalleryThumbFocusIndex(lightboxIndex); setLightboxIndex(null); }}
            mobileDetailLayout
            mobileComments={[{
              label: "셀렉 코멘트",
              text: activeSelectionComment,
            }]}
            mobileCommentsHeading="셀렉 코멘트"
            inspector={(
              <ViewerCommentPanel
                heading="셀렉 코멘트"
                comments={[{
                  label: "셀렉 코멘트",
                  text: activeSelectionComment,
                }]}
              />
            )}
          />
        )
      ) : null}
      {originalDownloadProgress ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-[100010] min-w-[280px] -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] font-medium text-foreground shadow-lg">
          <p>{selectedDownloadLabel} 저장 중 · {originalDownloadProgress.completed.toLocaleString()} / {originalDownloadProgress.total.toLocaleString()}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${originalDownloadProgress.total > 0 ? (originalDownloadProgress.completed / originalDownloadProgress.total) * 100 : 0}%` }} />
          </div>
        </div>
      ) : toast ? <div role="status" className="fixed bottom-6 left-1/2 z-[100010] -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium text-foreground shadow-lg">{toast}</div> : null}
    </div>
  );
}
