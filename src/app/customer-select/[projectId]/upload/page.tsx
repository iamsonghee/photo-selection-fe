"use client";

/**
 * S4 — 사진 업로드. 원본 파일명은 유지하되, 전송 전 브라우저에서 해상도·용량을 줄인다 —
 * 작가 업로드 화면이 쓰는 압축 유틸(upload-client-compress.ts)이 identity 비의존이라
 * 그대로 재사용한다(단계 0 분석 결과). 압축된 결과만 BE로 전송, 썸네일·프리뷰 생성은 BE 담당.
 */
import { useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectFormPageHeading, ProjectFormSection } from "@/components/photographer/ProjectFormFields";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
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
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setTotal(files.length);
    setProgress(0);

    const {
      data: { session },
    } = await createClient().auth.getSession();
    const authHeader: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    let list: File[];
    try {
      list = await compressImagesInParallel(
        Array.from(files),
        new AbortController().signal,
        COMPRESS_POOL_SIZE,
        { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
      );
    } catch {
      list = Array.from(files); // 압축 실패 시 원본 그대로 업로드(작가 화면과 동일한 폴백 원칙)
    }

    let uploaded = 0;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
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
        setUploading(false);
        await refresh();
        return;
      }
      setProgress(uploaded);
    }
    await refresh();
    setUploading(false);
  }

  const displayName = project.name || "이름 없는 프로젝트";

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
                className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-raised/55 px-5 py-10 text-center transition-colors hover:border-accent/45"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); void handleFiles(event.dataTransfer.files); }}
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-customer-soft text-primary"><UploadCloud size={26} strokeWidth={1.8} /></span>
                <div>
                  <p className="text-[16px] font-bold text-foreground">사진을 끌어다 놓거나 직접 선택하세요</p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">JPG · PNG · WebP · HEIC · 최대 2,000장</p>
                </div>
                <PhotographerLightButton onClick={() => inputRef.current?.click()} disabled={uploading}>{project.photoCount > 0 ? "사진 더 올리기" : "사진 선택"}</PhotographerLightButton>
              </div>

              {uploading ? (
                <div className="rounded-xl border border-border-subtle bg-surface px-4 py-4" role="status" aria-live="polite">
                  <div className="flex justify-between text-[13px] font-semibold text-muted-foreground"><span>{progress} / {total}장</span><span>업로드 중…</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? (progress / total) * 100 : 0}%` }} /></div>
                </div>
              ) : project.photoCount > 0 ? (
                <p className="rounded-xl bg-customer-soft px-4 py-3 text-[14px] font-semibold text-primary">사진 {project.photoCount}장을 올렸습니다. 사진을 더 추가하거나 셀렉을 시작할 수 있어요.</p>
              ) : null}
              {error ? <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p> : null}
            </ProjectFormSection>
          </div>
        </PhotographerLightPageFrame>
        <PhotographerPageActionBar
          maxWidth={1120}
          leading={<p className="text-sm text-muted-foreground">업로드한 순서와 원본 파일명은 그대로 유지됩니다.</p>}
          actions={<PhotographerLightButton disabled={project.photoCount === 0 || uploading} onClick={() => router.push(`/customer-select/${projectId}/select${shareToken ? `?share_token=${shareToken}` : ""}`)}>셀렉 시작하기{project.photoCount > 0 ? ` (${project.photoCount}장)` : ""}</PhotographerLightButton>}
        />
      </div>
    </CustomerSelectShell>
  );
}
