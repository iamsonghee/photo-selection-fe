"use client";

import { useEffect, useState } from "react";
import { Download, X, PackageOpen } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";

interface OriginalDownloadFile {
  photoId: string;
  filename: string;
  byteSize: number;
}
interface OriginalArchiveDownloadFile {
  partNumber: number;
  fileCount: number;
  byteSize: number;
}
interface PresignedOriginalDownloadFile extends OriginalDownloadFile {
  url: string;
}
interface PresignedOriginalArchiveDownloadFile extends OriginalArchiveDownloadFile {
  url: string;
}

type WritableFileStream = WritableStream<Uint8Array> & {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};
type WritableFileHandle = {
  createWritable(): Promise<WritableFileStream>;
};
type WritableDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WritableFileHandle>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<WritableDirectoryHandle>;
};

interface OriginalDownloadInfo {
  visible: boolean;
  available: boolean;
  expired: boolean;
  preparing: boolean;
  failed: boolean;
  fileCount: number;
  totalBytes: number;
  expiresAt: string | null;
  files: OriginalDownloadFile[];
  archivePreparing: boolean;
  archiveFailed: boolean;
  archiveBlocked: boolean;
  incompleteOriginalCount: number;
  archiveFiles: OriginalArchiveDownloadFile[];
}

const MOBILE_MAX_FILE_COUNT = 10;
const MOBILE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_TOTAL_LABEL = "100MB";

const MOBILE_COUNT_LIMIT_MESSAGE = `안정적인 저장을 위해 한 번에 ${MOBILE_MAX_FILE_COUNT}장까지 선택할 수 있어요. 선택한 사진을 먼저 저장한 후 계속해 주세요.`;
const MOBILE_BYTES_LIMIT_MESSAGE = `안정적인 저장을 위해 한 번에 ${MOBILE_MAX_TOTAL_LABEL}까지 선택할 수 있어요. 선택한 사진을 먼저 저장한 후 계속해 주세요.`;

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

function downloadFiles(files: PresignedOriginalDownloadFile[]) {
  files.forEach((file, index) => {
    window.setTimeout(() => {
      const link = document.createElement("a");
      link.href = file.url;
      link.rel = "noopener";
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 250);
  });
}

function safeDownloadFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "photo";
}

async function getNonConflictingFileHandle(directory: WritableDirectoryHandle, filename: string): Promise<WritableFileHandle> {
  const safeName = safeDownloadFilename(filename);
  const dot = safeName.lastIndexOf(".");
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : "";

  for (let suffix = 0; suffix < 10_000; suffix++) {
    const candidate = suffix === 0 ? safeName : `${base} (${suffix + 1})${extension}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error instanceof DOMException && error.name !== "NotFoundError") throw error;
      return directory.getFileHandle(candidate, { create: true });
    }
  }
  throw new Error("저장할 파일명을 만들 수 없습니다.");
}

async function saveFilesToDirectory(directory: WritableDirectoryHandle, files: PresignedOriginalDownloadFile[]) {
  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.filename}을(를) 가져오지 못했습니다.`);
    const fileHandle = await getNonConflictingFileHandle(directory, file.filename);
    const writable = await fileHandle.createWritable();
    try {
      if (response.body) {
        await response.body.pipeTo(writable);
      } else {
        await writable.write(await response.blob());
        await writable.close();
      }
    } catch (error) {
      await writable.abort(error).catch(() => {});
      throw error;
    }
  }
}

async function shareFiles(files: PresignedOriginalDownloadFile[]): Promise<boolean> {
  if (!navigator.canShare || !navigator.share) return false;

  const shareable = await Promise.all(files.map(async (file) => {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.filename}을(를) 가져오지 못했습니다.`);
    const blob = await response.blob();
    return new File([blob], file.filename, { type: blob.type || "image/jpeg" });
  }));
  if (!navigator.canShare({ files: shareable })) return false;

  await navigator.share({ files: shareable, title: "A-CUT 원본 사진" });
  return true;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 납품용 원본 다운로드 접이식 진입점 — /c/[token]/** 전 페이지(핀 인증 전/뷰어/온보딩 제외)에
 * CustomerLayoutClient에서 1회만 마운트된다. include_original=false이거나 아카이브가 준비되지
 * 않은 프로젝트에서는 아무것도 렌더하지 않는다.
 */
export default function OriginalDownloadEntry({ token, variant = "floating" }: { token: string; variant?: "floating" | "inline" }) {
  const [info, setInfo] = useState<OriginalDownloadInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"archive" | "files">("archive");
  const [query, setQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/c/original-download?token=${encodeURIComponent(token)}`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<OriginalDownloadInfo>) : null))
        .then((data) => {
          if (!cancelled && data) setInfo(data);
        })
        .catch(() => {
          // 조용히 무시 — 진입점은 선택적 기능이라 실패해도 나머지 화면에 영향 없음
        });
    };
    load();
    const polling = info?.preparing || info?.archivePreparing;
    const timer = polling
      ? window.setInterval(load, open ? 2000 : 10000)
      : null;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [token, open, info?.preparing, info?.archivePreparing]);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  if (!info || !info.visible) return null;

  const selectedFiles = [...selected]
    .sort((a, b) => a - b)
    .flatMap((index) => info.files[index] ? [info.files[index]] : []);
  const selectedTotalBytes = selectedFiles.reduce((total, file) => total + Math.max(0, file.byteSize), 0);

  const openDownloadModal = () => {
    setSelected(new Set());
    setMode("archive");
    setQuery("");
    setDownloadError(null);
    setOpen(true);
  };
  const toggleFile = (index: number) => {
    if (selected.has(index)) {
      setSelected((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
      setDownloadError(null);
      return;
    }

    if (isMobileDevice()) {
      const nextCount = selected.size + 1;
      const nextTotalBytes = selectedTotalBytes + Math.max(0, info.files[index]?.byteSize ?? 0);
      if (nextCount > MOBILE_MAX_FILE_COUNT) {
        setDownloadError(MOBILE_COUNT_LIMIT_MESSAGE);
        return;
      }
      if (nextTotalBytes > MOBILE_MAX_TOTAL_BYTES) {
        setDownloadError(MOBILE_BYTES_LIMIT_MESSAGE);
        return;
      }
    }

    setSelected((current) => new Set(current).add(index));
    setDownloadError(null);
  };
  const downloadSelected = async () => {
    if (selectedFiles.length === 0) return;

    setDownloadError(null);
    if (isMobileDevice()) {
      if (selectedFiles.length > MOBILE_MAX_FILE_COUNT) {
        setDownloadError(MOBILE_COUNT_LIMIT_MESSAGE);
        return;
      }
      if (selectedTotalBytes > MOBILE_MAX_TOTAL_BYTES) {
        setDownloadError(MOBILE_BYTES_LIMIT_MESSAGE);
        return;
      }
    }

    let desktopDirectory: WritableDirectoryHandle | null = null;
    if (!isMobileDevice()) {
      const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (showDirectoryPicker) {
        try {
          // 폴더 선택은 사용자 클릭의 transient activation이 남아 있을 때 먼저 호출해야 한다.
          desktopDirectory = await showDirectoryPicker.call(window, { id: "acut-originals", mode: "readwrite", startIn: "downloads" });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setDownloadError("저장할 폴더를 열 수 없습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
      }
    }

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/c/original-download/files?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selectedFiles.map((file) => file.photoId) }),
      });
      if (!response.ok) throw new Error("다운로드 URL을 발급하지 못했습니다.");
      const data = await response.json() as { files?: PresignedOriginalDownloadFile[] };
      const files = data.files ?? [];
      if (files.length === 0) throw new Error("다운로드할 파일이 없습니다.");
      if (files.length !== selectedFiles.length) {
        throw new Error("일부 파일의 다운로드 URL이 누락됐습니다.");
      }

      if (!isMobileDevice()) {
        if (desktopDirectory) {
          await saveFilesToDirectory(desktopDirectory, files);
          setSelected(new Set());
          setDownloadError(`${files.length.toLocaleString()}개 파일을 선택한 폴더에 저장했습니다.`);
        } else {
          // File System Access API 미지원 브라우저의 기존 폴백. Chrome/Edge에서는 위의
          // 폴더 저장 경로를 사용하므로 자동 다중 다운로드 권한에 의존하지 않는다.
          downloadFiles(files);
        }
        return;
      }
      try {
        const shared = await shareFiles(files);
        if (shared) {
          // Web Share promise가 정상 반환된 시점까지만 알 수 있다. Photos 앱 저장 성공을
          // 단정하지 않고 선택만 비워 다음 묶음을 바로 고를 수 있게 한다.
          setSelected(new Set());
          return;
        }
        downloadFiles(files);
        setSelected(new Set());
        setDownloadError("이 브라우저에서는 사진 앱 저장을 지원하지 않아 파일 다운로드로 전환했습니다.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        downloadFiles(files);
        setSelected(new Set());
        setDownloadError("사진 앱으로 저장할 수 없어 파일 다운로드로 전환했습니다.");
      }
    } catch {
      setDownloadError("선택한 파일을 다운로드할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDownloading(false);
    }
  };
  const downloadArchives = async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/c/original-download/archive?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("ZIP 다운로드 URL을 발급하지 못했습니다.");
      const data = await response.json() as { files?: PresignedOriginalArchiveDownloadFile[] };
      const files = data.files ?? [];
      if (files.length === 0) throw new Error("다운로드할 ZIP이 없습니다.");
      files.forEach((file, index) => {
        window.setTimeout(() => {
          const link = document.createElement("a");
          link.href = file.url;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, index * 250);
      });
    } catch {
      setDownloadError("ZIP을 다운로드할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDownloading(false);
    }
  };
  const visibleFiles = info.files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.filename.toLowerCase().includes(query.trim().toLowerCase()));
  const triggerLabel = info.expiresAt ? `원본 다운로드 · ${formatExpiry(info.expiresAt)}까지` : "원본 다운로드";

  return (
    <>
      <button
        type="button"
        onClick={openDownloadModal}
        aria-label="납품용 원본 다운로드"
        className={variant === "inline" ? "cp-btn-download" : undefined}
        style={variant === "inline" ? {
          width: "100%",
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          borderRadius: 8,
          border: "1px solid rgba(var(--accent-rgb),0.5)",
          background: "rgba(var(--accent-rgb),0.06)",
          color: "var(--foreground)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        } : {
          position: "fixed",
          right: 16,
          bottom: 84,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(10,10,12,0.92)",
          border: "1px solid rgba(var(--accent-rgb),0.4)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <PackageOpen size={16} />
        {triggerLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              maxHeight: "calc(100vh - 40px)",
              background: "#0f0f12",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: "28px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>납품용 원본 다운로드</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>파일 수</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 중" : `${info.fileCount.toLocaleString()}장`}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>총 용량</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 중" : formatStoredFileSizeBytes(info.totalBytes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>만료일</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 후 안내" : formatExpiry(info.expiresAt)}</div>
              </div>
            </div>

            {info.available && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["archive", "files"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setMode(tab)} style={{ border: "none", borderRadius: 8, padding: "9px 12px", background: mode === tab ? "rgba(var(--accent-rgb),0.18)" : "rgba(255,255,255,0.06)", color: mode === tab ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {tab === "archive" ? "전체 압축파일" : "개별 파일 선택"}
                  </button>
                ))}
              </div>
            )}

            {info.available && mode === "archive" && (
              <div style={{ marginBottom: 16, padding: "20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 13 }}>
                {info.archiveBlocked ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><strong style={{ color: "#ffca80" }}>전체 압축파일을 만들 수 없습니다</strong><span style={{ color: "rgba(255,255,255,0.62)" }}>원본 업로드가 완료되지 않은 사진 {info.incompleteOriginalCount.toLocaleString()}장이 있습니다. 작가가 원본을 복구하면 자동으로 준비가 시작됩니다.</span></div>
                ) : info.archivePreparing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><strong style={{ color: "#fff" }}>전체 압축파일을 준비하고 있습니다</strong><span style={{ color: "rgba(255,255,255,0.62)" }}>준비가 끝나면 이곳에서 한 번에 다운로드할 수 있습니다. 개별 파일은 지금 바로 받을 수 있어요.</span></div>
                ) : info.archiveFailed ? (
                  <span style={{ color: "#ff9b9b" }}>전체 압축파일 준비에 실패했습니다. 개별 원본 다운로드는 계속 가능합니다.</span>
                ) : info.archiveFiles.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><strong style={{ color: "#fff" }}>전체 압축파일 준비 완료</strong><span style={{ color: "rgba(255,255,255,0.6)" }}>{info.fileCount.toLocaleString()}장 · {formatStoredFileSizeBytes(info.totalBytes)}{info.archiveFiles.length > 1 ? ` · ${info.archiveFiles.length}개 ZIP` : ""}</span></div>
                    <button type="button" onClick={downloadArchives} disabled={isDownloading} style={{ border: "none", borderRadius: 8, padding: "12px 15px", background: "var(--accent, #4f7eff)", color: "#000", fontSize: 13, fontWeight: 700, cursor: isDownloading ? "wait" : "pointer", flexShrink: 0 }}>{isDownloading ? "다운로드 준비 중..." : "전체 압축파일 다운로드"}</button>
                  </div>
                ) : null}
                {isMobile && info.archiveFiles.length > 0 && (
                  <p style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                    전체 압축파일의 용량이 큰 경우 원활한 다운로드를 위해 PC 이용을 권장해요.
                  </p>
                )}
                {downloadError && <p role="status" style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.68)", fontSize: 12 }}>{downloadError}</p>}
              </div>
            )}

            {!info.available ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {info.archiveBlocked
                  ? `원본 업로드가 완료되지 않은 사진 ${info.incompleteOriginalCount.toLocaleString()}장이 있습니다. 작가가 원본을 복구하면 다운로드할 수 있어요.`
                  : info.preparing
                  ? "작가가 납품용 원본 파일을 준비하고 있습니다. 준비가 완료되면 이 화면에서 바로 다운로드할 수 있어요."
                  : info.failed
                    ? "납품용 원본 파일을 준비하는 중 문제가 발생했습니다. 작가가 다시 준비하면 다운로드할 수 있어요."
                    : "다운로드 기간이 종료되었습니다."}
              </div>
            ) : mode === "archive" ? (
              <div style={{ padding: "14px", borderRadius: 10, background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.5)", fontSize: 12.5, textAlign: "center" }}>
                특정 파일만 필요하면 <button type="button" onClick={() => setMode("files")} style={{ padding: 0, border: 0, background: "none", color: "var(--accent, #91b1ff)", fontSize: "inherit", cursor: "pointer" }}>개별 파일 선택</button>에서 받을 수 있습니다.
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 8px", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                  필요한 원본만 선택해 다운로드할 수 있어요. 전체 원본은 &apos;전체 압축파일&apos;에서 다운로드해 주세요.
                </p>
                {isMobile && (
                  <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                    휴대폰에서 안정적으로 저장하려면 한 번에 {MOBILE_MAX_FILE_COUNT}장, 총 {MOBILE_MAX_TOTAL_LABEL} 이내로 나누어 저장해 주세요.
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 10 }}>
                  <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                    {isMobile
                      ? `${selected.size.toLocaleString()} / ${MOBILE_MAX_FILE_COUNT} · ${formatStoredFileSizeBytes(selectedTotalBytes)}`
                      : `${selected.size.toLocaleString()}개 선택됨`}
                  </span>
                </div>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파일명 검색" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, outline: "none" }} />
                <div style={{ minHeight: 0, maxHeight: "calc(100vh - 330px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                  {visibleFiles.map(({ file, index }) => (
                    <div key={`${file.filename}-${index}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13 }}>
                      <input type="checkbox" checked={selected.has(index)} onChange={() => toggleFile(index)} aria-label={`${file.filename} 선택`} />
                      <Download size={15} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.filename}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{formatStoredFileSizeBytes(file.byteSize)}</span>
                    </div>
                  ))}
                </div>
                {downloadError && <p role="status" style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.68)", fontSize: 12, textAlign: "center" }}>{downloadError}</p>}
                <button type="button" onClick={downloadSelected} disabled={selected.size === 0 || isDownloading} style={{ width: "100%", marginTop: 16, padding: "13px", border: "none", borderRadius: 10, background: selected.size && !isDownloading ? "var(--accent, #4f7eff)" : "rgba(255,255,255,0.1)", color: selected.size && !isDownloading ? "#000" : "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: 700, cursor: selected.size && !isDownloading ? "pointer" : "not-allowed" }}>
                  {isDownloading
                    ? "사진 준비 중..."
                    : isMobile
                      ? `선택한 사진 저장 (${selected.size.toLocaleString()})`
                      : `선택한 파일 다운로드 (${selected.size.toLocaleString()})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
