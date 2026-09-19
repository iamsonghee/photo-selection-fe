"use client";

/**
 * S4 — 사진 업로드. 원본 파일명은 유지하되, 전송 전 브라우저에서 해상도·용량을 줄인다 —
 * 작가 업로드 화면이 쓰는 압축 유틸(upload-client-compress.ts)이 identity 비의존이라
 * 그대로 재사용한다(단계 0 분석 결과). 압축된 결과만 BE로 전송, 썸네일·프리뷰 생성은 BE 담당.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Eye, ImagePlus, Layers3, Loader2, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { PhotographerPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import { PhotoSortSelect } from "@/components/photographer/PhotoSortSelect";
import { ProjectAssetToolbarSummary } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo, PhotoGroupInfo } from "@/types";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { useCustomerSelectStore } from "../../_lib/real-store";

const BATCH_SIZE = 20;
// ponytail: 작가 화면의 PC/모바일 적응형 동시성 대신 보수적인 고정값 하나만 쓴다.
// 단말별 실측에서 병목이 확인되면 그때 분리한다.
const COMPRESS_POOL_SIZE = 3;

export default function CustomerUploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const shareToken = useSearchParams().get("share_token");
  const router = useRouter();
  const { project, hydrated, refresh } = useCustomerSelectStore();
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
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
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => () => previewUrlsRef.current.forEach(URL.revokeObjectURL), []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setTotal(files.length);
    setProgress(0);
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
    previewUrlsRef.current = [];
    const selectedFiles = Array.from(files);
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
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const rawBatch = selectedFiles.slice(i, i + BATCH_SIZE);
      const batchIds = new Set(pending.slice(i, i + BATCH_SIZE).map((photo) => photo.id));
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: true } : photo));

      let batch: File[];
      try {
        batch = await compressImagesInParallel(
          rawBatch,
          new AbortController().signal,
          COMPRESS_POOL_SIZE,
          { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
        );
      } catch {
        batch = rawBatch; // 압축 실패 시 원본 그대로 업로드(작가 화면과 동일한 폴백 원칙)
      }

      const formData = new FormData();
      formData.append("project_id", projectId);
      if (shareToken) formData.append("share_token", shareToken);
      batch.forEach((f) => formData.append("files", f));
      try {
        const res = await fetch("/api/customer-select/upload/photos", { method: "POST", headers: authHeader, body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = data.detail;
          const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
          throw new Error(msg ?? "업로드 실패");
        }
        const data = await res.json();
        uploaded += data.uploaded ?? batch.length;
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
        setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: false } : photo));
        setUploading(false);
        await refresh();
        return;
      }
      setProgress(uploaded);
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: false } : photo));
    }
    await refresh();
    setPendingPhotos([]);
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
    previewUrlsRef.current = [];
    setUploading(false);
    if (uploaded > 0) setAiPromptOpen(true);
  }

  async function startAiAnalysis() {
    setAiStarting(true);
    const suffix = shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : "";
    try {
      const requests = [
        aiWantSimilar && fetch(`/api/customer-select/projects/${projectId}/ai/similarity${suffix}`, { method: "POST" }),
        aiWantQuality && fetch(`/api/customer-select/projects/${projectId}/ai/quality${suffix}`, { method: "POST" }),
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
    const suffix = shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : "";
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const statuses = await Promise.all(kinds.map(async (kind) => {
        const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}${suffix}`);
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
        body: JSON.stringify({ project_id: projectId, photo_ids: [...selectedPhotoIds], share_token: shareToken }),
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

  const displayName = project.name || "이름 없는 프로젝트";
  const displayedPhotos = useMemo(() => [...project.photos, ...pendingPhotos], [project.photos, pendingPhotos]);
  const sortedPhotos = useMemo(() => [...displayedPhotos].sort((a, b) => {
    if (sort === "order-desc") return b.orderIndex - a.orderIndex;
    if (sort === "name-asc") return (a.originalFilename ?? "").localeCompare(b.originalFilename ?? "", "ko", { numeric: true });
    return a.orderIndex - b.orderIndex;
  }), [displayedPhotos, sort]);
  const viewerPhotos = sortedPhotos.filter((photo) => !photo.isPending);
  const groupsById = useMemo(() => {
    const groups = new Map<string, PhotoGroupInfo>();
    for (const photo of sortedPhotos) {
      if (!photo.similarityGroupId) continue;
      const group = groups.get(photo.similarityGroupId);
      if (group) group.photoCount += 1;
      else groups.set(photo.similarityGroupId, { id: photo.similarityGroupId, representativePhotoId: photo.id, photoCount: 1 });
    }
    return groups;
  }, [sortedPhotos]);
  const viewerIndex = viewerPhotoId ? viewerPhotos.findIndex((photo) => photo.id === viewerPhotoId) : -1;
  const uploadStatus = uploading ? (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <Loader2 size={22} className="shrink-0 animate-spin text-accent" aria-hidden />
      <div>
        <p className="text-sm font-bold text-foreground">{progress === 0 ? "사진 준비 중" : "사진 업로드 중"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{progress.toLocaleString()} / {total.toLocaleString()}장 · {total ? Math.round((progress / total) * 100) : 0}%</p>
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
      <CustomerSelectShell>
        <main className="grid flex-1 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></main>
      </CustomerSelectShell>
    );
  }

  return (
    <CustomerSelectShell>
      <div className="flex h-[calc(100dvh-64px)] min-h-0 flex-1 flex-col overflow-hidden">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(event) => handleFiles(event.target.files)} />

        <header className="shrink-0 border-b border-border-subtle bg-background px-4 py-3 md:px-8">
          <div className="mx-auto flex max-w-[1504px] items-center gap-3">
            <button type="button" onClick={() => router.push("/customer-select")} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground" aria-label="프로젝트 목록으로"><ChevronLeft size={19} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[18px] font-bold text-foreground md:text-[20px]">{displayName}</h1>
              <p className="mt-0.5 text-[12px] text-muted-foreground">사진 업로드 · 최대 2,000장</p>
            </div>
            <PhotographerLightButton variant="outline" size="toolbar" onClick={() => inputRef.current?.click()} disabled={uploading}><ImagePlus size={16} />사진 추가</PhotographerLightButton>
          </div>
        </header>

        <div className="shrink-0 border-b border-border-subtle bg-surface px-4 md:px-8">
          <div className="mx-auto flex min-h-12 max-w-[1504px] items-center justify-between gap-3">
            <ProjectAssetToolbarSummary label="업로드 사진" count={`${displayedPhotos.length.toLocaleString()}장`} meta={uploading ? `${progress.toLocaleString()} / ${total.toLocaleString()}장 처리 중` : aiAnalyzing ? "AI 분석 중" : undefined} />
            <div className="flex items-center gap-1.5">
              <PhotoSortSelect value={sort} onChange={setSort} options={[{ value: "order-asc", label: "업로드 순" }, { value: "order-desc", label: "최근 순" }, { value: "name-asc", label: "파일명 순" }]} />
            </div>
          </div>
        </div>

        {error ? <p role="alert" className="shrink-0 border-b border-danger/20 bg-danger/8 px-5 py-2.5 text-[13px] font-semibold text-danger md:px-8">{error}</p> : null}

        <main
          ref={galleryScrollRef}
          className="min-h-0 flex-1 overflow-y-auto bg-background"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); if (!uploading) void handleFiles(event.dataTransfer.files); }}
        >
          {sortedPhotos.length === 0 ? (
            <div className="grid min-h-full place-items-center p-5">
              <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-[260px] w-full max-w-[720px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface text-center transition-colors hover:border-accent/45 hover:bg-surface-raised/45">
                <span className="grid size-14 place-items-center rounded-2xl bg-customer-soft text-primary"><UploadCloud size={26} strokeWidth={1.8} /></span>
                <span><strong className="block text-[16px] text-foreground">사진을 끌어다 놓거나 선택하세요</strong><small className="mt-1.5 block text-[13px] text-muted-foreground">JPG · PNG · WebP · HEIC</small></span>
              </button>
            </div>
          ) : (
            <PhotographerPhotoGallery
              scrollRef={galleryScrollRef}
              photos={sortedPhotos}
              viewMode="grid"
              thumbQueue={thumbQueue}
              readonly
              selectedPhotoIds={selectedPhotoIds}
              selectionOnHover
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
              mobileMinCols={2}
              mobileSquareMedia
              showMobileFilename
              onPhotoClick={(index) => { const photo = sortedPhotos[index]; if (photo && !photo.isPending) setViewerPhotoId(photo.id); }}
            />
          )}
        </main>

        <PhotographerPageActionBar
          maxWidth={1504}
          className="shrink-0"
          leading={uploadStatus}
          mobileLeading={uploadStatus}
          actions={uploading ? null : <>
            {selectedPhotoIds.size > 0 ? <PhotographerLightButton variant="danger" pending={deleting} pendingLabel="삭제 중" onClick={deleteSelectedPhotos}><Trash2 size={16} />선택 삭제 ({selectedPhotoIds.size.toLocaleString()})</PhotographerLightButton> : null}
            <PhotographerLightButton disabled={project.photoCount === 0 || deleting} onClick={() => router.push(`/customer-select/${projectId}/select${shareToken ? `?share_token=${shareToken}` : ""}`)}>셀렉 시작하기{project.photoCount > 0 ? ` (${project.photoCount}장)` : ""}</PhotographerLightButton>
          </>}
        />
      </div>

      {viewerIndex >= 0 ? <OriginalPhotoViewer photos={viewerPhotos} activeIndex={viewerIndex} onActiveIndexChange={(index) => setViewerPhotoId(viewerPhotos[index]?.id ?? null)} onClose={() => setViewerPhotoId(null)} /> : null}

      <PhotographerModal
        open={aiPromptOpen}
        onClose={() => setAiPromptOpen(false)}
        maxWidth={412}
        variant="confirmation"
        title="AI가 사진 정리를 도와드릴까요?"
        description={`사진 ${progress.toLocaleString()}장 업로드가 완료되었습니다.`}
        footer={<div className="flex gap-2">
          <PhotographerLightButton variant="secondary" size="confirmation" className="flex-1" onClick={() => setAiPromptOpen(false)}>건너뛰기</PhotographerLightButton>
          <PhotographerLightButton size="confirmation" className="flex-1" pending={aiStarting} pendingLabel="시작 중" disabled={!aiWantSimilar && !aiWantQuality} onClick={startAiAnalysis}>분석 시작</PhotographerLightButton>
        </div>}
      >
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
            <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={aiWantSimilar} onChange={(event) => setAiWantSimilar(event.target.checked)} />
            <Layers3 size={19} className="mt-0.5 text-accent" /><span><strong className="block text-sm text-foreground">유사컷 묶기</strong><small className="mt-1 block text-xs text-muted-foreground">연속 촬영된 비슷한 사진을 자동으로 묶습니다.</small></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
            <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={aiWantQuality} onChange={(event) => setAiWantQuality(event.target.checked)} />
            <Eye size={19} className="mt-0.5 text-accent" /><span><strong className="block text-sm text-foreground">눈 감음·흐림 확인</strong><small className="mt-1 block text-xs text-muted-foreground">검토가 필요한 사진을 표시합니다.</small></span>
          </label>
        </div>
      </PhotographerModal>
    </CustomerSelectShell>
  );
}
