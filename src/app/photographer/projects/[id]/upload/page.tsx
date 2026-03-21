"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Link2, Upload, Loader2, X, Trash2, ArrowLeft } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import type { Project, Photo } from "@/types";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TabId = "local" | "gdrive";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

function logUploadTokenDebug(scope: string, token: string | null | undefined) {
  const tokenStr = token ?? "";
  const dotCount = (tokenStr.match(/\./g) ?? []).length;
  const isJwtLike = dotCount === 2;
  const preview = tokenStr ? `${tokenStr.slice(0, 20)}...` : "(empty)";
  console.log(`[auth:${scope}] token_source=session.access_token`, {
    hasToken: Boolean(tokenStr),
    isJwtLike,
    dotCount,
    tokenPreview: preview,
  });
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("local");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllSubmitting, setDeleteAllSubmitting] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length));
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length]);

  const loadProject = useCallback(async () => {
    try {
      const p = await getProjectById(id);
      setProject(p);
      if (!p) setError("프로젝트를 찾을 수 없습니다.");
      return p;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "프로젝트 정보를 불러오지 못했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPhotos = useCallback(async () => {
    try {
      const list = await getPhotosByProjectId(id);
      setPhotos(list);
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  useEffect(() => {
    loadProject().then((p) => {
      if (!p) return;
      loadPhotos();
    });
  }, [id, loadProject, loadPhotos, router]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    setFiles(list);
    setError(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10">
        <Card>
          <h2 className="text-lg font-semibold text-white">페이지를 불러오지 못했습니다</h2>
          <p className="mt-2 text-sm text-zinc-400">{error ?? "잠시 후 다시 시도해주세요."}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const M = project.photoCount;
  const N = project.requiredCount;
  const isReady = M >= N;
  const isReadOnly = project.status !== "preparing";
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    const list = Array.from(chosen).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    setFiles(list);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startUpload = async () => {
    if (!files.length) return;
    setError(null);
    setUploadPhase("sending");
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(totalSize);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const token = session?.access_token;
    if (userError || !user) {
      setError("로그인 인증을 확인할 수 없습니다. 다시 로그인 후 시도해주세요.");
      setUploadPhase("idle");
      return;
    }
    logUploadTokenDebug("v1-upload/photos", token);
    if (!token) {
      setError("로그인이 필요합니다.");
      setUploadPhase("idle");
      return;
    }

    const form = new FormData();
    form.append("project_id", id);
    files.forEach((f) => form.append("files", f));

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadedBytes(e.loaded);
        setTotalBytes(e.total);
        const pct = e.total > 0 ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : 0;
        setUploadProgress(pct);
        if (e.loaded >= e.total && e.total > 0) {
          setUploadPhase("processing");
        }
      }
    });

    const resetProgressState = () => {
      setUploadPhase("idle");
      setUploadProgress(0);
      setUploadedBytes(0);
      setTotalBytes(0);
    };

    const xhrComplete = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadPhase("done");
        fetch("/api/photographer/project-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id, action: "uploaded" }),
        }).catch(() => {});
        setTimeout(() => {
          setFiles([]);
          resetProgressState();
          setToast("업로드 완료!");
          loadProject();
          loadPhotos();
          router.refresh();
        }, 800);
      } else {
        let msg = "업로드에 실패했습니다.";
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.detail) msg = typeof body.detail === "string" ? body.detail : body.detail[0]?.msg ?? msg;
        } catch {}
        setError(msg);
        resetProgressState();
      }
    };

    xhr.addEventListener("load", xhrComplete);
    xhr.addEventListener("error", () => {
      setError("네트워크 오류가 발생했습니다.");
      resetProgressState();
    });
    xhr.addEventListener("abort", () => resetProgressState());

    xhr.open("POST", `${BACKEND_URL}/api/upload/photos`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  };

  const resetSelection = () => {
    setFiles([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingId(photoId);
    try {
      const res = await fetch(`/api/photographer/photos/${photoId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setProject((prev) => (prev ? { ...prev, photoCount: Math.max(0, prev.photoCount - 1) } : null));
      setToast("삭제되었습니다.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeleteAllSubmitting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "전체 삭제 실패");
      setShowDeleteAllModal(false);
      setPhotos([]);
      setProject((prev) => (prev ? { ...prev, photoCount: 0 } : null));
      setToast("전체 삭제되었습니다.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "전체 삭제 실패");
    } finally {
      setDeleteAllSubmitting(false);
    }
  };

  const handleInviteActivate = async () => {
    setInviteSubmitting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selecting" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "상태 변경 실패");
      setShowInviteModal(false);
      router.push(`/photographer/projects/${id}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isUploading = uploadPhase === "sending" || uploadPhase === "processing";

  const remaining = Math.max(0, N - M);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-28 pt-4">
      {/* 상단: 뒤로가기 + 제목 + 프로젝트/고객 */}
      <div className="mb-6">
        <Link
          href={`/photographer/projects/${id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          프로젝트 상세로
        </Link>
        <h1 className="text-2xl font-semibold text-white">사진 업로드</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {project.name}
          {project.customerName ? ` · ${project.customerName}` : ""}
        </p>
      </div>

      {isReadOnly && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-zinc-200">
          📌 고객 셀렉이 시작되어 사진 수정이 불가합니다.
        </div>
      )}

      {/* 업로드된 사진 섹션 */}
      <Card className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-white">업로드된 사진</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {isReadOnly
                ? "고객 셀렉이 시작되어 현재는 보기만 가능합니다."
                : "고객 셀렉용으로 업로드된 사진입니다. 필요 시 개별 삭제 또는 전체 삭제할 수 있습니다."}
            </p>
          </div>
          {!isReadOnly && photos.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              disabled={deleteAllSubmitting}
              className="shrink-0 text-sm text-danger hover:underline disabled:opacity-50"
            >
              ⚠️ 전체 삭제
            </button>
          )}
        </div>
        {photos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">아직 업로드된 사진이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {photos.map((p, index) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/50"
              >
                <span className="absolute left-1.5 top-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                  {index + 1}
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setLightboxIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLightboxIndex(index);
                    }
                  }}
                  className="block w-full cursor-pointer text-left"
                >
                  <div className="relative aspect-square bg-zinc-800">
                    <img
                      src={p.url}
                      alt=""
                      className="h-full w-full object-cover"
                      width={60}
                      height={60}
                    />
                    {!isReadOnly && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeletePhoto(p.id);
                          }}
                          disabled={deletingId === p.id}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
                          aria-label="삭제"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p
                    className="truncate px-2 py-1.5 text-xs text-zinc-300"
                    title={getDisplayFilename(p)}
                  >
                    {getDisplayFilename(p)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 업로드 현황 카드 */}
      <Card
        className={`mb-8 ${!isReady ? "border-amber-500/50 bg-amber-500/5" : "border-emerald-500/50 bg-emerald-500/5"}`}
      >
        <p className="font-medium text-zinc-200">
          업로드 {M}장 / 필요 {N}장
        </p>
        <div className="mt-2">
          <ProgressBar
            value={M}
            max={N}
            variant={isReady ? "success" : "danger"}
            showLabel
          />
        </div>
      </Card>

      {!isReadOnly && (
      <>
      {/* 추가 업로드 섹션 */}
      <Card className="mb-8">
        <h2 className="font-medium text-white">추가 업로드</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          로컬 파일 또는 Google Drive에서 사진을 추가로 업로드할 수 있습니다.
        </p>

      {/* 탭 */}
      <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("local")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${
            activeTab === "local"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span>💻</span> 로컬 업로드
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("gdrive")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${
            activeTab === "gdrive"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Google Drive
        </button>
      </div>

      {activeTab === "local" && (
        <Card className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDrop={isUploading ? undefined : onDrop}
            onDragOver={isUploading ? undefined : onDragOver}
            onDragLeave={onDragLeave}
            className={`
              flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 transition-colors
              ${dragOver ? "border-primary bg-primary/5" : "border-zinc-600 hover:border-zinc-500"}
              ${isUploading ? "pointer-events-none opacity-60" : ""}
            `}
          >
            <FolderOpen className="h-12 w-12 text-zinc-400" />
            <p className="text-center text-sm text-zinc-300">
              사진을 드래그하거나 클릭해서 선택하세요
            </p>
            <p className="text-xs text-zinc-500">
              JPEG, PNG, WebP
            </p>
          </div>

          {files.length > 0 && (
            <>
              <div
                className={`rounded-xl border border-zinc-700 bg-zinc-800/50 ${isUploading ? "pointer-events-none opacity-70" : ""}`}
              >
                <p className="border-b border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-200">
                  선택된 파일 ({files.length}장 / {formatBytes(totalSize)})
                </p>
                <ul
                  className="divide-y divide-zinc-700 overflow-y-auto px-2 py-2"
                  style={{ maxHeight: "220px" }}
                >
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 py-2 px-2 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-300" title={file.name}>
                        📷 {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        disabled={isUploading}
                        className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="제거"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {uploadPhase === "idle" && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex items-center gap-2"
                    onClick={startUpload}
                  >
                    <Upload className="h-4 w-4" />
                    업로드 시작
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetSelection}>
                    선택 취소
                  </Button>
                </div>
              )}
            </>
          )}

          {(uploadPhase === "sending" || uploadPhase === "processing") && (
            <div className="space-y-2">
              {uploadPhase === "sending" && (
                <>
                  <p className="text-sm text-zinc-300">
                    📤 파일 전송 중...
                    {totalBytes > 0 && (
                      <> ({formatBytes(uploadedBytes)} / {formatBytes(totalBytes)})</>
                    )}
                  </p>
                  <ProgressBar value={uploadProgress} max={100} showLabel />
                </>
              )}
              {uploadPhase === "processing" && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  <span>⚙️ 서버에서 사진 처리 중입니다...</span>
                </div>
              )}
            </div>
          )}

          {uploadPhase === "done" && (
            <p className="text-sm font-medium text-success">✅ 완료!</p>
          )}

          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </Card>
      )}

      {activeTab === "gdrive" && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Link2 className="h-12 w-12 text-zinc-500" />
          <p className="text-center text-zinc-400">
            🔗 Google Drive 연동은 준비 중입니다
          </p>
        </div>
      )}
      </Card>
      </>
      )}

      {/* 하단 고정 바 */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${isReady ? "text-zinc-300" : "text-zinc-500"}`}>
                업로드 {M}장 / 필요 {N}장
                {remaining > 0 && ` · 고객 초대까지 ${remaining}장 남음`}
              </p>
              {!isReady && (
                <div className="mt-1.5 max-w-xs">
                  <ProgressBar value={M} max={N} variant="danger" showLabel />
                </div>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              className={isReady ? "shrink-0 bg-primary font-medium" : "shrink-0 opacity-50"}
              disabled={!isReady}
              onClick={() => isReady && setShowInviteModal(true)}
            >
              고객 초대 활성화
            </Button>
          </div>
        </div>
      )}

      {/* 라이트박스 */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="이미지 미리보기"
        >
          {/* 닫기 배경 */}
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setLightboxIndex(null)}
            aria-label="닫기"
          />
          {/* 이전 버튼 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length); }}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/80"
            aria-label="이전"
          >
            &#8592;
          </button>
          {/* 이미지 */}
          <img
            src={photos[lightboxIndex].url}
            alt="미리보기"
            className="relative z-10 max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {/* 다음 버튼 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) + 1) % photos.length); }}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/80"
            aria-label="다음"
          >
            &#8594;
          </button>
          {/* 장 번호 */}
          <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white">
            {lightboxIndex + 1} / {photos.length}
          </div>
        </div>
      )}

      {/* 전체 삭제 확인 모달 */}
      {!isReadOnly && showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">전체 삭제</h3>
            <p className="mt-2 text-sm text-zinc-400">
              업로드된 사진 {photos.length}장을 모두 삭제하시겠습니까?
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deleteAllSubmitting}
              >
                취소
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleDeleteAll}
                disabled={deleteAllSubmitting}
              >
                {deleteAllSubmitting ? "삭제 중..." : "전체 삭제"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 고객 초대 활성화 확인 모달 */}
      {!isReadOnly && showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h3 className="text-lg font-semibold text-white">고객 초대 활성화</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">
              고객 초대 링크를 활성화합니다. 활성화 후에는 사진 추가/삭제가 불가능합니다.
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowInviteModal(false)}
                disabled={inviteSubmitting}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleInviteActivate}
                disabled={inviteSubmitting}
              >
                {inviteSubmitting ? "처리 중..." : "확인"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-zinc-700"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
