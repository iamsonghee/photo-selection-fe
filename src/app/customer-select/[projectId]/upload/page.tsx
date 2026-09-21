"use client";

/**
 * S4 — 사진 업로드. 원본 파일명은 유지하되, 전송 전 브라우저에서 해상도·용량을 줄인다 —
 * 작가 업로드 화면이 쓰는 압축 유틸(upload-client-compress.ts)이 identity 비의존이라
 * 그대로 재사용한다(단계 0 분석 결과). 압축된 결과만 BE로 전송, 썸네일·프리뷰 생성은 BE 담당.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ImagePlus, Loader2, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { AiAnalysisPromptModal } from "@/components/photographer/AiAnalysisPromptModal";
import { PhotographerPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import { PhotoSortSelect } from "@/components/photographer/PhotoSortSelect";
import { ProjectAssetToolbarSummary } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { getPhotoDisplayName, matchesFilenameQuery } from "@/lib/gallery-filter";
import { estimateUploadRemainingSeconds, formatUploadRemainingTime, type UploadTimingSample } from "@/lib/upload-time-estimate";
import { useCollapsibleAssetHeaderController } from "@/hooks/useCollapsibleAssetHeader";
import type { Photo, PhotoGroupInfo } from "@/types";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { useCustomerSelectStore } from "../../_lib/real-store";

const BATCH_SIZE = 20;
const MAX_PHOTOS = 2000;
// ponytail: 작가 화면의 PC/모바일 적응형 동시성 대신 보수적인 고정값 하나만 쓴다.
// 단말별 실측에서 병목이 확인되면 그때 분리한다.
const COMPRESS_POOL_SIZE = 3;

export default function CustomerUploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated, refresh } = useCustomerSelectStore();
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"compressing" | "uploading" | null>(null);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiWantSimilar, setAiWantSimilar] = useState(true);
  const [aiWantQuality, setAiWantQuality] = useState(false);
  const [aiStarting, setAiStarting] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [sort, setSort] = useState<"order-asc" | "order-desc" | "name-asc">("order-asc");
  const [nameFilter, setNameFilter] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const deleteSelectedPhotosRef = useRef<() => Promise<void>>(async () => {});
  const uploadAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const uploadTimingSamplesRef = useRef<UploadTimingSample[]>([]);
  const { compact: compactHeader, handleScroll: handleGalleryScroll } = useCollapsibleAssetHeaderController({ compactOnly: true });

  useEffect(() => () => {
    uploadAbortRef.current?.abort();
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  function clearPendingPreviews() {
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
    previewUrlsRef.current = [];
    setPendingPhotos([]);
  }

  async function handleFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0 || uploading) return;
    const remainingCapacity = Math.max(0, MAX_PHOTOS - project.photoCount);
    if (selectedFiles.length > remainingCapacity) {
      setError(`현재 ${project.photoCount.toLocaleString()}장입니다. ${remainingCapacity.toLocaleString()}장까지 추가할 수 있어요.`);
      return;
    }
    setUploading(true);
    setError(null);
    setRetryFiles([]);
    setTotal(selectedFiles.length);
    setProgress(0);
    setUploadPhase("compressing");
    setEstimatedRemainingSeconds(null);
    uploadTimingSamplesRef.current = [];
    clearPendingPreviews();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    cancelRequestedRef.current = false;
    const pending = selectedFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return {
        id: `pending-${crypto.randomUUID()}`,
        projectId,
        orderIndex: project.photoCount + index,
        url,
        previewUrl: url,
        originalFilename: file.name,
        sourceFileSize: file.size,
        isPending: true,
        isUploading: false,
      } satisfies Photo;
    });
    setPendingPhotos(pending);

    const {
      data: { session },
    } = await createClient().auth.getSession();
    const authHeader: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    let uploaded = 0;
    const failedFiles: File[] = [];
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const batchStartedAt = performance.now();
      const rawBatch = selectedFiles.slice(i, i + BATCH_SIZE);
      const batchIds = new Set(pending.slice(i, i + BATCH_SIZE).map((photo) => photo.id));
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: true } : photo));

      let batch: File[];
      setUploadPhase("compressing");
      try {
        batch = await compressImagesInParallel(
          rawBatch,
          controller.signal,
          COMPRESS_POOL_SIZE,
          { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
        );
      } catch {
        batch = rawBatch; // 압축 실패 시 원본 그대로 업로드(작가 화면과 동일한 폴백 원칙)
      }

      const formData = new FormData();
      formData.append("project_id", projectId);
      batch.forEach((f) => formData.append("files", f));
      setUploadPhase("uploading");
      try {
        const res = await fetch("/api/customer-select/upload/photos", { method: "POST", headers: authHeader, body: formData, signal: controller.signal });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = data.detail;
          const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
          throw new Error(msg ?? "업로드 실패");
        }
        const data = await res.json() as { uploaded?: number; rejected?: string[] };
        const rejectedNames = new Set(data.rejected ?? []);
        failedFiles.push(...rawBatch.filter((file) => rejectedNames.has(file.name)));
        uploaded += data.uploaded ?? Math.max(0, batch.length - rejectedNames.size);
      } catch (e) {
        const remainingFiles = selectedFiles.slice(i);
        setRetryFiles(remainingFiles);
        setError(cancelRequestedRef.current
          ? `업로드를 중단했습니다. 남은 ${remainingFiles.length.toLocaleString()}장을 다시 시도할 수 있어요.`
          : e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
        setUploading(false);
        setUploadPhase(null);
        setEstimatedRemainingSeconds(null);
        uploadAbortRef.current = null;
        await refresh();
        clearPendingPreviews();
        return;
      }
      uploadTimingSamplesRef.current = [
        ...uploadTimingSamplesRef.current,
        { milliseconds: performance.now() - batchStartedAt, photoCount: rawBatch.length },
      ].slice(-3);
      setEstimatedRemainingSeconds(estimateUploadRemainingSeconds(
        uploadTimingSamplesRef.current,
        selectedFiles.length - i - rawBatch.length
      ));
      setProgress(uploaded);
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: false } : photo));
    }
    await refresh();
    clearPendingPreviews();
    setUploading(false);
    setUploadPhase(null);
    setEstimatedRemainingSeconds(null);
    uploadAbortRef.current = null;
    setRetryFiles(failedFiles);
    if (failedFiles.length > 0) {
      setError(`${uploaded.toLocaleString()}장은 업로드했고 ${failedFiles.length.toLocaleString()}장은 처리하지 못했습니다.`);
    } else if (uploaded > 0) {
      setAiPromptOpen(true);
    }
  }

  function cancelUpload() {
    cancelRequestedRef.current = true;
    uploadAbortRef.current?.abort();
  }

  async function startAiAnalysis() {
    setAiStarting(true);
    try {
      const requests = [
        aiWantSimilar && fetch(`/api/customer-select/projects/${projectId}/ai/similarity`, { method: "POST" }),
        aiWantQuality && fetch(`/api/customer-select/projects/${projectId}/ai/quality`, { method: "POST" }),
      ].filter(Boolean) as Promise<Response>[];
      const responses = await Promise.all(requests);
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        throw new Error(data.error ?? data.detail ?? "분석 시작 실패");
      }
      setAiPromptOpen(false);
      setAiAnalyzing(true);
      void pollAiAnalysis([aiWantSimilar && "similarity", aiWantQuality && "quality"].filter(Boolean) as string[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 분석을 시작하지 못했습니다.");
    } finally {
      setAiStarting(false);
    }
  }

  async function pollAiAnalysis(kinds: string[]) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const statuses = await Promise.all(kinds.map(async (kind) => {
        const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`);
        if (!response.ok) return "failed";
        return (await response.json()).status as string | null;
      }));
      if (statuses.every((status) => status !== "processing")) {
        setAiAnalyzing(false);
        await refresh();
        if (statuses.includes("failed")) setError("일부 AI 분석을 완료하지 못했습니다.");
        return;
      }
    }
    setAiAnalyzing(false);
  }

  async function deleteSelectedPhotos() {
    if (!selectedPhotoIds.size || !window.confirm(`선택한 사진 ${selectedPhotoIds.size.toLocaleString()}장을 삭제할까요?`)) return;
    setDeleting(true);
    setError(null);
    const {
      data: { session },
    } = await createClient().auth.getSession();
    try {
      const res = await fetch("/api/customer-select/upload/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ project_id: projectId, photo_ids: [...selectedPhotoIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "사진 삭제 실패");
      setSelectedPhotoIds(new Set());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }
  deleteSelectedPhotosRef.current = deleteSelectedPhotos;

  useEffect(() => {
    if (uploading || deleting || aiPromptOpen || viewerPhotoId) return;
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPhotoIds(new Set(project.photos.map((photo) => photo.id)));
        return;
      }
      if (hasShortcutModifier(event)) return;
      if (event.key === "Escape" && selectedPhotoIds.size) {
        event.preventDefault();
        setSelectedPhotoIds(new Set());
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedPhotoIds.size) {
        event.preventDefault();
        void deleteSelectedPhotosRef.current();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [aiPromptOpen, deleting, project.photos, selectedPhotoIds, uploading, viewerPhotoId]);

  useEffect(() => {
    if (!uploading) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [uploading]);

  const displayName = project.name || "이름 없는 프로젝트";
  const displayedPhotos = useMemo(() => [...project.photos, ...pendingPhotos], [project.photos, pendingPhotos]);
  const sortedPhotos = useMemo(() => [...displayedPhotos].sort((a, b) => {
    if (sort === "order-desc") return b.orderIndex - a.orderIndex;
    if (sort === "name-asc") return (a.originalFilename ?? "").localeCompare(b.originalFilename ?? "", "ko", { numeric: true });
    return a.orderIndex - b.orderIndex;
  }), [displayedPhotos, sort]);
  const visiblePhotos = useMemo(
    () => nameFilter.trim() ? sortedPhotos.filter((photo) => matchesFilenameQuery(getPhotoDisplayName(photo), nameFilter)) : sortedPhotos,
    [nameFilter, sortedPhotos]
  );
  const viewerPhotos = visiblePhotos.filter((photo) => !photo.isPending);
  const groupsById = useMemo(() => {
    const groups = new Map<string, PhotoGroupInfo>();
    for (const photo of visiblePhotos) {
      if (!photo.similarityGroupId) continue;
      const group = groups.get(photo.similarityGroupId);
      if (group) group.photoCount += 1;
      else groups.set(photo.similarityGroupId, { id: photo.similarityGroupId, representativePhotoId: photo.id, photoCount: 1 });
    }
    return groups;
  }, [visiblePhotos]);
  const viewerIndex = viewerPhotoId ? viewerPhotos.findIndex((photo) => photo.id === viewerPhotoId) : -1;
  const uploadStatus = uploading ? (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <Loader2 size={22} className="shrink-0 animate-spin text-accent" aria-hidden />
      <div>
        <p className="text-sm font-bold text-foreground">{uploadPhase === "compressing" ? "사진 압축 중" : "사진 업로드 중"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{progress.toLocaleString()} / {total.toLocaleString()}장 · {total ? Math.round((progress / total) * 100) : 0}% · {estimatedRemainingSeconds === null ? "예상 시간 계산 중" : formatUploadRemainingTime(estimatedRemainingSeconds)}</p>
      </div>
    </div>
  ) : (
    <div>
      <p className="text-sm font-bold text-foreground">사진 {project.photoCount.toLocaleString()}장</p>
      <p className="mt-1 text-xs text-muted-foreground">업로드한 순서와 원본 파일명은 그대로 유지됩니다.</p>
    </div>
  );

  if (!hydrated) {
    return (
      <CustomerSelectShell viewportLocked>
        <main className="grid flex-1 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></main>
      </CustomerSelectShell>
    );
  }

  return (
    <CustomerSelectShell viewportLocked>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void handleFiles(files);
        }} />

        <header data-upload-header-mode={compactHeader ? "compact" : "expanded"} className={`shrink-0 overflow-hidden border-b border-border-subtle bg-background px-4 transition-[padding] duration-200 md:px-8 ${compactHeader ? "py-1" : "py-3"}`}>
          <div className="mx-auto flex max-w-[1504px] items-center gap-3">
            <button type="button" onClick={() => router.push("/customer-select")} className={`grid shrink-0 place-items-center rounded-lg text-muted-foreground transition-[width,height] hover:bg-surface-raised hover:text-foreground ${compactHeader ? "size-9" : "size-10"}`} aria-label="프로젝트 목록으로"><ChevronLeft size={19} /></button>
            <div className="min-w-0 flex-1">
              <h1 className={`truncate font-bold text-foreground transition-[font-size] ${compactHeader ? "text-[14px]" : "text-[18px] md:text-[20px]"}`}>{displayName}</h1>
              {!compactHeader ? <p className="mt-0.5 text-[12px] text-muted-foreground">사진 업로드 · {Math.max(0, MAX_PHOTOS - project.photoCount).toLocaleString()}장 추가 가능</p> : null}
            </div>
            <PhotographerLightButton variant="outline" size="toolbar" className="max-md:size-11 max-md:px-0" onClick={() => setAiPromptOpen(true)} disabled={uploading || project.photoCount === 0 || aiAnalyzing} aria-label={aiAnalyzing ? "AI 분석 중" : "AI 분석 시작"}><Sparkles size={16} /><span className="max-md:hidden">{aiAnalyzing ? "분석 중" : "AI 분석"}</span></PhotographerLightButton>
            <PhotographerLightButton variant="outline" size="toolbar" className="max-md:px-3" onClick={() => inputRef.current?.click()} disabled={uploading}><ImagePlus size={16} />사진 추가</PhotographerLightButton>
          </div>
        </header>

        <div className="shrink-0 border-b border-border-subtle bg-surface px-4 md:px-8">
          <div className="mx-auto flex min-h-12 max-w-[1504px] items-center justify-between gap-3 py-1.5 max-md:flex-wrap max-md:gap-1.5">
            <ProjectAssetToolbarSummary label="업로드 사진" count={nameFilter.trim() ? `${visiblePhotos.length.toLocaleString()} / ${displayedPhotos.length.toLocaleString()}장` : `${displayedPhotos.length.toLocaleString()}장`} meta={uploading ? `${progress.toLocaleString()} / ${total.toLocaleString()}장 처리 중` : aiAnalyzing ? "AI 분석 중" : undefined} />
            <div className="flex min-w-0 items-center gap-1.5 max-md:w-full">
              <FilenameSearchInput value={nameFilter} onChange={setNameFilter} placeholder="파일명 검색" className="max-md:flex-1" style={{ "--fsi-width": "220px" } as React.CSSProperties} />
              <PhotoSortSelect value={sort} onChange={setSort} options={[{ value: "order-asc", label: "업로드 순" }, { value: "order-desc", label: "최근 순" }, { value: "name-asc", label: "파일명 순" }]} />
            </div>
          </div>
        </div>

        {error ? <p role="alert" className="shrink-0 border-b border-danger/20 bg-danger/8 px-5 py-2.5 text-[13px] font-semibold text-danger md:px-8">{error}</p> : null}

        <main
          ref={galleryScrollRef}
          tabIndex={-1}
          aria-label="업로드 사진 갤러리"
          className="relative min-h-0 flex-1 overflow-y-auto bg-background"
          onPointerDownCapture={(event) => {
            if (event.target instanceof Element && !event.target.closest("article, button, input, select, a")) event.currentTarget.focus({ preventScroll: true });
          }}
          onScroll={handleGalleryScroll}
          onDragEnter={(event) => { event.preventDefault(); if (!uploading) setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!uploading) void handleFiles(Array.from(event.dataTransfer.files)); }}
        >
          {dragActive ? <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-background/90 text-center shadow-lg"><span><UploadCloud className="mx-auto mb-3 text-accent" size={30} /><strong className="text-base text-foreground">여기에 놓아 사진 추가</strong></span></div> : null}
          {displayedPhotos.length === 0 ? (
            <div className="grid min-h-full place-items-center p-5">
              <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-[260px] w-full max-w-[720px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface text-center transition-colors hover:border-accent/45 hover:bg-surface-raised/45">
                <span className="grid size-14 place-items-center rounded-2xl bg-customer-soft text-primary"><UploadCloud size={26} strokeWidth={1.8} /></span>
                <span><strong className="block text-[16px] text-foreground">사진을 끌어다 놓거나 선택하세요</strong><small className="mt-1.5 block text-[13px] text-muted-foreground">JPG · PNG · WebP · HEIC</small></span>
              </button>
            </div>
          ) : visiblePhotos.length === 0 ? (
            <div className="grid min-h-full place-items-center p-5 text-center text-sm text-muted-foreground">
              <div><strong className="block text-foreground">검색 결과가 없어요</strong><button type="button" className="mt-3 font-semibold text-accent" onClick={() => setNameFilter("")}>검색 초기화</button></div>
            </div>
          ) : (
            <PhotographerPhotoGallery
              scrollRef={galleryScrollRef}
              photos={visiblePhotos}
              viewMode="grid"
              thumbQueue={thumbQueue}
              readonly
              selectedPhotoIds={selectedPhotoIds}
              selectionOnHover
              mobileSelectionVisible
              groupsById={groupsById}
              showSimilarityGroups
              showQualityBadges
              onToggleSelected={(photoId) => setSelectedPhotoIds((current) => {
                const next = new Set(current);
                if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
                return next;
              })}
              onDragSelectionChange={setSelectedPhotoIds}
              onEmptyClick={() => setSelectedPhotoIds(new Set())}
              minCols={6}
              mobileMinCols={3}
              mobileSquareMedia
              showFilename={false}
              onPhotoClick={(index) => { const photo = visiblePhotos[index]; if (photo && !photo.isPending) setViewerPhotoId(photo.id); }}
            />
          )}
        </main>

        <PhotographerPageActionBar
          maxWidth={1504}
          className="shrink-0"
          viewportFixed
          leading={uploadStatus}
          mobileLeading={uploadStatus}
          actions={uploading ? <PhotographerLightButton variant="secondary" onClick={cancelUpload}>업로드 중단</PhotographerLightButton> : <>
            {retryFiles.length > 0 ? <PhotographerLightButton variant="secondary" onClick={() => void handleFiles(retryFiles)}>실패 {retryFiles.length.toLocaleString()}장 다시 시도</PhotographerLightButton> : null}
            {selectedPhotoIds.size > 0 ? <PhotographerLightButton variant="danger" pending={deleting} pendingLabel="삭제 중" onClick={deleteSelectedPhotos}><Trash2 size={16} />선택 삭제 ({selectedPhotoIds.size.toLocaleString()})</PhotographerLightButton> : null}
            <PhotographerLightButton disabled={project.photoCount === 0 || deleting} onClick={() => router.push(`/customer-select/${projectId}/select`)}>셀렉 시작하기{project.photoCount > 0 ? ` (${project.photoCount}장)` : ""}</PhotographerLightButton>
          </>}
        />
      </div>

      {viewerIndex >= 0 ? <OriginalPhotoViewer photos={viewerPhotos} activeIndex={viewerIndex} onActiveIndexChange={(index) => setViewerPhotoId(viewerPhotos[index]?.id ?? null)} onClose={() => setViewerPhotoId(null)} /> : null}

      <AiAnalysisPromptModal
        open={aiPromptOpen}
        onClose={() => setAiPromptOpen(false)}
        description={`사진 ${progress.toLocaleString()}장 업로드가 완료되었습니다.`}
        similar={aiWantSimilar}
        quality={aiWantQuality}
        onSimilarChange={setAiWantSimilar}
        onQualityChange={setAiWantQuality}
        onSkip={() => setAiPromptOpen(false)}
        onStart={startAiAnalysis}
        pending={aiStarting}
      />
    </CustomerSelectShell>
  );
}
