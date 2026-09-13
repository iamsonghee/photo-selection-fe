"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { customerDDay } from "@/lib/customer-dday";
import { Archive, Download, Images, Monitor, PackageOpen, RotateCcw, X } from "lucide-react";
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
  isSelected: boolean;
}
interface OriginalArchiveDownloadFile {
  partNumber: number;
  fileCount: number;
  byteSize: number;
}
interface PresignedOriginalDownloadFile {
  photoId: string;
  filename: string;
  byteSize: number;
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
  archiveProcessedFiles?: number;
  archiveProcessedBytes?: number;
  archiveUploadedBytes?: number;
  archiveStartedAt?: string | null;
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

function formatRemainingTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 75) return "약 1분 이내 남음";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `약 ${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `약 ${hours}시간 ${remainingMinutes}분 남음` : `약 ${hours}시간 남음`;
}

/**
 * 납품용 원본 다운로드 접이식 진입점 — /c/[token]/** 전 페이지(핀 인증 전/뷰어/온보딩 제외)에
 * CustomerLayoutClient에서 1회만 마운트된다. include_original=false이거나 아카이브가 준비되지
 * 않은 프로젝트에서는 아무것도 렌더하지 않는다.
 */
type OriginalDownloadVariant = "floating" | "inline" | "entry" | "summary" | "banner" | "subheader";

export default function OriginalDownloadEntry({ token, variant = "floating" }: { token: string; variant?: OriginalDownloadVariant }) {
  const [info, setInfo] = useState<OriginalDownloadInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"archive" | "files">("archive");
  const [query, setQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingPart, setDownloadingPart] = useState<number | null>(null);
  const customerSelectionCheckboxRef = useRef<HTMLInputElement>(null);

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

  const customerSelectedFilesForState = info?.files.filter((file) => file.isSelected) ?? [];
  const checkedCustomerSelectionCount = customerSelectedFilesForState.filter((file) => selectedPhotoIds.has(file.photoId)).length;
  const allCustomerSelectionsChecked = customerSelectedFilesForState.length > 0
    && checkedCustomerSelectionCount === customerSelectedFilesForState.length;
  const someCustomerSelectionsChecked = checkedCustomerSelectionCount > 0 && !allCustomerSelectionsChecked;

  useEffect(() => {
    if (customerSelectionCheckboxRef.current) {
      customerSelectionCheckboxRef.current.indeterminate = someCustomerSelectionsChecked;
    }
  }, [someCustomerSelectionsChecked]);

  if (!info || !info.visible) return null;

  const selectedFiles = info.files.filter((file) => selectedPhotoIds.has(file.photoId));
  const selectedTotalBytes = selectedFiles.reduce((total, file) => total + Math.max(0, file.byteSize), 0);
  const customerSelectedFiles = customerSelectedFilesForState;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFiles = info.files
    .filter((file) => file.filename.toLowerCase().includes(normalizedQuery));
  const archiveProcessedBytes = Math.min(info.totalBytes, Math.max(0, info.archiveProcessedBytes ?? 0));
  const archiveUploadedBytes = Math.min(info.totalBytes, Math.max(0, info.archiveUploadedBytes ?? 0));
  // 원본을 ZIP에 기록하는 작업을 85%, 완성된 ZIP을 R2에 저장하는 작업을 15%로 표시한다.
  // 실제 byte 진행률을 사용하되 ready 전에는 99%를 넘지 않아 완료로 오해하지 않게 한다.
  const archiveProgressPercent = info.totalBytes > 0
    ? Math.min(99, Math.max(0, Math.round(
        ((archiveProcessedBytes * 0.85) + (archiveUploadedBytes * 0.15)) / info.totalBytes * 100,
      )))
    : 0;
  const archiveElapsedSeconds = info.archiveStartedAt
    ? Math.max(0, (Date.now() - new Date(info.archiveStartedAt).getTime()) / 1000)
    : 0;
  const archiveRemainingSeconds = archiveProgressPercent >= 3 && archiveElapsedSeconds >= 5
    ? archiveElapsedSeconds * (100 - archiveProgressPercent) / archiveProgressPercent
    : 0;
  const archiveRemainingLabel = formatRemainingTime(archiveRemainingSeconds);
  const archiveIsUploading = info.totalBytes > 0
    && archiveProcessedBytes >= info.totalBytes
    && archiveUploadedBytes < info.totalBytes;

  const openDownloadModal = () => {
    setSelectedPhotoIds(new Set());
    setMode("archive");
    setQuery("");
    setDownloadError(null);
    setOpen(true);
  };
  const toggleFile = (file: OriginalDownloadFile) => {
    if (selectedPhotoIds.has(file.photoId)) {
      setSelectedPhotoIds((current) => {
        const next = new Set(current);
        next.delete(file.photoId);
        return next;
      });
      setDownloadError(null);
      return;
    }

    if (isMobileDevice()) {
      const nextCount = selectedFiles.length + 1;
      const nextTotalBytes = selectedTotalBytes + Math.max(0, file.byteSize);
      if (nextCount > MOBILE_MAX_FILE_COUNT) {
        setDownloadError(MOBILE_COUNT_LIMIT_MESSAGE);
        return;
      }
      if (nextTotalBytes > MOBILE_MAX_TOTAL_BYTES) {
        setDownloadError(MOBILE_BYTES_LIMIT_MESSAGE);
        return;
      }
    }

    setSelectedPhotoIds((current) => new Set(current).add(file.photoId));
    setDownloadError(null);
  };
  const toggleCustomerSelectedFiles = () => {
    if (customerSelectedFiles.length === 0) return;

    if (allCustomerSelectionsChecked) {
      setSelectedPhotoIds((current) => {
        const next = new Set(current);
        customerSelectedFiles.forEach((file) => next.delete(file.photoId));
        return next;
      });
      setDownloadError(null);
      return;
    }

    const next = new Set(selectedPhotoIds);
    customerSelectedFiles.forEach((file) => next.add(file.photoId));
    if (isMobileDevice()) {
      const nextFiles = info.files.filter((file) => next.has(file.photoId));
      const nextTotalBytes = nextFiles.reduce((total, file) => total + Math.max(0, file.byteSize), 0);
      if (nextFiles.length > MOBILE_MAX_FILE_COUNT) {
        setDownloadError(MOBILE_COUNT_LIMIT_MESSAGE);
        return;
      }
      if (nextTotalBytes > MOBILE_MAX_TOTAL_BYTES) {
        setDownloadError(MOBILE_BYTES_LIMIT_MESSAGE);
        return;
      }
    }

    setSelectedPhotoIds(next);
    setDownloadError(null);
  };
  const resetDownloadSelection = () => {
    setSelectedPhotoIds(new Set());
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
          setSelectedPhotoIds(new Set());
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
          setSelectedPhotoIds(new Set());
          return;
        }
        downloadFiles(files);
        setSelectedPhotoIds(new Set());
        setDownloadError("이 브라우저에서는 사진 앱 저장을 지원하지 않아 파일 다운로드로 전환했습니다.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        downloadFiles(files);
        setSelectedPhotoIds(new Set());
        setDownloadError("사진 앱으로 저장할 수 없어 파일 다운로드로 전환했습니다.");
      }
    } catch {
      setDownloadError("선택한 파일을 다운로드할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsDownloading(false);
    }
  };
  // ZIP이 여러 개일 때 한 번의 클릭으로 전부 자동 트리거하면 브라우저의 "여러 파일 자동
  // 다운로드 차단"에 걸려 일부만 받아지는 경우가 있어, 파트마다 실제 클릭을 받는다.
  const downloadArchivePart = async (partNumber: number) => {
    setDownloadError(null);
    setDownloadingPart(partNumber);
    try {
      const response = await fetch(`/api/c/original-download/archive?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("ZIP 다운로드 URL을 발급하지 못했습니다.");
      const data = await response.json() as { files?: PresignedOriginalArchiveDownloadFile[] };
      const file = (data.files ?? []).find((f) => f.partNumber === partNumber);
      if (!file) throw new Error("다운로드할 ZIP을 찾을 수 없습니다.");
      const link = document.createElement("a");
      link.href = file.url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadError("ZIP을 다운로드할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDownloadingPart(null);
    }
  };
  const triggerLabel = info.expiresAt ? `원본 다운로드 · ${formatExpiry(info.expiresAt)}까지` : "원본 다운로드";

  /* 밴드(sub 헤더)는 버튼 하나가 아니라 "설명 + 버튼" 한 줄이라 줄 전체를 이 컴포넌트가 그린다.
   * 만료일은 이 컴포넌트만 아는 값이라(info.expiresAt) 바깥에서 조립하려면 상태를 새어 보내야 한다.
   * 아카이브가 없으면 컴포넌트 자체가 아무것도 렌더하지 않으므로 밴드도 함께 사라진다.
   * 남은 기간은 고객 화면 공통 D-day 규칙(customerDDay + Badge)을 그대로 쓴다 — 셀렉 마감·검토 마감과 같은 표기다. */
  const expiryDDay = customerDDay(info.expiresAt);

  return (
    <>
      {variant === "subheader" ? (
        <div className="original-download-subheader">
          <span className="original-download-subheader-copy">
            <PackageOpen size={15} strokeWidth={1.8} aria-hidden />
            <strong>원본 다운로드</strong>
            {info.preparing ? (
              <span className="original-download-subheader-date">파일을 준비하고 있어요</span>
            ) : info.expiresAt ? (
              <>
                <span className="original-download-subheader-date">{formatExpiry(info.expiresAt)}까지</span>
                {expiryDDay && (
                  <Badge tone={expiryDDay.tone} theme="customerLight" className="font-mono">{expiryDDay.label}</Badge>
                )}
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={openDownloadModal}
            aria-label="납품용 원본 다운로드"
            className="original-download-banner-trigger"
          >
            받기
          </button>
        </div>
      ) : (
      <button
        type="button"
        onClick={openDownloadModal}
        aria-label="납품용 원본 다운로드"
        className={variant === "entry"
          ? "original-download-entry-trigger"
          : variant === "summary"
            ? "original-download-summary-trigger"
            : variant === "banner"
              ? "original-download-banner-trigger"
              : variant === "inline"
                ? "cp-btn-download"
                : undefined}
        style={variant === "entry" || variant === "summary" || variant === "banner" ? undefined : variant === "inline" ? {
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
        {variant === "summary" ? (
          <>
            <span className="original-download-summary-icon" aria-hidden><PackageOpen size={22} strokeWidth={1.7} /></span>
            <span className="original-download-summary-copy">
              <strong>원본 사진 {info.preparing ? "준비 중" : `${info.fileCount.toLocaleString()}장 (${formatStoredFileSizeBytes(info.totalBytes)})`}</strong>
              <span>{info.preparing ? "다운로드 파일을 준비하고 있어요" : info.expiresAt ? `${formatExpiry(info.expiresAt)}까지 다운로드 가능` : "원본 다운로드"}</span>
            </span>
          </>
        ) : variant === "banner" ? (
          "원본 다운로드"
        ) : (
          <>
            {variant === "entry" ? <Download size={18} strokeWidth={1.8} aria-hidden /> : <PackageOpen size={16} />}
            {variant === "entry" ? "원본 다운로드 받기" : triggerLabel}
          </>
        )}
      </button>
      )}

      {open && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="original-download-title"
          onClick={() => setOpen(false)}
          className="original-download-backdrop"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`original-download-modal is-${mode}`}
          >
            <span className="original-download-sheet-handle" aria-hidden="true" />
            <div className="original-download-header">
              <div>
                <h2 id="original-download-title" className="original-download-title">원본 사진 다운로드</h2>
                <p className="original-download-subtitle">촬영한 전체 원본을 내려받을 수 있어요.</p>
              </div>
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
                <span>사진</span>
                <strong>{info.preparing ? "준비 중" : `${info.fileCount.toLocaleString()}장`}</strong>
              </div>
              <div>
                <span>용량</span>
                <strong>{info.preparing ? "준비 중" : formatStoredFileSizeBytes(info.totalBytes)}</strong>
              </div>
              <div>
                <span>다운로드 기한</span>
                <strong>{info.preparing ? "준비 후 안내" : `${formatExpiry(info.expiresAt)}까지`}</strong>
              </div>
            </div>

            {info.available && (
              <div className="original-download-tabs" role="tablist" aria-label="원본 다운로드 방식">
                {(["archive", "files"] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => setMode(tab)} className={mode === tab ? "is-active" : undefined}>
                    {tab === "archive" ? <Archive size={16} aria-hidden="true" /> : <Images size={16} aria-hidden="true" />}
                    {tab === "archive" ? "전체 압축파일" : "사진 골라 받기"}
                  </button>
                ))}
              </div>
            )}

            {info.available && mode === "archive" && (
              <div className="original-download-archive-panel">
                {info.archiveBlocked ? (
                  <div className="original-download-state"><strong>전체 압축파일을 만들 수 없습니다</strong><span>원본 업로드가 완료되지 않은 사진 {info.incompleteOriginalCount.toLocaleString()}장이 있습니다. 작가가 원본을 복구하면 자동으로 준비가 시작됩니다.</span></div>
                ) : info.archivePreparing ? (
                  <div className="original-download-state original-download-progress-state">
                    <div className="original-download-progress-heading">
                      <strong>{archiveIsUploading ? "압축파일을 안전하게 저장하고 있어요" : "전체 압축파일을 만들고 있어요"}</strong>
                      <span>{archiveProgressPercent}%</span>
                    </div>
                    <div
                      className="original-download-progress-track"
                      role="progressbar"
                      aria-label="전체 원본 압축파일 준비 진행률"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={archiveProgressPercent}
                    >
                      <span style={{ width: `${archiveProgressPercent}%` }} />
                    </div>
                    <span>
                      {archiveProgressPercent > 0
                        ? `${(info.archiveProcessedFiles ?? 0).toLocaleString()} / ${info.fileCount.toLocaleString()}장 처리 · ${formatStoredFileSizeBytes(archiveProcessedBytes)} / ${formatStoredFileSizeBytes(info.totalBytes)}`
                        : `총 ${info.fileCount.toLocaleString()}장 · ${formatStoredFileSizeBytes(info.totalBytes)}의 작업을 시작하고 있어요.`}
                    </span>
                    <strong className="original-download-progress-eta">
                      {archiveRemainingLabel || (archiveProgressPercent > 0 ? "남은 시간을 계산하고 있어요" : "잠시만 기다려 주세요")}
                    </strong>
                    <span>이 창을 닫아도 준비는 계속됩니다. 필요한 사진만 골라 받는 기능은 지금 이용할 수 있어요.</span>
                  </div>
                ) : info.archiveFailed ? (
                  <div className="original-download-state is-error"><strong>압축파일을 준비하지 못했어요</strong><span>사진 골라 받기는 계속 이용할 수 있습니다.</span></div>
                ) : info.archiveFiles.length === 1 ? (
                  <>
                    <div className="original-download-ready-copy">
                      <span className="original-download-ready-icon"><Archive size={20} aria-hidden="true" /></span>
                      <div><strong>전체 원본 준비 완료</strong><span>{info.fileCount.toLocaleString()}장 · {formatStoredFileSizeBytes(info.totalBytes)}</span></div>
                    </div>
                    <button type="button" onClick={() => downloadArchivePart(info.archiveFiles[0].partNumber)} disabled={downloadingPart !== null} className="original-download-archive-primary">
                      <Download size={18} aria-hidden="true" />
                      {downloadingPart === info.archiveFiles[0].partNumber ? "다운로드 준비 중..." : "전체 원본 다운로드"}
                    </button>
                  </>
                ) : info.archiveFiles.length > 1 ? (
                  <div className="original-download-parts">
                    <div className="original-download-ready-copy">
                      <span className="original-download-ready-icon"><Archive size={20} aria-hidden="true" /></span>
                      <div>
                        <strong>전체 원본 준비 완료</strong>
                        <span>{info.fileCount.toLocaleString()}장 · {formatStoredFileSizeBytes(info.totalBytes)} · ZIP {info.archiveFiles.length}개</span>
                      </div>
                    </div>
                    <span className="original-download-parts-help">아래 파일을 하나씩 눌러 받아주세요.</span>
                    <div className="original-download-part-list">
                      {info.archiveFiles.map((file) => (
                        <button
                          key={file.partNumber}
                          type="button"
                          onClick={() => downloadArchivePart(file.partNumber)}
                          disabled={downloadingPart === file.partNumber}
                          className="original-download-part-button"
                        >
                          <span>파트 {file.partNumber} · {file.fileCount.toLocaleString()}장 · {formatStoredFileSizeBytes(file.byteSize)}</span>
                          <span>{downloadingPart === file.partNumber ? "다운로드 중..." : "다운로드"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {isMobile && info.archiveFiles.length > 0 && (
                  <p className="original-download-pc-note">
                    <Monitor size={15} aria-hidden="true" /> 용량이 큰 경우 PC에서 받는 것을 권장해요.
                  </p>
                )}
                {downloadError && <p role="status" className="original-download-inline-status">{downloadError}</p>}
              </div>
            )}

            {!info.available ? (
              <div className="original-download-unavailable">
                {info.archiveBlocked
                  ? `원본 업로드가 완료되지 않은 사진 ${info.incompleteOriginalCount.toLocaleString()}장이 있습니다. 작가가 원본을 복구하면 다운로드할 수 있어요.`
                  : info.preparing
                  ? "작가가 납품용 원본 파일을 준비하고 있습니다. 준비가 완료되면 이 화면에서 바로 다운로드할 수 있어요."
                  : info.failed
                    ? "납품용 원본 파일을 준비하는 중 문제가 발생했습니다. 작가가 다시 준비하면 다운로드할 수 있어요."
                    : "다운로드 기간이 종료되었습니다."}
              </div>
            ) : mode === "archive" ? (
              <div className="original-download-switch-hint">
                필요한 사진만 받고 싶다면 <button type="button" onClick={() => setMode("files")}>사진 골라 받기</button>
              </div>
            ) : (
              <div className="original-download-files-layout">
                <div className="original-download-files-toolbar">
                  <p className="original-download-files-help">
                    필요한 원본만 선택해 다운로드할 수 있어요. 전체 원본은 &apos;전체 압축파일&apos;에서 다운로드해 주세요.
                  </p>
                  {isMobile && (
                    <p className="original-download-files-help is-mobile-only">
                      휴대폰에서 안정적으로 저장하려면 한 번에 {MOBILE_MAX_FILE_COUNT}장, 총 {MOBILE_MAX_TOTAL_LABEL} 이내로 나누어 저장해 주세요.
                    </p>
                  )}
                  <div className="original-download-filter-row">
                    <label className={`original-download-selected-filter${customerSelectedFiles.length === 0 ? " is-disabled" : ""}`}>
                      <input
                        ref={customerSelectionCheckboxRef}
                        type="checkbox"
                        checked={allCustomerSelectionsChecked}
                        aria-checked={someCustomerSelectionsChecked ? "mixed" : allCustomerSelectionsChecked}
                        onChange={toggleCustomerSelectedFiles}
                        disabled={customerSelectedFiles.length === 0}
                      />
                      <span>내가 선택한 사진 모두 체크</span>
                      <span className="original-download-selected-count">{customerSelectedFiles.length.toLocaleString()}장</span>
                    </label>
                    <button
                      type="button"
                      onClick={resetDownloadSelection}
                      disabled={selectedFiles.length === 0}
                      className="original-download-reset-selection"
                      aria-label="다운로드 선택 초기화"
                      title="다운로드 선택 초기화"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파일명 검색" className="original-download-search" />
                </div>

                <div className="original-download-file-list">
                  {visibleFiles.map((file) => (
                    <label key={file.photoId} className="original-download-file-row">
                      <input type="checkbox" checked={selectedPhotoIds.has(file.photoId)} onChange={() => toggleFile(file)} aria-label={`${file.filename} 선택`} />
                      <span className="original-download-file-identity">
                        <span className="original-download-filename">{file.filename}</span>
                        {file.isSelected && <span className="original-download-selected-badge">선택됨</span>}
                      </span>
                      <span className="original-download-file-size">{formatStoredFileSizeBytes(file.byteSize)}</span>
                    </label>
                  ))}
                  {visibleFiles.length === 0 && (
                    <div className="original-download-empty">
                      검색 결과가 없습니다.
                    </div>
                  )}
                </div>

                <div className="original-download-footer">
                  {downloadError && <p role="status" className="original-download-status">{downloadError}</p>}
                  <div className="original-download-footer-row">
                    <span className="original-download-selection-summary">
                      {isMobile
                        ? `${selectedFiles.length.toLocaleString()} / ${MOBILE_MAX_FILE_COUNT} · ${formatStoredFileSizeBytes(selectedTotalBytes)}`
                        : `다운로드 선택 ${selectedFiles.length.toLocaleString()}개 · ${formatStoredFileSizeBytes(selectedTotalBytes)}`}
                    </span>
                    <button type="button" onClick={downloadSelected} disabled={selectedFiles.length === 0 || isDownloading} className="original-download-submit">
                      {isDownloading
                        ? "사진 준비 중..."
                        : isMobile
                          ? `선택한 사진 저장 (${selectedFiles.length.toLocaleString()})`
                          : `선택한 파일 다운로드 (${selectedFiles.length.toLocaleString()})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      <style>{`
        .original-download-entry-trigger {
          display: flex;
          width: 100%;
          min-height: 48px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid #dde1e4;
          border-radius: 8px;
          background: #f7f7f6;
          color: #26282c;
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          line-height: 22px;
          letter-spacing: -0.02em;
          cursor: pointer;
          transition: border-color 140ms ease, background-color 140ms ease, transform 100ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .original-download-entry-trigger:hover {
          border-color: #c9cdd2;
          background: #f0f1f1;
        }
        .original-download-entry-trigger:active {
          background: #e8e9e9;
          transform: translateY(1px);
        }
        .original-download-entry-trigger:focus-visible {
          outline: 2px solid #ff4d00;
          outline-offset: 2px;
        }
        .original-download-summary-trigger {
          display: flex;
          width: 100%;
          min-height: 90px;
          box-sizing: border-box;
          align-items: center;
          gap: 20px;
          padding: 20px;
          border: 1px solid #ebeef0;
          border-radius: 8px;
          background: #fff;
          color: #2c2c2b;
          text-align: left;
          font-family: Pretendard, "Pretendard Variable", -apple-system, sans-serif;
          cursor: pointer;
          transition: border-color 140ms ease, background-color 140ms ease;
        }
        .original-download-summary-trigger:hover { border-color: #c6cbd0; background: #fafafa; }
        .original-download-summary-trigger:focus-visible,
        .original-download-banner-trigger:focus-visible { outline: 2px solid #006fff; outline-offset: 2px; }
        .original-download-summary-icon {
          width: 51px;
          height: 51px;
          flex: 0 0 51px;
          display: grid;
          place-items: center;
          border: 1px solid #c6cbd0;
          background: #f1f3f6;
          color: #7d7a75;
        }
        .original-download-summary-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 4px; }
        .original-download-summary-copy strong { overflow: hidden; color: #2c2c2b; font-size: 14px; line-height: 22px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .original-download-summary-copy span { color: #7d7a75; font-size: 14px; line-height: 22px; font-weight: 400; }
        /* sub 헤더 밴드 — 모바일 .locked-mobile-status와 같은 주황 틴트 띠 */
        .original-download-subheader {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          min-height: 44px; box-sizing: border-box; padding: 8px 32px;
          background: rgba(255, 77, 0, 0.06);
          border-bottom: 1px solid rgba(255, 77, 0, 0.16);
        }
        .original-download-subheader-copy {
          display: flex; align-items: center; gap: 8px; min-width: 0;
          color: #26282c;
          font: 12px/1.4 Pretendard, "Pretendard Variable", sans-serif; letter-spacing: -0.2px;
        }
        .original-download-subheader-copy strong { font-weight: 700; }
        /* 주의: 자식 span 전체에 색을 주면 Badge(=span)의 톤 색까지 덮어써 긴급(빨강)이 회색이 된다.
         * 날짜 텍스트에만 클래스를 걸어 색을 준다. */
        .original-download-subheader-date { color: #6f6f6f; }
        .original-download-banner-trigger {
          min-width: 70px;
          height: 30px;
          padding: 0 8px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          background: #fff;
          color: #26282c;
          font-family: Pretendard, "Pretendard Variable", sans-serif;
          font-size: 10px;
          line-height: 16px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: border-color 140ms ease, background-color 140ms ease;
        }
        .original-download-banner-trigger:hover { border-color: #bfbfbf; background: #f7f7f6; }
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
        .original-download-filter-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .original-download-selected-filter {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(255, 255, 255, 0.72);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .original-download-selected-filter.is-disabled { opacity: 0.4; cursor: default; }
        .original-download-selected-filter input {
          width: 16px;
          height: 16px;
          margin: 0;
          flex: 0 0 auto;
          accent-color: var(--accent, #4f7eff);
        }
        .original-download-selected-count {
          min-width: 20px;
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.58);
          font-size: 10px;
          line-height: 1.4;
          text-align: center;
        }
        .original-download-reset-selection {
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.62);
          cursor: pointer;
        }
        .original-download-reset-selection:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .original-download-reset-selection:disabled { opacity: 0.32; cursor: default; }
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
        .original-download-file-identity {
          min-width: 0;
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .original-download-filename {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .original-download-selected-badge {
          flex: 0 0 auto;
          padding: 2px 6px;
          border: 1px solid rgba(var(--accent-rgb), 0.42);
          border-radius: 999px;
          background: rgba(var(--accent-rgb), 0.12);
          color: var(--accent, #91b1ff);
          font-size: 10px;
          font-weight: 700;
        }
        .original-download-empty {
          min-height: 96px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.42);
          font-size: 12px;
        }
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
          .original-download-filter-row { min-height: 32px; }
          .original-download-file-list { padding-right: 0; }
          .original-download-file-row { min-height: 48px; padding: 11px 10px; }
          .original-download-footer { margin-top: 8px; padding-top: 10px; }
          .original-download-footer-row { flex-direction: column; align-items: stretch; gap: 8px; }
          .original-download-selection-summary { min-width: 0; text-align: center; }
          .original-download-submit { width: 100%; flex: 0 0 auto; }
        }

        /* 라이트 다운로드 경험: 압축은 간결하게, 사진 선택은 작업 공간을 넓게 쓴다. */
        .original-download-backdrop { align-items: center; background: rgba(20, 20, 20, 0.42); backdrop-filter: blur(3px); }
        .original-download-modal {
          width: min(720px, 100%);
          height: auto;
          max-height: min(820px, calc(100dvh - 48px));
          padding: 24px;
          background: #fff;
          border: 1px solid #e8e8e6;
          border-radius: 18px;
          color: #191918;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
        }
        .original-download-modal.is-files { height: min(820px, calc(100dvh - 48px)); }
        .original-download-sheet-handle { display: none; }
        .original-download-header { align-items: flex-start; margin-bottom: 18px; }
        .original-download-title { margin: 0; color: #191918; font-size: 22px; line-height: 1.3; letter-spacing: -0.035em; }
        .original-download-subtitle { margin: 5px 0 0; color: #77746f; font-size: 13px; line-height: 1.5; }
        .original-download-close { color: #77746f; }
        .original-download-close:hover { background: #f3f3f1; color: #191918; }
        .original-download-meta {
          gap: 0;
          overflow: hidden;
          margin-bottom: 16px;
          padding: 14px 0;
          border: 1px solid #ebebe8;
          border-radius: 12px;
          background: #f8f8f7;
        }
        .original-download-meta > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 0 16px; border-left: 1px solid #e4e4e1; }
        .original-download-meta > div:first-child { border-left: 0; }
        .original-download-meta span { color: #8a8782; font-size: 11px; line-height: 1.4; }
        .original-download-meta strong { overflow: hidden; color: #292927; font-size: 14px; line-height: 1.45; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .original-download-tabs { gap: 4px; margin-bottom: 16px; padding: 4px; border-radius: 10px; background: #f1f1ef; }
        .original-download-tabs button {
          min-height: 40px;
          display: inline-flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 12px;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: #77746f;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .original-download-tabs button.is-active { border-color: rgba(255, 77, 0, 0.18); background: #fff; color: #e84600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
        .original-download-archive-panel { margin-bottom: 12px; padding: 18px; border: 1px solid #ebebe8; border-radius: 12px; background: #fff; font-size: 13px; }
        .original-download-state { display: flex; flex-direction: column; gap: 5px; }
        .original-download-state strong { color: #292927; font-size: 14px; }
        .original-download-state span { color: #77746f; line-height: 1.55; }
        .original-download-state.is-error strong { color: #c13f22; }
        .original-download-progress-state { gap: 10px; }
        .original-download-progress-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .original-download-progress-heading > span { flex: 0 0 auto; color: #e84600; font-size: 13px; font-weight: 700; }
        .original-download-progress-track { width: 100%; height: 8px; overflow: hidden; border-radius: 999px; background: #ecece9; }
        .original-download-progress-track > span { display: block; height: 100%; border-radius: inherit; background: #ff4d00; transition: width 300ms ease; }
        .original-download-progress-eta { color: #e84600 !important; font-size: 13px !important; }
        .original-download-ready-copy { display: flex; align-items: center; gap: 12px; }
        .original-download-ready-copy > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .original-download-ready-copy strong { color: #292927; font-size: 14px; line-height: 1.5; }
        .original-download-ready-copy span:not(.original-download-ready-icon) { color: #77746f; font-size: 12px; }
        .original-download-ready-icon { width: 40px; height: 40px; flex: 0 0 40px; display: grid; place-items: center; border-radius: 10px; background: rgba(255, 77, 0, 0.09); color: #ff4d00; }
        .original-download-archive-primary {
          width: 100%;
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 16px;
          border: 0;
          border-radius: 10px;
          background: #ff4d00;
          color: #fff;
          font: inherit;
          font-size: 15px;
          font-weight: 750;
          cursor: pointer;
        }
        .original-download-archive-primary:hover:not(:disabled) { background: #e84600; }
        .original-download-archive-primary:disabled { opacity: 0.55; cursor: wait; }
        .original-download-parts { display: flex; flex-direction: column; gap: 12px; }
        .original-download-parts-help { color: #8a8782; font-size: 12px; }
        .original-download-part-list { display: flex; flex-direction: column; gap: 7px; }
        .original-download-part-button { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid #e3e3df; border-radius: 8px; background: #f8f8f7; color: #292927; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
        .original-download-part-button span:last-child { color: #e84600; }
        .original-download-pc-note { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; color: #77746f; font-size: 12px; line-height: 1.5; }
        .original-download-inline-status { margin: 10px 0 0; color: #c13f22; font-size: 12px; }
        .original-download-unavailable, .original-download-switch-hint { padding: 13px 14px; border-radius: 9px; background: #f8f8f7; color: #77746f; font-size: 12.5px; line-height: 1.5; text-align: center; }
        .original-download-switch-hint button { padding: 0; border: 0; background: none; color: #e84600; font: inherit; font-weight: 700; cursor: pointer; }
        .original-download-files-help { margin: 0 0 8px; color: #77746f; font-size: 12px; line-height: 1.5; }
        .original-download-selected-filter { color: #4d4b47; }
        .original-download-selected-filter input, .original-download-file-row input { accent-color: #ff4d00; }
        .original-download-selected-count { background: #f0efed; color: #77746f; }
        .original-download-reset-selection { border-color: #dededa; background: #fff; color: #77746f; }
        .original-download-reset-selection:hover:not(:disabled) { border-color: #bdbdb8; background: #f5f5f3; color: #292927; }
        .original-download-search { border-color: #dededa; background: #fff; color: #292927; }
        .original-download-search::placeholder { color: #aaa7a2; }
        .original-download-search:focus { border-color: #ff4d00; box-shadow: 0 0 0 3px rgba(255, 77, 0, 0.1); }
        .original-download-file-row { background: #f7f7f5; color: #292927; }
        .original-download-file-row:hover { background: #f0f0ed; }
        .original-download-file-row:has(input:checked) { background: rgba(255, 77, 0, 0.08); }
        .original-download-file-size { flex-shrink: 0; color: #8a8782; }
        .original-download-selected-badge { border-color: rgba(255, 77, 0, 0.3); background: rgba(255, 77, 0, 0.08); color: #e84600; }
        .original-download-empty { color: #aaa7a2; }
        .original-download-footer { border-top-color: #ecece9; background: #fff; box-shadow: 0 -12px 24px rgba(255, 255, 255, 0.92); }
        .original-download-status { color: #c13f22; }
        .original-download-selection-summary { color: #77746f; }
        .original-download-submit { background: #ff4d00; color: #fff; }
        .original-download-submit:hover:not(:disabled) { background: #e84600; }
        .original-download-submit:disabled { background: #e8e8e5; color: #aaa7a2; }

        @media (max-width: 640px) {
          .original-download-backdrop { align-items: flex-end; padding: 0; }
          .original-download-modal { width: 100%; height: auto; max-height: calc(100dvh - 48px); padding: 10px 18px max(18px, env(safe-area-inset-bottom, 0px)); border: 0; border-radius: 20px 20px 0 0; }
          .original-download-modal.is-files { height: 100dvh; max-height: 100dvh; padding-top: max(14px, env(safe-area-inset-top, 0px)); border-radius: 0; }
          .original-download-sheet-handle { width: 36px; height: 4px; display: block; flex: 0 0 auto; margin: 0 auto 14px; border-radius: 999px; background: #d9d8d5; }
          .original-download-modal.is-files .original-download-sheet-handle { display: none; }
          .original-download-header { margin-bottom: 14px; }
          .original-download-title { font-size: 20px; }
          .original-download-subtitle { font-size: 12.5px; }
          .original-download-meta { margin-bottom: 12px; padding: 12px 0; }
          .original-download-meta > div { padding: 0 10px; }
          .original-download-meta span { font-size: 10px; }
          .original-download-meta strong { font-size: 12.5px; }
          .original-download-tabs { margin-bottom: 12px; }
          .original-download-archive-panel { margin-bottom: 10px; padding: 15px; }
          .original-download-archive-primary { min-height: 52px; }
          .original-download-switch-hint { padding: 11px 12px; }
          .original-download-files-toolbar p:first-child { display: none; }
        }
      `}</style>
    </>
  );
}
