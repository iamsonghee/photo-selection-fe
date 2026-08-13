"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, PackageOpen } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import {
  getDirectoryPicker,
  saveFilesToDirectory,
  type WritableDirectoryHandle,
} from "@/lib/directory-download-client";

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

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
      const showDirectoryPicker = getDirectoryPicker();
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

      {open && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="original-download-backdrop"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="original-download-modal"
          >
            <div className="original-download-header">
              <span className="original-download-title">납품용 원본 다운로드</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="original-download-close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="original-download-meta">
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
              <div className="original-download-tabs" role="tablist" aria-label="원본 다운로드 방식">
                {(["archive", "files"] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => setMode(tab)} style={{ border: "none", borderRadius: 8, padding: "9px 12px", background: mode === tab ? "rgba(var(--accent-rgb),0.18)" : "rgba(255,255,255,0.06)", color: mode === tab ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
              <div className="original-download-files-layout">
                <div className="original-download-files-toolbar">
                  <p style={{ margin: "0 0 6px", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                    필요한 원본만 선택해 다운로드할 수 있어요. 전체 원본은 &apos;전체 압축파일&apos;에서 다운로드해 주세요.
                  </p>
                  {isMobile && (
                    <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.5 }}>
                      휴대폰에서 안정적으로 저장하려면 한 번에 {MOBILE_MAX_FILE_COUNT}장, 총 {MOBILE_MAX_TOTAL_LABEL} 이내로 나누어 저장해 주세요.
                    </p>
                  )}
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파일명 검색" className="original-download-search" />
                </div>

                <div className="original-download-file-list">
                  {visibleFiles.map(({ file, index }) => (
                    <label key={`${file.filename}-${index}`} className="original-download-file-row">
                      <input type="checkbox" checked={selected.has(index)} onChange={() => toggleFile(index)} aria-label={`${file.filename} 선택`} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.filename}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{formatStoredFileSizeBytes(file.byteSize)}</span>
                    </label>
                  ))}
                </div>

                <div className="original-download-footer">
                  {downloadError && <p role="status" className="original-download-status">{downloadError}</p>}
                  <div className="original-download-footer-row">
                    <span className="original-download-selection-summary">
                      {isMobile
                        ? `${selected.size.toLocaleString()} / ${MOBILE_MAX_FILE_COUNT} · ${formatStoredFileSizeBytes(selectedTotalBytes)}`
                        : `${selected.size.toLocaleString()}개 선택 · ${formatStoredFileSizeBytes(selectedTotalBytes)}`}
                    </span>
                    <button type="button" onClick={downloadSelected} disabled={selected.size === 0 || isDownloading} className="original-download-submit">
                      {isDownloading
                        ? "사진 준비 중..."
                        : isMobile
                          ? `선택한 사진 저장 (${selected.size.toLocaleString()})`
                          : `선택한 파일 다운로드 (${selected.size.toLocaleString()})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      <style jsx>{`
        .original-download-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
        }
        .original-download-modal {
          width: min(960px, 100%);
          height: min(820px, calc(100dvh - 40px));
          max-height: calc(100dvh - 40px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 28px;
          box-sizing: border-box;
          background: #0f0f12;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
        }
        .original-download-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .original-download-title { font-size: 22px; font-weight: 700; color: #fff; }
        .original-download-close {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          padding: 0;
          background: none;
          border: none;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }
        .original-download-close:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .original-download-meta {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        .original-download-tabs { flex: 0 0 auto; display: flex; gap: 8px; margin-bottom: 16px; }
        .original-download-files-layout { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
        .original-download-files-toolbar { flex: 0 0 auto; }
        .original-download-search {
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 10px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          outline: none;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          font-size: 13px;
        }
        .original-download-search:focus { border-color: rgba(var(--accent-rgb), 0.6); }
        .original-download-file-list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
          scrollbar-gutter: stable;
        }
        .original-download-file-row {
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
          padding: 10px 12px;
          box-sizing: border-box;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 13px;
          cursor: pointer;
        }
        .original-download-file-row:hover { background: rgba(255, 255, 255, 0.09); }
        .original-download-file-row:has(input:checked) { background: rgba(var(--accent-rgb), 0.12); }
        .original-download-file-row input { width: 17px; height: 17px; flex: 0 0 auto; accent-color: var(--accent, #4f7eff); }
        .original-download-footer {
          flex: 0 0 auto;
          margin-top: 10px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -12px 24px rgba(15, 15, 18, 0.9);
        }
        .original-download-status { margin: 0 0 9px; color: rgba(255,255,255,0.72); font-size: 12px; text-align: center; }
        .original-download-footer-row { display: flex; align-items: center; gap: 16px; }
        .original-download-selection-summary { min-width: 150px; color: rgba(255,255,255,0.56); font-size: 12px; }
        .original-download-submit {
          flex: 1 1 auto;
          min-height: 46px;
          padding: 13px 18px;
          border: none;
          border-radius: 10px;
          background: var(--accent, #4f7eff);
          color: #000;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .original-download-submit:disabled {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.35);
          cursor: not-allowed;
        }
        @media (max-width: 640px) {
          .original-download-backdrop { align-items: stretch; padding: 0; }
          .original-download-modal {
            width: 100%;
            height: 100dvh;
            max-height: 100dvh;
            padding: max(14px, env(safe-area-inset-top, 0px)) 16px max(12px, env(safe-area-inset-bottom, 0px));
            border: 0;
            border-radius: 0;
          }
          .original-download-header { margin-bottom: 10px; }
          .original-download-title { font-size: 18px; }
          .original-download-meta { margin-bottom: 12px; }
          .original-download-tabs { margin-bottom: 12px; }
          .original-download-files-toolbar p:first-child { display: none; }
          .original-download-file-list { padding-right: 0; }
          .original-download-file-row { min-height: 48px; padding: 11px 10px; }
          .original-download-footer { margin-top: 8px; padding-top: 10px; }
          .original-download-footer-row { flex-direction: column; align-items: stretch; gap: 8px; }
          .original-download-selection-summary { min-width: 0; text-align: center; }
          .original-download-submit { width: 100%; flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
