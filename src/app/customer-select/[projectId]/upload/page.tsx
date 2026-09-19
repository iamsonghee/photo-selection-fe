"use client";

/**
 * S4 — 사진 업로드. 원본 파일명은 유지하되, 전송 전 브라우저에서 해상도·용량을 줄인다 —
 * 작가 업로드 화면이 쓰는 압축 유틸(upload-client-compress.ts)이 identity 비의존이라
 * 그대로 재사용한다(단계 0 분석 결과). 압축된 결과만 BE로 전송, 썸네일·프리뷰 생성은 BE 담당.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { ProjectFormPageHeading, ProjectFormSection } from "@/components/photographer/ProjectFormFields";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo } from "@/types";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { useCustomerSelectStore } from "../../_lib/real-store";

const BATCH_SIZE = 20;
// ponytail: 작가 화면의 PC/모바일 적응형 동시성 대신 고정값 하나만 쓴다 — 고객 프로젝트는
// 동시 대량 업로드 규모가 작아 그 정교함이 필요 없다. 문제가 실측되면 그때 분리한다.
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

    let list: File[];
    try {
      list = await compressImagesInParallel(
        selectedFiles,
        new AbortController().signal,
        COMPRESS_POOL_SIZE,
        { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
      );
    } catch {
      list = selectedFiles; // 압축 실패 시 원본 그대로 업로드(작가 화면과 동일한 폴백 원칙)
    }

    setPendingPhotos((current) => current.map((photo) => ({ ...photo, isUploading: true })));

    let uploaded = 0;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      const batchIds = new Set(pending.slice(i, i + BATCH_SIZE).map((photo) => photo.id));
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
  }

  const displayName = project.name || "이름 없는 프로젝트";
  const displayedPhotos = [...project.photos, ...pendingPhotos];
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
      <div className="flex min-h-[calc(100dvh-64px)] flex-1 flex-col">
        <PhotographerLightPageFrame className="flex-1 pb-8">
          <div className="mx-auto max-w-[1120px]">
            <ProjectFormPageHeading title="사진 업로드" description={`${displayName} 프로젝트의 촬영본을 올려주세요.`} onBack={() => router.push("/customer-select")} />
            <ProjectFormSection number="01" title="촬영본 업로드" description="원본 파일명을 유지한 채 셀렉용 사진을 준비합니다.">
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
              <div
                className={`flex items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-raised/55 px-5 text-center transition-colors hover:border-accent/45 ${displayedPhotos.length > 0 ? "min-h-[120px] flex-col py-5 sm:flex-row" : "min-h-[280px] flex-col py-10"}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); void handleFiles(event.dataTransfer.files); }}
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-customer-soft text-primary"><UploadCloud size={26} strokeWidth={1.8} /></span>
                <div>
                  <p className="text-[16px] font-bold text-foreground">{displayedPhotos.length > 0 ? "사진을 더 추가할 수 있어요" : "사진을 끌어다 놓거나 직접 선택하세요"}</p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">JPG · PNG · WebP · HEIC · 최대 2,000장</p>
                </div>
                <PhotographerLightButton onClick={() => inputRef.current?.click()} disabled={uploading}>{project.photoCount > 0 ? "사진 더 올리기" : "사진 선택"}</PhotographerLightButton>
              </div>

              {displayedPhotos.length > 0 ? (
                <div ref={galleryScrollRef} className="min-h-[320px] max-h-[60dvh] overflow-y-auto rounded-xl border border-border-subtle bg-background">
                  <PhotographerPhotoGallery
                    scrollRef={galleryScrollRef}
                    photos={displayedPhotos}
                    viewMode="grid"
                    thumbQueue={thumbQueue}
                    readonly
                    mobileMinCols={2}
                    mobileSquareMedia
                    showMobileFilename
                    onPhotoClick={() => {}}
                  />
                </div>
              ) : null}

              {!uploading && project.photoCount > 0 ? (
                <p className="rounded-xl bg-customer-soft px-4 py-3 text-[14px] font-semibold text-primary">사진 {project.photoCount}장을 올렸습니다. 사진을 더 추가하거나 셀렉을 시작할 수 있어요.</p>
              ) : null}
              {error ? <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p> : null}
            </ProjectFormSection>
          </div>
        </PhotographerLightPageFrame>
        <PhotographerPageActionBar
          maxWidth={1120}
          leading={uploadStatus}
          mobileLeading={uploadStatus}
          actions={uploading ? null : <PhotographerLightButton disabled={project.photoCount === 0} onClick={() => router.push(`/customer-select/${projectId}/select${shareToken ? `?share_token=${shareToken}` : ""}`)}>셀렉 시작하기{project.photoCount > 0 ? ` (${project.photoCount}장)` : ""}</PhotographerLightButton>}
        />
      </div>
    </CustomerSelectShell>
  );
}
