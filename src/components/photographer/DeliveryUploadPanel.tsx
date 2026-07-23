"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileImage,
  Zap,
  RotateCcw,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type FileStatus = "queued" | "uploading" | "done" | "error" | "rejected";

type FileItem = {
  file: File;
  status: FileStatus;
  compressed?: boolean;
  error?: string;
};

type UploadReport = {
  uploaded: number;
  compressed: number;
  rejected: { filename: string; reason: string }[];
};

function isAllowed(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return ALLOWED_MIME.has(mime) || ALLOWED_EXTS.has(ext);
}

function createBatches(items: FileItem[]): File[][] {
  const large = items.filter((f) => f.file.size > 15 * 1024 * 1024).map((f) => f.file);
  const medium = items
    .filter((f) => f.file.size > 5 * 1024 * 1024 && f.file.size <= 15 * 1024 * 1024)
    .map((f) => f.file);
  const small = items.filter((f) => f.file.size <= 5 * 1024 * 1024).map((f) => f.file);

  const batches: File[][] = [];
  for (let i = 0; i < large.length; i += 2) batches.push(large.slice(i, i + 2));
  for (let i = 0; i < medium.length; i += 3) batches.push(medium.slice(i, i + 3));
  for (let i = 0; i < small.length; i += 6) batches.push(small.slice(i, i + 6));
  return batches;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function DeliveryUploadPanel({
  isOpen,
  onClose,
  projectId,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onDone?: () => void;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const allowed = incoming.filter(isAllowed);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.file.name}__${f.file.size}`));
      const deduped = allowed.filter((f) => !existing.has(`${f.name}__${f.size}`));
      return [...prev, ...deduped.map((f) => ({ file: f, status: "queued" as FileStatus }))];
    });
  }, []);

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  }

  async function handleUpload() {
    if (uploading || files.length === 0) return;

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert("로그인이 필요합니다.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setReport(null);

    const queued = files.filter((f) => f.status === "queued");
    const batches = createBatches(queued);
    const totalReport: UploadReport = { uploaded: 0, compressed: 0, rejected: [] };
    let done = 0;

    for (const batch of batches) {
      const batchSet = new Set(batch);

      setFiles((prev) =>
        prev.map((f) => (batchSet.has(f.file) ? { ...f, status: "uploading" } : f))
      );

      try {
        const form = new FormData();
        form.append("project_id", projectId);
        for (const f of batch) form.append("files", f, f.name);

        const res = await fetch(`${API_BASE}/api/upload/originals`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof (data as { detail?: unknown }).detail === "string"
              ? (data as { detail: string }).detail
              : "업로드 실패"
          );
        }

        const result: UploadReport = await res.json();
        totalReport.uploaded += result.uploaded;
        totalReport.compressed += result.compressed;
        totalReport.rejected.push(...result.rejected);

        const rejectedNames = new Set(result.rejected.map((r) => r.filename));
        setFiles((prev) =>
          prev.map((f) => {
            if (!batchSet.has(f.file)) return f;
            if (rejectedNames.has(f.file.name)) {
              return {
                ...f,
                status: "rejected",
                error: result.rejected.find((r) => r.filename === f.file.name)?.reason,
              };
            }
            return { ...f, status: "done" };
          })
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "업로드 실패";
        setFiles((prev) =>
          prev.map((f) =>
            batchSet.has(f.file) ? { ...f, status: "error", error: msg } : f
          )
        );
        for (const f of batch) {
          totalReport.rejected.push({ filename: f.name, reason: msg });
        }
      }

      done += batch.length;
      setProgress(Math.round((done / queued.length) * 100));
    }

    setReport(totalReport);
    setUploading(false);
    if (totalReport.uploaded > 0) onDone?.();
  }

  function reset() {
    if (uploading) return;
    setFiles([]);
    setReport(null);
    setProgress(0);
  }

  function handleClose() {
    if (uploading) return;
    reset();
    onClose();
  }

  const queuedCount = files.filter((f) => f.status === "queued").length;
  const hasFiles = files.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* panel */}
      <div className="w-full max-w-md bg-surface border-l border-border-subtle flex flex-col h-full shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">납품 파일 업로드</h2>
            <p className="text-xs text-subtle-foreground mt-0.5">
              JPEG, PNG, WebP, HEIC 지원 · 파일당 최대 20MB
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="p-1.5 rounded-lg text-subtle-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* drop zone */}
          {!report && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && inputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-all ${
                isDragging
                  ? "border-accent bg-accent/10"
                  : uploading
                  ? "border-border-subtle opacity-50 cursor-not-allowed"
                  : "border-border-subtle hover:border-accent/50 hover:bg-accent/5"
              }`}
            >
              <Upload
                size={24}
                className={isDragging ? "text-accent" : "text-subtle-foreground"}
              />
              <span className="text-sm font-medium text-muted-foreground">
                {isDragging ? "놓아서 추가" : "클릭 또는 드래그하여 파일 추가"}
              </span>
              <span className="text-xs text-subtle-foreground">RAW 파일 제외</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* file list */}
          {hasFiles && (
            <div className="flex flex-col gap-1.5">
              {files.map((item, i) => (
                <div
                  key={`${item.file.name}__${item.file.size}__${i}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-background border border-border-subtle"
                >
                  <FileImage size={14} className="text-subtle-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground truncate">
                      {item.file.name}
                    </p>
                    <p className="text-[10px] text-subtle-foreground">
                      {formatBytes(item.file.size)}
                      {item.error && (
                        <span className="text-rose-400 ml-1">— {item.error}</span>
                      )}
                    </p>
                  </div>
                  {item.status === "queued" && !uploading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="p-1 rounded text-disabled-foreground hover:text-rose-400 transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                  {item.status === "uploading" && (
                    <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin shrink-0" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  )}
                  {(item.status === "error" || item.status === "rejected") && (
                    <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* completion report */}
          {report && (
            <div className="rounded-xl border border-border-subtle bg-background p-4 flex flex-col gap-3">
              <p className="text-sm font-bold text-foreground">업로드 완료</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-400">{report.uploaded}</p>
                  <p className="text-[10px] text-emerald-400/70 font-medium">업로드 완료</p>
                </div>
                <div className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-accent">{report.compressed}</p>
                  <p className="text-[10px] text-accent/70 font-medium">자동 최적화</p>
                </div>
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-rose-400">{report.rejected.length}</p>
                  <p className="text-[10px] text-rose-400/70 font-medium">실패</p>
                </div>
              </div>
              {report.compressed > 0 && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/5 border border-accent/20">
                  <Zap size={13} className="text-accent shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {report.compressed}장이 20MB 상한으로 인해 자동 최적화되어 저장되었습니다.
                  </p>
                </div>
              )}
              {report.rejected.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-wide">
                    실패 파일
                  </p>
                  {report.rejected.map((r, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="text-rose-400 font-medium">{r.filename}</span>
                      <span className="text-subtle-foreground ml-1">— {r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-border-subtle px-5 py-4 flex flex-col gap-3">
          {uploading && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] text-subtle-foreground">
                <span>업로드 중…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {report ? (
            <div className="flex gap-2">
              {queuedCount > 0 || files.some((f) => f.status === "error") ? (
                <button
                  type="button"
                  onClick={handleUpload}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent hover:bg-[#ff5e1a] text-black text-sm font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-accent/20"
                >
                  <Upload size={14} />
                  재시도 업로드
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-subtle text-subtle-foreground text-sm font-medium hover:text-foreground hover:border-border-strong transition-colors"
              >
                <RotateCcw size={13} />
                초기화
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
              >
                닫기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || queuedCount === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent hover:bg-[#ff5e1a] disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-accent/20"
            >
              <Upload size={14} />
              {uploading
                ? `업로드 중… (${progress}%)`
                : queuedCount > 0
                ? `납품 파일 업로드 (${queuedCount}장)`
                : "파일을 추가해주세요"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
