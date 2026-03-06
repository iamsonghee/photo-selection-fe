"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Link2, Upload, Loader2 } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getProjectById } from "@/lib/db";
import type { Project } from "@/types";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type TabId = "local" | "gdrive";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<Project | null>(null);
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

  const loadProject = useCallback(async () => {
    try {
      const p = await getProjectById(id);
      setProject(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

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
  if (!project) return null;

  const M = project.photoCount;
  const N = project.requiredCount;
  const isReady = M >= N;
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
    const token = session?.access_token;
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

    xhr.open("POST", `${API_BASE}/api/upload/photos`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  };

  const resetSelection = () => {
    setFiles([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">사진 업로드</h1>
        {isReady && (
          <Link href={`/photographer/projects/${id}`}>
            <Button variant="primary" className="flex items-center gap-2">
              프로젝트로 이동 →
            </Button>
          </Link>
        )}
      </div>

      {/* M vs N 상태 카드 */}
      <Card
        className={
          !isReady
            ? "border-danger/50 bg-danger/5"
            : "border-success/50 bg-success/5"
        }
      >
        {!isReady && (
          <>
            <p className="font-medium text-danger">
              아직 부족합니다 (현재 {M}장 / 필요 {N}장)
            </p>
            <div className="mt-2">
              <ProgressBar
                value={M}
                max={N}
                variant="danger"
                showLabel
              />
            </div>
          </>
        )}
        {isReady && (
          <p className="font-medium text-success">
            ✅ 준비 완료! 프로젝트로 이동하세요
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-400">M = {M}장, N = {N}장</p>
        {isReady && (
          <Link href={`/photographer/projects/${id}`} className="mt-3 inline-block">
            <Button variant="primary" size="sm">
              프로젝트로 이동 →
            </Button>
          </Link>
        )}
      </Card>

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
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`
              flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 transition-colors
              ${dragOver ? "border-primary bg-primary/5" : "border-zinc-600 hover:border-zinc-500"}
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

          {files.length > 0 && uploadPhase === "idle" && (
            <>
              <p className="text-sm text-zinc-300">
                {files.length}장 선택됨 (총 {formatBytes(totalSize)})
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className="flex items-center gap-2"
                  disabled={uploadPhase !== "idle"}
                  onClick={startUpload}
                >
                  <Upload className="h-4 w-4" />
                  업로드 시작
                </Button>
                <Button variant="ghost" size="sm" onClick={resetSelection}>
                  선택 취소
                </Button>
              </div>
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
        <Card className="flex flex-col items-center justify-center gap-3 py-12">
          <Link2 className="h-12 w-12 text-zinc-500" />
          <p className="text-center text-zinc-400">
            🔗 Google Drive 연동은 준비 중입니다
          </p>
        </Card>
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
