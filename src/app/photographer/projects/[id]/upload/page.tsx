"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, cloneElement } from "react";
import { createPortal, flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { differenceInDays } from "date-fns";
import {
  Link2,
  Eye,
  ChevronRight,
  Trash2,
  Lock,
  RefreshCw,
  CheckCircle2,
  LayoutGrid,
  List,
  Upload,
  X,
  Loader2,
  ImageIcon,
  ImagePlus,
  Plus,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { PrevNextButton } from "@/components/PrevNextButton";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import { createClient } from "@/lib/supabase/client";
import { parseBetaLimitError, DEFAULT_BETA_MAX_PHOTOS_PER_PROJECT } from "@/lib/beta-limits";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { createThumbLoadQueue, useQueuedThumbSrc, type ThumbLoadQueue } from "@/lib/thumb-load-queue";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import type { Project, ProjectStatus, Photo, PhotoGroupInfo } from "@/types";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";
import { CustomerInviteShareModal } from "@/components/photographer/CustomerInviteShareModal";
import GeminiAnalysisPanel from "@/components/photographer/GeminiAnalysisPanel";

// ---------- constants ----------
const ACCENT = "var(--accent)";
const ACCENT_DIM = "rgba(var(--accent-rgb), 0.12)";
const ACCENT_GLOW = "rgba(var(--accent-rgb), 0.4)";
const BORDER = "var(--border)";
const BORDER_MID = "var(--border-strong)";
const SURFACE_0 = "var(--background)";
const SURFACE_1 = "var(--surface-raised)";
const SURFACE_2 = "var(--surface)";
const MONO = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif";
const TEXT_MUTED = "var(--subtle-foreground)";
const TEXT_NORMAL = "var(--muted-foreground)";
const TEXT_BRIGHT = "var(--foreground)";

// ---------- upload constants ----------
const UPLOAD_PHOTOS_PATH = "/api/photographer/upload/photos";
const UPLOAD_MAX_ATTEMPTS = 3;
const BATCH_SIZE = 8;
const PC_CONCURRENCY = 5;
// 원본 포함 업로드는 압축본 전송 뒤 R2 PUT까지 같은 슬롯을 점유한다.
// 일반 데스크톱은 4개, CPU·메모리·회선 힌트가 충분한 경우에만 6개까지 올린다.
const ORIGINAL_PC_CONCURRENCY = 4;
const ORIGINAL_PC_CONCURRENCY_FAST = 6;
const MOBILE_BATCH_SIZE = 3;
const MOBILE_CONCURRENCY = 1;
const INVITE_ORIGINAL_PROCESSING_MAX_ATTEMPTS = 15;
const INVITE_ORIGINAL_PROCESSING_RETRY_MS = 1000;
const ACCEPT_TYPES = "image/*,image/heic,image/heif";
const RAW_EXTENSIONS = new Set([
  ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2",
  ".dng", ".raf", ".rw2", ".orf", ".pef", ".ptx", ".srw",
  ".x3f", ".3fr", ".fff", ".rwl", ".kdc", ".dcr",
]);
function isRawFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 && RAW_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

/** 원본 사진을 추가 업로드할 수 있는 상태 — preparing은 자유, selecting은 경고 후 진행 */
const UPLOADABLE_STATUSES: ReadonlyArray<ProjectStatus> = ["preparing", "selecting"];
function canUploadOriginals(status: ProjectStatus): boolean {
  return UPLOADABLE_STATUSES.includes(status);
}

// ---------- upload helpers ----------
function uploadPhotosUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/api/upload/photos`;
  return UPLOAD_PHOTOS_PATH;
}

/**
 * 업로드 리소스 상한을 적용할 모바일 기기 판별.
 * iPadOS 13+ Safari는 데스크톱처럼 `Macintosh` UA를 보내므로 터치 포인트도 함께 확인한다.
 */
function isMobileUploadClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (/Android/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function getDesktopUploadConcurrency(includeOriginal: boolean): number {
  const device = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
    deviceMemory?: number;
  };
  const connection = device.connection;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return 2;
  if (connection?.effectiveType === "3g") return includeOriginal ? 3 : 4;
  if (!includeOriginal) return PC_CONCURRENCY + 1;

  // Network Information API의 downlink는 업로드 속도 자체는 아니지만 회선 품질의 힌트다.
  // 원본은 압축본과 함께 메모리에 머물므로, 고사양 데스크톱에서만 동시 PUT을 늘린다.
  const cores = navigator.hardwareConcurrency ?? 4;
  const memoryGiB = device.deviceMemory ?? 4;
  const hasFastHardware = cores >= 8 && memoryGiB >= 8;
  const hasGoodNetworkHint = connection?.downlink === undefined || connection.downlink >= 10;
  return hasFastHardware && hasGoodNetworkHint
    ? ORIGINAL_PC_CONCURRENCY_FAST
    : ORIGINAL_PC_CONCURRENCY;
}

function shouldRetryStatus(status: number) {
  return [408, 429, 502, 503, 504].includes(status);
}

type XhrResult = { ok: boolean; status: number; json: () => Promise<unknown> };

type XhrTransferOpts = { onRequestBodySent?: () => void };

async function xhrPostWithRetry(
  url: string,
  buildForm: () => FormData,
  token: string,
  onProgress: (loaded: number, total: number) => void,
  transferOpts?: XhrTransferOpts,
): Promise<XhrResult> {
  const crossOrigin = /^https?:\/\//i.test(url);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await new Promise<XhrResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        let bodySentReported = false;
        const reportBodySent = () => {
          if (bodySentReported) return;
          bodySentReported = true;
          transferOpts?.onRequestBodySent?.();
        };
        xhr.upload.onload = () => { reportBodySent(); };
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0) {
            onProgress(ev.loaded, ev.total);
            if (ev.loaded >= ev.total) reportBodySent();
          } else if (ev.loaded > 0) onProgress(ev.loaded, 0);
        };
        xhr.onload = () => resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          json: async () => { try { return JSON.parse(xhr.responseText || "{}"); } catch { return {}; } },
        });
        xhr.onerror = () => reject(new TypeError("NetworkError"));
        xhr.send(buildForm());
      });
      if (shouldRetryStatus(result.status)) {
        if (result.status === 503) {
          const detail = await readDetail(result);
          if (isAuthLikeDetail(detail)) return result;
        }
        lastErr = new Error(`HTTP ${result.status}`);
        if (attempt < UPLOAD_MAX_ATTEMPTS) { await new Promise<void>((r) => setTimeout(r, 800 * attempt)); continue; }
      }
      return result;
    } catch (e) {
      if (e instanceof TypeError && crossOrigin) throw e;
      lastErr = e;
      if (attempt < UPLOAD_MAX_ATTEMPTS) { await new Promise<void>((r) => setTimeout(r, 800 * attempt)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

async function postPhotosUpload(
  buildForm: () => FormData,
  token: string,
  useProxyRef: { current: boolean },
  onProgress: (loaded: number, total: number) => void,
  transferOpts?: XhrTransferOpts,
): Promise<XhrResult> {
  const primary = uploadPhotosUrl();
  if (useProxyRef.current || primary === UPLOAD_PHOTOS_PATH) {
    return xhrPostWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token, onProgress, transferOpts);
  }
  try {
    return await xhrPostWithRetry(primary, buildForm, token, onProgress, transferOpts);
  } catch (e) {
    if (e instanceof TypeError) {
      useProxyRef.current = true;
      return xhrPostWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token, onProgress, transferOpts);
    }
    throw e;
  }
}

function isNetworkFailure(e: unknown) {
  if (e instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && e instanceof DOMException) return e.name === "NetworkError";
  return false;
}

type OriginalPresignedItem = {
  job_id: string;
  url: string;
  source_key: string;
  content_type: string;
  expires_at: string;
};

type FailedOriginalTransfer = {
  presigned: OriginalPresignedItem;
  file: File;
};

function createClientUploadId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type PendingOriginalItem = {
  id: string;
  original_filename: string | null;
  original_file_size: number | null;
  original_last_modified: number | null;
  created_at: string;
};

/**
 * 업로드 세션 동안 사진 카드의 정체성을 유지하는 로컬 미리보기.
 * queued → uploading → pending으로 상태가 바뀌어도 tempId/sourceIndex를 유지해
 * React 카드 재마운트와 그리드 재정렬을 막는다. blobUrl은 단계별로 표시 가능한
 * 이미지(큐: 원본, 전송/완료: 압축 JPEG)로 교체한다.
 */
type UploadPreview = {
  tempId: string;
  blobUrl: string;
  filename: string;
  sourceIndex: number;
};

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = file.name.slice(dot).toLowerCase();
  return ext === ".heic" || ext === ".heif";
}

function estimateUploadMinutes(fileCount: number, withOriginal: boolean, isMobile: boolean): number {
  const compressSec = fileCount * 0.15;
  const fastApiSec = (fileCount * 3 * 8) / 100;
  const r2Sec = withOriginal ? (fileCount * 10 * 8) / 100 : 0;
  const total = (compressSec + fastApiSec + r2Sec) * (isMobile ? 1.5 : 1);
  return Math.max(1, Math.round(total / 60));
}

function confirmOriginalUploadUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/api/upload/originals/confirm`;
  return "/api/photographer/upload/originals/confirm";
}

function finalizeOriginalUploadUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/api/upload/originals/finalize`;
  return "/api/photographer/upload/originals/finalize";
}

async function putOriginalToR2(
  presigned: OriginalPresignedItem,
  file: File,
  token?: string,
): Promise<boolean> {
  let url = presigned.url;
  let contentType = presigned.content_type;
  // 정상 경로는 1회 PUT로 끝난다. 네트워크/5xx/만료처럼 복구 가능한 실패에만 최대 2회 더 시도한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (res.ok) return true;
      if (!shouldRetryStatus(res.status) && res.status !== 403) return false;
    } catch {
      // 응답 유실이면 객체가 이미 저장됐을 수 있으므로 아래 recover의 HEAD로 먼저 확인한다.
    }

    if (token) {
      try {
        const result = await recoverOriginalJob(presigned.job_id, token);
        if (result.status === "confirmed") return true;
        url = result.url;
        contentType = result.content_type;
      } catch {
        // recover 자체가 일시 실패해도 남은 횟수에서 기존 URL로 재시도한다.
      }
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return false;
}

async function confirmOriginalUpload(jobId: string, token: string): Promise<boolean> {
  const url = confirmOriginalUploadUrl();
  // R2 PUT은 성공했는데 완료 확인 요청만 일시 실패하면, 실제 원본이 있어도
  // awaiting_upload에 남아 고객 링크 준비가 영구히 멈출 수 있다. 짧게 재시도한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.append("job_id", jobId);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) return true;
      if (!shouldRetryStatus(res.status)) return false;
    } catch {
      // 네트워크 일시 단절은 다음 재시도로 복구를 시도한다.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return false;
}

async function fetchPendingOriginals(projectId: string, token: string): Promise<PendingOriginalItem[]> {
  try {
    const res = await fetch(`/api/photographer/upload/originals/pending?project_id=${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => ({ jobs: [] })) as { jobs: PendingOriginalItem[] };
    return body.jobs || [];
  } catch {
    return [];
  }
}

type RecoverResult =
  | { status: "confirmed" }
  | { status: "needs_upload"; url: string; source_key: string; content_type: string };

async function recoverOriginalJob(jobId: string, token: string): Promise<RecoverResult> {
  const form = new FormData();
  form.append("job_id", jobId);
  const res = await fetch("/api/photographer/upload/originals/recover", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return await res.json() as RecoverResult;
}

/** PUT은 성공했지만 confirm 응답이 유실된 경우, R2 HEAD 기반 recover로 완료를 확정한다. */
async function confirmOrRecoverOriginalUpload(jobId: string, token: string): Promise<boolean> {
  if (await confirmOriginalUpload(jobId, token)) return true;
  try {
    return (await recoverOriginalJob(jobId, token)).status === "confirmed";
  } catch {
    return false;
  }
}

type OriginalFinalizeResult = {
  ok: boolean;
  total: number;
  accepted: number;
  completed: number;
  incomplete: number;
  missing_jobs: number;
};

async function finalizeOriginalUpload(projectId: string, token: string): Promise<OriginalFinalizeResult | null> {
  try {
    const form = new FormData();
    form.append("project_id", projectId);
    const res = await fetch(finalizeOriginalUploadUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) return null;
    return await res.json() as OriginalFinalizeResult;
  } catch {
    return null;
  }
}

/** 새로고침·일시 네트워크 오류 뒤에도 이미 R2에 있는 원본은 재선택 없이 자동 복구한다.
 * 대량 중단 상황에서 R2 HEAD 요청이 한꺼번에 몰리지 않게 첫 50건만, 3개씩 확인한다. */
async function autoConfirmUploadedOriginals(jobs: PendingOriginalItem[], token: string): Promise<number> {
  const candidates = jobs.slice(0, 50);
  let nextIndex = 0;
  let recovered = 0;
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
    while (nextIndex < candidates.length) {
      const job = candidates[nextIndex++];
      try {
        if ((await recoverOriginalJob(job.id, token)).status === "confirmed") recovered++;
      } catch {
        // 실제로 업로드되지 않은 파일은 기존 복구 배너에서 파일 재선택으로 처리한다.
      }
    }
  }));
  return recovered;
}

async function abandonOriginalJob(jobId: string, token: string): Promise<void> {
  const form = new FormData();
  form.append("job_id", jobId);
  await fetch("/api/photographer/upload/originals/abandon", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function reportOriginalUploadFailure(jobId: string, token: string): Promise<void> {
  const form = new FormData();
  form.append("job_id", jobId);
  form.append("stage", "deferred_put_or_confirm");
  await fetch("/api/photographer/upload/originals/report-failure", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function readDetail(res: { json: () => Promise<unknown> }): Promise<string | null> {
  try {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    return typeof body?.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

function isAuthLikeStatus(status: number) {
  return status === 401 || status === 403;
}

function isAuthLikeDetail(detail: string | null) {
  if (!detail) return false;
  return /인증|Token|Invalid token|JWKS|Unauthorized/i.test(detail);
}

// ---------- thumbnail (스크롤 루트 기준: 보이는 영역 근처에서만 src 로드) ----------
function PhotoThumb({
  photo,
  index,
  onDelete,
  deletingId,
  isEditMode,
  scrollRootRef,
  thumbQueue,
  onPhotoClick,
  groupBadge,
  onGroupBadgeClick,
  inExpandedGroup,
  isCompressing,
}: {
  photo: Photo;
  index: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  /** DATABANK 스크롤 박스 — 없으면 즉시 로드 */
  scrollRootRef?: React.RefObject<HTMLElement | null>;
  thumbQueue: ThumbLoadQueue;
  onPhotoClick?: (index: number) => void;
  /** AI 유사컷 대표컷 배지 — 토글 ON이고 이 사진이 대표컷이며 그룹원이 더 있을 때만 전달됨 */
  groupBadge?: { groupId: string; restCount: number; isExpanded: boolean };
  onGroupBadgeClick?: (e: React.MouseEvent, groupId: string) => void;
  /** 펼쳐진 그룹(대표컷+멤버 전체)에 속함 — 그룹 경계를 테두리로 시각 구분 */
  inExpandedGroup?: boolean;
  /** 현재 압축 중인 사진 — 펄싱 오버레이 표시 */
  isCompressing?: boolean;
}) {
  // 업로드 카드의 raw → 압축본 URL 교체는 기존 이미지를 지우지 않고 새 URL을 먼저
  // 해독한 뒤 겹쳐서 전환한다. 이미지가 없거나 검게 보이는 프레임을 만들지 않는다.
  const [preview, setPreview] = useState<{
    displayedUrl: string;
    loadedUrl: string | undefined;
    transitionUrl: string | null;
    transitionReady: boolean;
  }>({ displayedUrl: photo.url, loadedUrl: undefined, transitionUrl: null, transitionReady: false });
  const transitionTimerRef = useRef<number | null>(null);
  const { displayedUrl, loadedUrl, transitionUrl, transitionReady } = preview;
  const displayedLoaded = loadedUrl === displayedUrl;
  const deleting = deletingId === photo.id;

  // DB 사진은 기존 큐 로딩 동작을 유지하고, 로컬 업로드 프리뷰의 URL 교체만 전환 상태로 잡는다.
  // 이전 props를 비교해 렌더 중 한 번만 상태를 맞추는 React 권장 패턴이다.
  if (!photo.isPending && (displayedUrl !== photo.url || transitionUrl !== null || transitionReady)) {
    setPreview({ displayedUrl: photo.url, loadedUrl, transitionUrl: null, transitionReady: false });
  } else if (photo.isPending && photo.url !== displayedUrl && photo.url !== transitionUrl) {
    setPreview((prev) => ({ ...prev, transitionUrl: photo.url, transitionReady: false }));
  }

  useEffect(() => {
    if (photo.isPending || transitionTimerRef.current === null) return;
    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, [photo.isPending]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  // blob URL(isPending)은 큐를 건너뛰고 즉시 로드 — 로컬 메모리라 네트워크 요청이 없다.
  const { cellRef, imgRef, shouldLoad, handleLoad, handleError } = useQueuedThumbSrc(displayedUrl, {
    queue: thumbQueue,
    rootRef: scrollRootRef,
    bypass: !scrollRootRef || !!photo.isPending,
  });

  return (
    <div
      ref={cellRef}
      className="prj-data-cell"
      onClick={() => !photo.isPending && onPhotoClick?.(index)}
      style={{
        background: "var(--background)",
        border: photo.isPending
          ? isCompressing
            ? `2px solid ${ACCENT}`
            : "1px solid rgba(var(--accent-rgb), 0.4)"
          : inExpandedGroup
          ? `2px solid ${ACCENT}`
          : `1px solid ${BORDER}`,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* square thumb */}
      <div style={{ position: "relative", width: "100%", paddingBottom: "100%", background: "var(--background)" }}>
        <div className="prj-overlay" />
        {/* XHR 전송 중 스피너 */}
        {photo.isUploading && (
          <div style={{ position: "absolute", top: 5, right: 5, zIndex: 10, width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(var(--accent-rgb), 0.25)", borderTopColor: "rgba(var(--accent-rgb), 0.85)", animation: "spin 0.9s linear infinite" }} />
        )}
        {/* 현재 압축 중 오버레이 */}
        {isCompressing && (
          <div className="prj-compressing-overlay">
            <Loader2 size={16} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {/* filename overlay */}
        <div
          style={{
            position: "absolute",
            left: 6,
            right: 6,
            bottom: 6,
            zIndex: 6,
            background: "rgba(0,0,0,0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "4px 6px",
            fontFamily: MONO,
            fontSize: 9,
            color: "var(--subtle-foreground)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={photo.originalFilename ?? undefined}
        >
          {photo.originalFilename ?? `FRAME_${String(index + 1).padStart(4, "0")}`}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--background)",
            transition: "opacity 0.25s",
            opacity: displayedLoaded || transitionReady ? 0 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <ImageIcon size={10} color="var(--subtle-foreground)" />
        </div>
        {shouldLoad && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imgRef}
            src={displayedUrl}
            alt=""
            loading={photo.isPending ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => {
              setPreview((prev) => ({ ...prev, loadedUrl: displayedUrl }));
              handleLoad();
            }}
            onError={handleError}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: displayedLoaded && !transitionReady ? 1 : 0,
              transition: "opacity 0.25s",
            }}
          />
        )}
        {/* 다음 로컬 미리보기는 투명 상태로 먼저 해독하고, 성공했을 때만 현재 사진 위로 페이드한다. */}
        {photo.isPending && transitionUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={transitionUrl}
            alt=""
            loading="eager"
            decoding="async"
            onLoad={() => {
              if (transitionReady) return;
              setPreview((prev) => ({ ...prev, transitionReady: true }));
              transitionTimerRef.current = window.setTimeout(() => {
                setPreview((prev) => ({
                  ...prev,
                  displayedUrl: transitionUrl,
                  loadedUrl: transitionUrl,
                  transitionUrl: null,
                  transitionReady: false,
                }));
                transitionTimerRef.current = null;
              }, 180);
            }}
            onError={() => {
              // 새 미리보기를 표시할 수 없으면 이미 보이던 원본을 그대로 유지한다.
              setPreview((prev) => ({ ...prev, transitionUrl: null, transitionReady: false }));
            }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: transitionReady ? 1 : 0,
              transition: "opacity 0.18s ease-out",
              pointerEvents: "none",
            }}
          />
        )}
        {isEditMode && (
          <button
            className="prj-del-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(photo.id);
            }}
            disabled={deleting}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 20,
              height: 20,
              background: "rgba(255,71,87,0.9)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
            }}
            aria-label="사진 삭제"
          >
            {deleting ? <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} /> : <X size={11} strokeWidth={2.5} color="var(--foreground)" />}
          </button>
        )}
        {groupBadge && (
          <button
            type="button"
            className="prj-group-badge"
            onClick={(e) => onGroupBadgeClick?.(e, groupBadge.groupId)}
            aria-label={`유사컷 ${groupBadge.restCount}장 ${groupBadge.isExpanded ? "접기" : "펼치기"}`}
          >
            {groupBadge.isExpanded ? `${groupBadge.restCount + 1}장 −` : `+${groupBadge.restCount}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** 그리드 최소 셀 너비 — `repeat(auto-fill, minmax(...))` 대체 시 가상 행 계산에 사용 */
const GRID_MIN_CELL = 148;
const GRID_GAP = 4;
const GRID_PAD = 16;
const GRID_FILENAME_H = 0; // filename is overlayed on image

/**
 * 모바일 그리드 첫 셀 — 사진 추가 CTA.
 * 기존 prj-data-cell과 동일한 정사각 1px 보더 + paddingBottom 100% 형태를 유지하되,
 * border-style만 dashed로 두어 그리드와 톤을 통일.
 */
function UploadTile({
  isUploading,
  uploadProgress,
  overallProgress,
  showServerWorking,
  hasPhotos,
  isPreparing,
  onClick,
}: {
  isUploading: boolean;
  uploadProgress: number;
  overallProgress: number;
  showServerWorking: boolean;
  hasPhotos: boolean;
  isPreparing: boolean;
  onClick: () => void;
}) {
  const label = isPreparing
    ? "사진 가져오는 중..."
    : isUploading
      ? showServerWorking
        ? "처리 중..."
        : `${overallProgress}%`
      : hasPhotos
        ? "+ 사진 추가"
        : "사진 선택";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!isUploading) onClick(); }}
      onKeyDown={(e) => {
        if (isUploading) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="prj-upload-tile"
      style={{
        background: "var(--background)",
        border: `1px dashed ${(isUploading || isPreparing) ? ACCENT : "var(--border)"}`,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        cursor: (isUploading || isPreparing) ? "wait" : "pointer",
        transition: "border-color 0.2s, background 0.2s",
      }}
      aria-label={isUploading ? `업로드 중 ${uploadProgress}%` : "사진 추가하기"}
    >
      <div style={{ position: "relative", width: "100%", paddingBottom: "100%", background: (isUploading || isPreparing) ? ACCENT_DIM : "rgba(var(--accent-rgb), 0.04)" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 8,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: `1px solid ${(isUploading || isPreparing) ? ACCENT : "var(--border)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: (isUploading || isPreparing) ? "rgba(var(--accent-rgb), 0.08)" : "transparent",
            }}
          >
            {(isUploading || isPreparing)
              ? <Loader2 size={14} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
              : <ImagePlus size={14} color={ACCENT} />}
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.04em",
              color: (isUploading || isPreparing) ? ACCENT : "var(--subtle-foreground)",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function VirtualizedPhotoGrid({
  scrollRef,
  photos,
  onDelete,
  deletingId,
  isEditMode,
  minCols = 1,
  thumbQueue,
  onPhotoClick,
  leadingUploadCell,
  groupsById,
  similarityToggleOn,
  expandedGroups,
  onGroupBadgeClick,
  compressingTempId,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  minCols?: number;
  thumbQueue: ThumbLoadQueue;
  onPhotoClick?: (index: number) => void;
  /** 모바일 전용: 그리드 첫 셀(인덱스 0) 자리에 노출되는 업로드 CTA */
  leadingUploadCell?: React.ReactNode;
  /** AI 유사컷 그룹 정보 — 대표컷 배지 표시용 */
  groupsById?: Map<string, PhotoGroupInfo>;
  similarityToggleOn?: boolean;
  expandedGroups?: Set<string>;
  onGroupBadgeClick?: (e: React.MouseEvent, groupId: string) => void;
  /** 현재 압축 중인 사진 tempId — 해당 셀에 하이라이트 오버레이 표시 */
  compressingTempId?: string | null;
}) {
  const [layout, setLayout] = useState(() => {
    const cw = GRID_MIN_CELL;
    return { cols: 4, cellWidth: cw, rowHeight: Math.ceil(cw + GRID_FILENAME_H) + GRID_GAP };
  });

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const update = () => {
      const w = root.clientWidth - GRID_PAD * 2;
      if (w <= 0) return;
      const cols = Math.max(minCols, Math.floor((w + GRID_GAP) / (GRID_MIN_CELL + GRID_GAP)));
      const cellWidth = (w - GRID_GAP * (cols - 1)) / cols;
      const rowHeight = Math.ceil(cellWidth + GRID_FILENAME_H) + GRID_GAP;
      setLayout((prev) =>
        prev.cols !== cols || prev.rowHeight !== rowHeight ? { cols, cellWidth, rowHeight } : prev,
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, [scrollRef, minCols]);

  // 업로드 셀이 있으면 셀 인덱스 0에 끼워넣고, 사진은 1번 셀부터 표시
  const hasUploadCell = !!leadingUploadCell;
  const totalCells = photos.length + (hasUploadCell ? 1 : 0);
  const rowCount = Math.ceil(totalCells / layout.cols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: 2,
  });

  // 사이드바 축소/확장 등으로 컨테이너 너비가 바뀌면 rowHeight도 바뀜.
  // virtualizer는 함수 참조가 바뀌지 않으면 자동 remeasure를 하지 않으므로 명시 호출.
  useEffect(() => {
    rowVirtualizer.measure();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.rowHeight]);

  return (
    <div style={{ padding: GRID_PAD }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: rowVirtualizer.getTotalSize(),
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const start = vRow.index * layout.cols;
          const cells: React.ReactNode[] = [];
          for (let j = 0; j < layout.cols; j++) {
            const cellIndex = start + j;
            if (cellIndex >= totalCells) break;
            if (hasUploadCell && cellIndex === 0) {
              cells.push(cloneElement(leadingUploadCell as React.ReactElement, { key: "upload-cell" }));
              continue;
            }
            const photoIndex = hasUploadCell ? cellIndex - 1 : cellIndex;
            const photo = photos[photoIndex];
            if (!photo) continue;
            const group = photo.similarityGroupId ? groupsById?.get(photo.similarityGroupId) : undefined;
            const isRepresentative = !!group && group.representativePhotoId === photo.id;
            const restCount = group ? group.photoCount - 1 : 0;
            const isExpanded = !!similarityToggleOn && !!group && !!expandedGroups?.has(group.id);
            const groupBadge =
              similarityToggleOn && isRepresentative && restCount > 0
                ? { groupId: group!.id, restCount, isExpanded }
                : undefined;
            cells.push(
              <PhotoThumb
                key={photo.id}
                photo={photo}
                index={photoIndex}
                onDelete={onDelete}
                deletingId={deletingId}
                isEditMode={isEditMode}
                scrollRootRef={scrollRef}
                thumbQueue={thumbQueue}
                onPhotoClick={onPhotoClick}
                groupBadge={groupBadge}
                onGroupBadgeClick={onGroupBadgeClick}
                inExpandedGroup={!!group && isExpanded}
                isCompressing={compressingTempId === photo.id}
              />,
            );
          }
          return (
            <div
              key={vRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                gap: GRID_GAP,
                boxSizing: "border-box",
                alignItems: "start",
                overflow: "hidden",
              }}
            >
              {cells}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LIST_ROW_H = 64;
const LIST_THUMB_W = 72;
const LIST_THUMB_H = 48;

function ListRowThumb({
  url,
  scrollRootRef,
  thumbQueue,
}: {
  url: string;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  thumbQueue: ThumbLoadQueue;
}) {
  const { cellRef, imgRef, shouldLoad, handleLoad, handleError } = useQueuedThumbSrc(url, {
    queue: thumbQueue,
    rootRef: scrollRootRef,
  });
  return (
    <div ref={cellRef} style={{ width: "100%", height: "100%", background: "var(--background)" }}>
      {shouldLoad && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img ref={imgRef} src={url} alt="" loading="lazy" decoding="async" onLoad={handleLoad} onError={handleError} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
    </div>
  );
}

function VirtualizedPhotoList({
  scrollRef,
  photos,
  onDelete,
  deletingId,
  isEditMode,
  thumbQueue,
  onPhotoClick,
  groupsById,
  similarityToggleOn,
  expandedGroups,
  onGroupBadgeClick,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  thumbQueue: ThumbLoadQueue;
  onPhotoClick?: (index: number) => void;
  groupsById?: Map<string, PhotoGroupInfo>;
  similarityToggleOn?: boolean;
  expandedGroups?: Set<string>;
  onGroupBadgeClick?: (e: React.MouseEvent, groupId: string) => void;
}) {
  const listVirtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ROW_H,
    overscan: 6,
  });

  return (
    <div style={{ padding: 16 }}>
      <div style={{ position: "relative", width: "100%", height: listVirtualizer.getTotalSize() }}>
        {listVirtualizer.getVirtualItems().map((v) => {
          const photo = photos[v.index];
          const i = v.index;
          const deleting = deletingId === photo.id;
          const group = photo.similarityGroupId ? groupsById?.get(photo.similarityGroupId) : undefined;
          const isRepresentative = !!group && group.representativePhotoId === photo.id;
          const restCount = group ? group.photoCount - 1 : 0;
          const showGroupBadge = similarityToggleOn && isRepresentative && restCount > 0;
          const isExpanded = !!similarityToggleOn && !!group && !!expandedGroups?.has(group.id);
          const inExpandedGroup = !!group && isExpanded;
          return (
            <div
              key={photo.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: v.size,
                transform: `translateY(${v.start}px)`,
                boxSizing: "border-box",
                paddingBottom: 2,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  height: LIST_ROW_H - 2,
                  border: inExpandedGroup ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                  background: SURFACE_2,
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
                onClick={() => onPhotoClick?.(i)}
                onMouseEnter={(e) => { if (!inExpandedGroup) (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(var(--accent-rgb), 0.3)"; }}
                onMouseLeave={(e) => { if (!inExpandedGroup) (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, width: 36, flexShrink: 0, textAlign: "right" }}>
                  {String(photo.orderIndex ?? i + 1).padStart(3, "0")}
                </span>
                <div
                  style={{
                    width: LIST_THUMB_W,
                    height: LIST_THUMB_H,
                    flexShrink: 0,
                    overflow: "hidden",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <ListRowThumb url={photo.url} scrollRootRef={scrollRef} thumbQueue={thumbQueue} />
                </div>
                <span style={{ fontSize: 13, color: TEXT_BRIGHT, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Pretendard Variable', sans-serif" }}>
                  {photo.originalFilename ?? `FRAME_${String(i + 1).padStart(4, "0")}`}
                </span>
                {showGroupBadge && group && (
                  <button
                    type="button"
                    className="prj-group-badge-inline"
                    onClick={(e) => onGroupBadgeClick?.(e, group.id)}
                    aria-label={`유사컷 ${restCount}장 ${isExpanded ? "접기" : "펼치기"}`}
                  >
                    {isExpanded ? `${restCount + 1}장 −` : `+${restCount}`}
                  </button>
                )}
                {photo.fileSize && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, flexShrink: 0 }}>
                    {(photo.fileSize / 1024).toFixed(0)}KB
                  </span>
                )}
                {photo.createdAt && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {(() => {
                      const d = new Date(photo.createdAt!);
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      const hh = String(d.getHours()).padStart(2, "0");
                      const min = String(d.getMinutes()).padStart(2, "0");
                      return `${mm}/${dd} ${hh}:${min}`;
                    })()}
                  </span>
                )}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
                    disabled={deleting}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: TEXT_MUTED,
                      cursor: "pointer",
                      padding: "3px 6px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      opacity: deleting ? 0.5 : 1,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#FF4757"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
                  >
                    {deleting ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <X size={13} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- main ----------
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditGuideModal, setShowEditGuideModal] = useState(false);
  const [copied, setCopied] = useState(false);
  // 그리드/리스트 뷰는 동시에 하나만 마운트되므로 큐 하나를 공유해도 무방하다.
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [betaMaxPhotosPerProject, setBetaMaxPhotosPerProject] = useState(DEFAULT_BETA_MAX_PHOTOS_PER_PROJECT);

  useEffect(() => {
    fetch("/api/limits")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.betaMaxPhotosPerProject) setBetaMaxPhotosPerProject(data.betaMaxPhotosPerProject);
      })
      .catch(() => {});
  }, []);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [inviteActivating, setInviteActivating] = useState(false);
  const [inviteOriginalsProcessing, setInviteOriginalsProcessing] = useState(false);
  const [inviteShareModalOpen, setInviteShareModalOpen] = useState(false);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroupInfo[]>([]);
  const [similarityToggleOn, setSimilarityToggleOn] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isMobile, setIsMobile] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 배치 업로드 완료 직후 blob URL로 즉시 표시되는 낙관적 사진 */
  const [pendingPhotos, setPendingPhotos] = useState<UploadPreview[]>([]);
  const pendingBlobsRef = useRef<string[]>([]);
  /** XHR 전송 중인 사진 (스피너 표시) */
  const [uploadingPhotos, setUploadingPhotos] = useState<UploadPreview[]>([]);
  const uploadingBlobsRef = useRef<string[]>([]);
  /** 업로드 시작 즉시 표시할 전체 미리보기 (압축·전송 전 큐 상태) */
  const [queuedPreviews, setQueuedPreviews] = useState<UploadPreview[]>([]);
  const queuedBlobsRef = useRef<string[]>([]);
  /** 압축 완료 후 XHR 전송 단계가 같은 카드로 인계받을 수 있도록, 원본 파일 순서별 미리보기 보관 */
  const queuedPreviewBySourceIndexRef = useRef<Map<number, UploadPreview>>(new Map());
  /** 현재 압축 중인 파일의 queuedPreviews 인덱스 (-1이면 압축 중 아님) */
  const [compressingIndex, setCompressingIndex] = useState(-1);
  /** 현재 업로드 배치의 전체 파일 수 */
  const [totalUploadCount, setTotalUploadCount] = useState(0);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStopRequested, setUploadStopRequested] = useState(false);
  /** 네트워크 전송은 끝났고 서버(썸네일·저장) 응답 대기 중 — 99% 정지로 오해하지 않도록 별도 표시 */
  const [awaitingServerFinalize, setAwaitingServerFinalize] = useState(false);
  /** 원본 파일을 R2로 직접 PUT 중인 배치가 있는지 (동시 배치 카운터 기반) */
  const sendingSourceRef = useRef(0);          // 현재 진행 중인 R2 PUT 수 (카운터)
  const sendingSourceDoneRef = useRef(0);       // 완료된 R2 PUT 수
  const sendingSourceTotalRef = useRef(0);      // presigned URL 발급 수 (= 실제 시도 예정)
  const sendingSourceFailedRef = useRef(0);     // PUT/confirm까지 끝내지 못한 원본 수
  const [sendingSourcePhase, setSendingSourcePhase] = useState(false);
  const [sendingSourceSnap, setSendingSourceSnap] = useState({ done: 0, total: 0, failed: 0 });
  /** 업로드 미완료(awaiting_upload) 원본 job — 복구 배너 표시용 */
  const [pendingRecovery, setPendingRecovery] = useState<PendingOriginalItem[]>([]);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const recoveryFileInputRef = useRef<HTMLInputElement>(null);
  const retryRecoveryFileInputRef = useRef<HTMLInputElement>(null);
  const recoveryFileInputRefDesktop = useRef<HTMLInputElement>(null);
  const retryRecoveryFileInputRefDesktop = useRef<HTMLInputElement>(null);
  /** filename+size+lastModified 매칭 실패한 job 목록 */
  const [unmatchedJobs, setUnmatchedJobs] = useState<PendingOriginalItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** selecting 상태에서 추가 업로드 시도 시 1회 안내 모달 */
  const [showSelectingWarn, setShowSelectingWarn] = useState(false);
  const [showFlushAllConfirm, setShowFlushAllConfirm] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);

  /** AI 유사도 분석 — 업로드와 별개의 명시적 트리거 (초대 링크 활성화와 무관).
   * 변수/함수 이름은 과거 OpenCLIP 시절 그대로 유지하지만(레거시 네이밍), 실제로는
   * Gemini Embedding 기반 유사컷 그룹핑(`/api/photographer/projects/[id]/gemini-analysis`)을
   * 호출한다 — 베타 전환(2026-07-28) 이후 OpenCLIP/OpenCV/MediaPipe는 이 흐름에서 호출되지 않는다. */
  const [clipAnalysisStatus, setClipAnalysisStatus] = useState<
    "processing" | "completed" | "failed" | null
  >(null);
  const [clipAnalysisTriggering, setClipAnalysisTriggering] = useState(false);
  /** 마지막 분석 run의 실패 건수(있으면) — "분석 재개" 문구 판단용 */
  const [clipLastRunFailedCount, setClipLastRunFailedCount] = useState(0);
  /** 현재 활성 사진 수/이미 분석된 수/대기 중인 수 — 버튼 문구(최초/신규/완료)를 결정 */
  const [clipPending, setClipPending] = useState<{
    active: number; alreadyAnalyzed: number; pending: number;
  } | null>(null);

  /** Gemini 분석 POC — 관리자 전용 노출 여부 판단용 (실제 접근 제어는 API route에서도 재검증됨) */
  const [isAdminTier, setIsAdminTier] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoScrollRef = useRef<HTMLDivElement>(null);
  const stopRequestedRef = useRef(false);
  // React state updates are not synchronous, so a ref is required to block two
  // clicks that land before the upload phase re-renders.
  const uploadInProgressRef = useRef(false);
  // 압축 워커 풀 취소용 — 업로드 세션마다 새로 만들고, 중단 시 abort()해서 그 세션이
  // 점유 중이던 워커를 즉시 교체시킨다(다음 세션이 기다리지 않도록, upload-client-compress.ts 참고).
  const compressAbortControllerRef = useRef<AbortController | null>(null);
  const useProxyRef = useRef(false);
  /** selecting 안내 모달 확인 시 pending으로 넘길 드래그 파일 임시 보관 */
  const pendingDropFilesRef = useRef<File[] | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const p = await getProjectById(id);
      setProject(p);
      return p;
    } catch (e) { console.error(e); return null; }
    finally { setLoading(false); }
  }, [id]);

  const loadPhotos = useCallback(async () => {
    try { setPhotos(await getPhotosByProjectId(id)); }
    catch {}
    finally { setPhotosLoading(false); }
  }, [id]);

  const loadPhotoGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photo-groups`);
      if (res.ok) setPhotoGroups((await res.json()).photoGroups ?? []);
    } catch {}
  }, [id]);

  /** Gemini 기반 분석 상태 + pending count 조회 — 마운트 시 시드, processing 중 폴링에 재사용 */
  const loadClipAnalysisStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/photographer/projects/${id}/gemini-analysis`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.gemini_analysis_status !== undefined) setClipAnalysisStatus(data.gemini_analysis_status);
      if (data.run) setClipLastRunFailedCount(data.run.failed_count ?? 0);
      if (data.active_photo_count !== undefined) {
        setClipPending({
          active: data.active_photo_count,
          alreadyAnalyzed: data.already_analyzed_count,
          pending: data.pending_count,
        });
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    loadProject().then((p) => { if (p) { loadPhotos(); loadPhotoGroups(); } });
  }, [id, loadProject, loadPhotos, loadPhotoGroups]);

  /** 마운트/재진입 시 로컬 분석 상태를 서버 상태로 시드 — processing이면 아래 폴링 이펙트가 자동 재개된다 */
  useEffect(() => {
    loadClipAnalysisStatus();
  }, [loadClipAnalysisStatus]);

  /** Gemini 분석 POC 노출 여부 — 관리자 등급만 (실 요금이 발생하는 실험 기능이라 접근 범위를 제한) */
  useEffect(() => {
    fetch("/api/photographer/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.tier === "admin") setIsAdminTier(true); })
      .catch(() => {});
  }, []);

  const overallProgress = useMemo(() => {
    if (uploadPhase === "idle" || uploadPhase === "done") return 0;
    return uploadProgress; // 분할처리 파이프라인: 단일 processing 페이즈에서 0→90 단조 증가
  }, [uploadPhase, uploadProgress]);

  /** 기존 photos + 배치 완료(pending) + 전송 중(uploading) + 큐(queued) 합산 — early return 이전에 선언해야 Rules of Hooks 준수 */
  const displayPhotos = useMemo(() => {
    const confirmedNames = new Set(photos.map((p) => p.originalFilename));
    const uploadingIds = new Set(uploadingPhotos.map((p) => p.tempId));
    // 카드가 완료 순서에 따라 pending/uploading/queued 묶음 사이를 오가면 위치가 바뀐다.
    // tempId별로 하나만 남기고 원래 파일 순서(sourceIndex)로 정렬해, 상태만 바뀌게 한다.
    const previewsById = new Map<string, UploadPreview>();
    for (const preview of [...queuedPreviews, ...uploadingPhotos, ...pendingPhotos]) {
      previewsById.set(preview.tempId, preview);
    }
    const optimisticPhotos: Photo[] = [...previewsById.values()]
      .filter((p) => !confirmedNames.has(p.filename))
      .sort((a, b) => a.sourceIndex - b.sourceIndex)
      .map((p) => ({
        id: p.tempId,
        projectId: id,
        orderIndex: 99999,
        url: p.blobUrl,
        originalFilename: p.filename,
        isPending: true,
        isUploading: uploadingIds.has(p.tempId),
      }));
    if (optimisticPhotos.length === 0) return photos;
    return [...photos, ...optimisticPhotos];
  }, [photos, pendingPhotos, uploadingPhotos, queuedPreviews, id]);

  /** ── AI 유사컷 그룹 — 대표이미지 토글. 키보드 네비/라이트박스보다 먼저 선언해야
   *  groupedDisplayPhotos를 그 효과들에서 참조할 수 있다 (선언 순서 = 평가 순서). ── */
  const groupsById = useMemo(() => {
    const map = new Map<string, PhotoGroupInfo>();
    for (const g of photoGroups) map.set(g.id, g);
    return map;
  }, [photoGroups]);

  const membersByGroup = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of photos) {
      if (!p.similarityGroupId) continue;
      const arr = map.get(p.similarityGroupId) ?? [];
      arr.push(p);
      map.set(p.similarityGroupId, arr);
    }
    return map;
  }, [photos]);

  /** 대표컷 삭제 직후 photoGroups가 아직 갱신되지 않은 경우(E2 방어 폴백) 대비 —
   *  대표컷이 현재 photos 목록에 없는 그룹은 없는 것처럼 취급해 멤버가 전부 누락되는 걸 막는다. */
  const photoIdSet = useMemo(() => new Set(photos.map((p) => p.id)), [photos]);

  const showSimilarityToggle = clipAnalysisStatus === "completed" && photoGroups.length > 0;

  /** 버튼 문구/동작을 pending count + 마지막 run 상태로 결정 — 사용자에게는 "Gemini" 같은
   *  구현 기술을 노출하지 않고 기존 OpenCLIP 시절과 동일한 어휘("유사컷 분석")를 그대로 쓴다. */
  const analysisButtonState = useMemo(() => {
    if (clipAnalysisStatus === "processing") {
      return { subtitle: "분석 중… 잠시 후 완료됩니다", buttonLabel: "" };
    }
    const pending = clipPending?.pending ?? null;
    const alreadyAnalyzed = clipPending?.alreadyAnalyzed ?? 0;
    if (pending === 0 && alreadyAnalyzed > 0) {
      return { subtitle: "모든 사진 분석이 완료됐습니다", buttonLabel: "분석 결과 보기" };
    }
    if (pending !== null && pending > 0 && clipLastRunFailedCount > 0) {
      return { subtitle: "일부 사진 분석에 실패했습니다. 다시 시도해주세요", buttonLabel: "분석 재개" };
    }
    if (pending !== null && pending > 0 && alreadyAnalyzed > 0) {
      return {
        subtitle: "기존 분석 결과는 유지하고 새로 추가된 사진만 분석합니다",
        buttonLabel: "새 사진 분석",
      };
    }
    return {
      subtitle: "연속 촬영된 유사컷을 자동으로 찾아 묶어드립니다",
      buttonLabel: "AI 유사컷 분석 시작",
    };
  }, [clipAnalysisStatus, clipPending, clipLastRunFailedCount]);

  const handleGroupBadgeClick = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  /** 토글 OFF면 displayPhotos 그대로, ON이면 대표컷+미분류만 (펼친 그룹은 대표컷 뒤에 나머지 인라인). */
  const groupedDisplayPhotos = useMemo(() => {
    if (!similarityToggleOn) return displayPhotos;
    const result: Photo[] = [];
    for (const photo of displayPhotos) {
      const groupId = photo.similarityGroupId;
      if (!groupId) { result.push(photo); continue; }
      const group = groupsById.get(groupId);
      if (!group || !photoIdSet.has(group.representativePhotoId)) { result.push(photo); continue; }
      if (photo.id !== group.representativePhotoId) continue;
      result.push(photo);
      if (expandedGroups.has(groupId)) {
        const members = membersByGroup.get(groupId) ?? [];
        result.push(...members.filter((p) => p.id !== group.representativePhotoId));
      }
    }
    return result;
  }, [displayPhotos, similarityToggleOn, expandedGroups, groupsById, membersByGroup, photoIdSet]);
  const lightboxPreloadUrlGroups = useMemo(
    () => groupedDisplayPhotos.map((photo) => [photo.previewUrl ?? photo.url]),
    [groupedDisplayPhotos],
  );
  useAdjacentImagePreload(lightboxPreloadUrlGroups, lightboxIndex, {
    wrap: true,
    desktopBefore: 1,
    desktopAfter: 2,
    desktopMaxDecoded: 6,
    mobileMaxDecoded: 3,
  });

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /** AI 유사도 분석 상태 polling — 처리 중일 때만 짧은 간격으로 조회 */
  useEffect(() => {
    if (clipAnalysisStatus !== "processing") return;
    const t = setInterval(async () => {
      await loadClipAnalysisStatus();
    }, 4000);
    return () => clearInterval(t);
  }, [clipAnalysisStatus, loadClipAnalysisStatus]);

  /** 분석이 방금 완료로 바뀌면 그룹/사진(=새 similarityGroupId 반영)을 다시 불러오고
   *  토글을 자동으로 켜서 대표컷 묶음 표시가 즉시 보이도록 한다(수동 클릭 불필요). */
  const prevClipAnalysisStatusRef = useRef(clipAnalysisStatus);
  useEffect(() => {
    const prev = prevClipAnalysisStatusRef.current;
    prevClipAnalysisStatusRef.current = clipAnalysisStatus;
    if (prev === "processing" && clipAnalysisStatus === "completed") {
      loadPhotoGroups();
      loadPhotos();
      setSimilarityToggleOn(true);
    }
  }, [clipAnalysisStatus, loadPhotoGroups, loadPhotos]);


  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /** 모바일 헤더 아래 진행 라인: 업로드 종료 후 200ms 페이드아웃 */
  const [mobileProgressBarMounted, setMobileProgressBarMounted] = useState(false);
  useEffect(() => {
    const uploading = uploadPhase === "sending" || uploadPhase === "processing";
    const active = isMobile && (uploading || !!uploadError);
    if (active) {
      setMobileProgressBarMounted(true);
      return;
    }
    if (!isMobile) {
      setMobileProgressBarMounted(false);
      return;
    }
    const id = window.setTimeout(() => setMobileProgressBarMounted(false), 200);
    return () => window.clearTimeout(id);
  }, [isMobile, uploadPhase, uploadError]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i! > 0 ? i! - 1 : groupedDisplayPhotos.length - 1));
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i! < groupedDisplayPhotos.length - 1 ? i! + 1 : 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, groupedDisplayPhotos.length]);

  useEffect(() => {
    const uploading = uploadPhase === "sending" || uploadPhase === "processing";
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadPhase]);

  // iOS에서 업로드 중 앱 전환/화면 잠금 감지 → 복귀 시 경고
  useEffect(() => {
    if (uploadPhase !== "processing" || !isMobileUploadClient()) return;
    let hiddenAt: number | null = null;
    const handler = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible" && hiddenAt !== null) {
        if (Date.now() - hiddenAt > 3000) {
          setUploadError("업로드 중 화면이 전환되어 일부 사진이 누락됐을 수 있습니다. 업로드 현황을 확인 후 필요 시 재업로드해 주세요.");
        }
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [uploadPhase]);

  // 원본 R2 PUT 중 페이지 이탈 시 beforeunload 경고 (PUT 완료 전에 닫으면 job이 awaiting_upload에 멈춤)
  useEffect(() => {
    if (!sendingSourcePhase) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sendingSourcePhase]);

  // awaiting_upload 상태 job 확인 → 복구 배너. 페이지 최초 로드 시 1회 + 업로드 배치 종료 직후
  // 재확인(원본 presigned PUT이 조용히 실패해도 non-fatal로 삼켜지므로, 업로드 "완료" 시점에
  // 다시 확인하지 않으면 방금 실패한 job이 24h sweep 전까지 UI 어디에도 드러나지 않는다).
  const checkPendingOriginals = useCallback(async () => {
    if (!id) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    let jobs = await fetchPendingOriginals(id, token);
    if (jobs.length > 0 && await autoConfirmUploadedOriginals(jobs, token)) {
      jobs = await fetchPendingOriginals(id, token);
    }
    if (jobs.length > 0) {
      setPendingRecovery(jobs);
      setShowRecoveryBanner(true);
    }
  }, [id]);

  // ── upload ──
  const startUpload = useCallback(async (uploadFiles: File[]) => {
    if (!uploadFiles.length || uploadInProgressRef.current) return;
    uploadInProgressRef.current = true;
    const inclOrig = project?.includeOriginal ?? false;
    setUploadError(null);
    setAwaitingServerFinalize(false);
    sendingSourceDoneRef.current = 0;
    sendingSourceTotalRef.current = 0;
    sendingSourceFailedRef.current = 0;
    setSendingSourceSnap({ done: 0, total: 0, failed: 0 });
    setUploadPhase("processing");
    setUploadProgress(0);
    setCompressingIndex(-1);
    setQueuedPreviews([]);
    queuedBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
    queuedBlobsRef.current = [];
    queuedPreviewBySourceIndexRef.current.clear();
    stopRequestedRef.current = false;
    setUploadStopRequested(false);
    useProxyRef.current = false;
    compressAbortControllerRef.current = new AbortController();

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const token = session?.access_token;
    if (userError || !user) { setUploadError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); uploadInProgressRef.current = false; return; }
    if (!token) { setUploadError("로그인이 필요합니다."); setUploadPhase("idle"); uploadInProgressRef.current = false; return; }

    setTotalUploadCount(uploadFiles.length);
    let currentToken = token;
    const totalFiles = uploadFiles.length;
    // 같은 파일 전송의 XHR 재시도와 direct API -> Next proxy fallback 전체에서 재사용한다.
    // 서버 UNIQUE(project_id, client_upload_id)가 응답 유실 후 중복 photo/job 생성을 막는다.
    const clientUploadIds = uploadFiles.map(() => createClientUploadId());

    // 압축→전송 처리. 현재 활성 경로는 모든 기기에서 같은 pipelineMode다:
    // - pipelineMode(PC + 모바일, include_original 여부 무관): 압축(producer)과 XHR 전송
    //   (consumer lane)을 bounded async channel로 연결한 producer-consumer 파이프라인.
    //   round barrier(=concurrency×effectiveBatch장 전체 완료 후에만 다음 압축 시작) 제거.
    //   desktop+include_original=false는 OPT-ROUND-01(2026-08-06), desktop+include_original=true는
    //   OPT-ROUND-02(2026-08-06) — 코드는 완전히 동일한 채널/lane 구조를 공유하며, inclOrig=true는
    //   effectiveBatch=1이므로 channel item(batch)이 자연히 파일 1장 단위가 된다. batch(=effectiveBatch장,
    //   압축/XHR 단위) 자체는 그대로, "여러 batch를 하나의 round로 묶어 전량 완료 후 한꺼번에 다음
    //   압축 시작"하던 상위 묶음(barrier)만 제거한다. 압축 worker 수(PC 2 / 모바일 1), upload concurrency,
    //   batch size(effectiveBatch=1 포함)/리사이즈 파라미터/presigned PUT/confirm 방식은 전부 기존
    //   값 그대로 — barrier만 없앤다. photo_number 순서 안전성: RPC(insert_photos_with_numbers)는
    //   /photos 요청이 서버에 도달한 순서로 번호를 매기며(배치 시작 순서가 아님), 이는 round
    //   구조에서도 이미 존재하던 특성이다 — 파이프라인은 in-flight 배치 수 상한(=concurrency)을
    //   그대로 유지하므로 이 순서 특성 자체를 악화시키지 않는다(조사 근거는 upload-flow.md 참고).
    //   모바일도 같은 구조를 쓰되 MOBILE_CONCURRENCY=1, 압축 워커=1을 유지한다. 따라서
    //   동시 네트워크/R2 PUT 수나 메모리 상한은 올리지 않고, 현재 전송 중일 때 다음 batch
    //   압축만 겹친다. uploadOneBatch() 내부의 setTimeout(0)은 iOS의 batch 간 paint 양보를
    //   계속 보장한다(§upload-flow.md 참고).
    // HEIC: include_original=true여도 HEIC는 원본 PUT 없이 썸네일만 업로드 (rawFile=undefined 분기)
    // B Plan: 압축본을 서버로 전송 + 원본은 presigned PUT으로 R2에 직접 전송
    const effectiveBatch = inclOrig ? 1 : (isMobileUploadClient() ? MOBILE_BATCH_SIZE : BATCH_SIZE);
    const concurrency = inclOrig
      ? (isMobileUploadClient() ? 1 : getDesktopUploadConcurrency(true))
      : (isMobileUploadClient() ? MOBILE_CONCURRENCY : getDesktopUploadConcurrency(false));
    const totalBatches = Math.ceil(totalFiles / effectiveBatch);
    const rawBatches: File[][] = Array.from({ length: totalBatches }, (_, i) =>
      uploadFiles.slice(i * effectiveBatch, Math.min((i + 1) * effectiveBatch, totalFiles))
    );

    // XHR 진행률 추적용 근사 배치 사이즈 (원본 파일 기준 — 압축본은 더 작지만 비율 유지됨)
    const approxBatchSizes = rawBatches.map((b) => b.reduce((s, f) => s + f.size, 0));
    const totalBytes = Math.max(1, approxBatchSizes.reduce((a, b) => a + b, 0));
    const loadedPerBatch = new Array<number>(totalBatches).fill(0);
    const applyProgress = (idx: number, loaded: number) => {
      const cap = approxBatchSizes[idx] ?? 0;
      loadedPerBatch[idx] = cap > 0 ? Math.min(cap, loaded) : loaded;
      let sum = 0; for (let i = 0; i < totalBatches; i++) sum += loadedPerBatch[i];
      // 상한 90%: 전송 완료 후 서버 처리 구간은 awaitingServerFinalize UI로 표시 (99% 장시간 정지 방지)
      setUploadProgress(Math.min(90, Math.round((sum / totalBytes) * 100)));
    };

    const allFailed: File[] = [];
    const backendRejected: string[] = []; // BUG-01: 서버에서 거부된 파일명 (CR3 등 미지원 형식)
    const failedOriginalTransfers = new Map<string, FailedOriginalTransfer>();
    let completedBatches = 0;
    // "compressSetup": pipelineMode 전용 — 압축 자체가 시작 불가한 예외(워커/canvas 폴백 모두 실패).
    // legacy 경로는 이 값을 쓰지 않고 기존과 동일하게 즉시 return한다(§아래 legacy 분기).
    let abortReason: "betaLimit" | "network" | "auth" | "compressSetup" | null = null;
    let abortMessage = "";
    let firstFailDetail: string | null = null;
    // BUG-04: PC도 30배치(약 240장)마다 토큰 갱신 (대용량 업로드 중 만료 방지)
    const refreshInterval = isMobileUploadClient() ? 20 : 30;

    // batchIndex 단위로 공유하는 "서버 처리 중" 배너 상태 — round/파이프라인 어느 쪽이든 동일하게 쓴다.
    const bodySentMap = new Map<number, boolean>();
    const reqDoneMap = new Map<number, boolean>();
    const syncAwaitingServer = () => {
      let anyPending = false;
      bodySentMap.forEach((sent, idx) => { if (sent && !reqDoneMap.get(idx)) anyPending = true; });
      setAwaitingServerFinalize(anyPending);
    };

    // 압축된 배치 1개를 업로드(XHR)한다 — round 루프와 파이프라인 루프가 공유하는 로직(순수 추출,
    // 동작 변경 없음). batchIndex는 전역 배치 인덱스(0..totalBatches-1) — effectiveBatch=1인
    // include_original=true에서는 uploadFiles와 1:1 대응.
    const uploadOneBatch = async (batch: File[], batchIndex: number) => {
      // 카드 식별자·위치는 queued 단계에서 만든 값을 인계하되, 표시 이미지는 압축본으로 바꾼다.
      // 원본 blob은 고해상도/HEIC일 수 있어 브라우저가 해독하는 동안 카드가 검게 보일 수 있다.
      const inFlightNow = Date.now();
      const queuedUrlsToRevoke: string[] = [];
      const inFlight = batch.map((file, fi) => {
        const sourceIndex = batchIndex * effectiveBatch + fi;
        const queuedPreview = queuedPreviewBySourceIndexRef.current.get(sourceIndex);
        if (queuedPreview) {
          queuedPreviewBySourceIndexRef.current.delete(sourceIndex);
          queuedUrlsToRevoke.push(queuedPreview.blobUrl);
          return {
            ...queuedPreview,
            // 압축 함수가 JPEG를 돌려준 경우에만 이 URL은 작고 즉시 표시 가능한 JPEG다.
            blobUrl: URL.createObjectURL(file),
          };
        }
        // 중단/복구 등으로 큐 미리보기가 없을 때도 압축본 미리보기를 만든다.
        const blobUrl = URL.createObjectURL(file);
        return { tempId: `uploading-${inFlightNow}-${batchIndex}-${fi}`, blobUrl, filename: file.name, sourceIndex };
      });
      const inFlightIds = new Set(inFlight.map((p) => p.tempId));
      let previewRetained = false;
      // 같은 React key를 유지한 채 queued → uploading으로 한 번에 인계한다.
      // XHR 시작 전 스피너 렌더는 보장하되 카드가 사라지거나 순서가 바뀌지 않는다.
      flushSync(() => {
        setQueuedPreviews((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
        setUploadingPhotos((prev) => [...prev, ...inFlight]);
      });
      queuedBlobsRef.current = queuedBlobsRef.current.filter((url) => !queuedUrlsToRevoke.includes(url));
      queuedUrlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
      for (const preview of inFlight) {
        if (!uploadingBlobsRef.current.includes(preview.blobUrl)) uploadingBlobsRef.current.push(preview.blobUrl);
      }
      // macrotask 경계 생성 — rAF는 백그라운드 탭에서 멈추므로 setTimeout 사용
      await new Promise<void>((r) => setTimeout(r, 0));
      try {
        if (abortReason) {
          allFailed.push(...batch);
          setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
          uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
          return;
        }
        const globalIdx = batchIndex;
        // B Plan: rawFile은 브라우저 원본 파일 (effectiveBatch=1이므로 globalIdx가 uploadFiles와 1:1 대응). HEIC는 원본 PUT 불가 → undefined.
        const rawFile = (inclOrig && !isHeicFile(uploadFiles[globalIdx])) ? uploadFiles[globalIdx] : undefined;
        const buildForm = () => {
          const f = new FormData();
          f.append("project_id", id);
          f.append("include_original", (inclOrig && !!rawFile) ? "true" : "false");
          batch.forEach((file, fileIndex) => {
            f.append("files", file);
            f.append("client_upload_ids", clientUploadIds[batchIndex * effectiveBatch + fileIndex]);
          });
          if (inclOrig && rawFile) {
            f.append("original_filenames", rawFile.name);
            f.append("original_file_sizes", String(rawFile.size));
            f.append("original_last_modifieds", String(rawFile.lastModified));
            f.append("original_content_types", rawFile.type || "image/jpeg");
          }
          return f;
        };
        try {
          let res = await postPhotosUpload(
            buildForm,
            currentToken,
            useProxyRef,
            (loaded) => applyProgress(globalIdx, loaded),
            { onRequestBodySent: () => { bodySentMap.set(batchIndex, true); syncAwaitingServer(); } },
          );
          if (res.status === 401) {
            await supabase.auth.refreshSession();
            const { data: { session: after } } = await supabase.auth.getSession();
            if (after?.access_token) {
              currentToken = after.access_token;
              res = await postPhotosUpload(
                buildForm,
                currentToken,
                useProxyRef,
                (loaded) => applyProgress(globalIdx, loaded),
                { onRequestBodySent: () => { bodySentMap.set(batchIndex, true); syncAwaitingServer(); } },
              );
            }
          }
          if (approxBatchSizes[globalIdx] > 0) applyProgress(globalIdx, approxBatchSizes[globalIdx]);
          // BUG-01: 성공 응답에서 서버 거부 파일 목록 수집
          if (res.ok) {
            type UploadOkBody = { rejected?: string[]; original_presigned?: OriginalPresignedItem[] };
            let okBody: UploadOkBody = {};
            try { okBody = await res.json().catch(() => ({})) as UploadOkBody; } catch {}
            if (okBody.rejected?.length) backendRejected.push(...okBody.rejected);

            // presigned PUT: 원본 파일(rawFile)을 R2에 직접 업로드 후 서버에 confirm
            // batch[pi]는 압축본이므로 사용 금지 — rawFile이 브라우저 원본
            if (inclOrig && rawFile && okBody.original_presigned?.length) {
              // presigned URL 수신 수 = 실제 R2 PUT 시도 예정 건수
              sendingSourceTotalRef.current += okBody.original_presigned.length;
              for (const p of okBody.original_presigned) {
                try {
                  sendingSourceRef.current++;
                  if (sendingSourceRef.current > 0) setSendingSourcePhase(true);
                  const putOk = await putOriginalToR2(p, rawFile, currentToken);
                  const confirmed = putOk && await confirmOrRecoverOriginalUpload(p.job_id, currentToken);
                  if (!confirmed) {
                    failedOriginalTransfers.set(p.job_id, { presigned: p, file: rawFile });
                    sendingSourceFailedRef.current++;
                  }
                } catch (presignErr) {
                  failedOriginalTransfers.set(p.job_id, { presigned: p, file: rawFile });
                  sendingSourceFailedRef.current++;
                  console.warn("presigned PUT/confirm failed:", presignErr);
                } finally {
                  sendingSourceRef.current--;
                  sendingSourceDoneRef.current++;
                  setSendingSourceSnap({ done: sendingSourceDoneRef.current, total: sendingSourceTotalRef.current, failed: sendingSourceFailedRef.current });
                  if (sendingSourceRef.current <= 0) setSendingSourcePhase(false);
                }
              }
            } else if (inclOrig && rawFile) {
              // 사진 row는 생성됐지만 presigned 발급이 누락된 경우도 완료로 숨기지 않는다.
              sendingSourceFailedRef.current++;
              setSendingSourceSnap({ done: sendingSourceDoneRef.current, total: sendingSourceTotalRef.current, failed: sendingSourceFailedRef.current });
            }

            // 배치 성공: blob URL 프리뷰로 즉시 갱신 (추가 네트워크 요청 없음)
            // iOS에서 업로드 XHR과 동시에 DB 조회하면 연결 한도 초과 → blob URL 사용
            flushSync(() => {
              setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
              setPendingPhotos((prev) => [...prev, ...inFlight]);
            });
            // macrotask 경계 생성 — rAF는 백그라운드 탭에서 멈추므로 setTimeout 사용
            await new Promise<void>((r) => setTimeout(r, 0));
            uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
            pendingBlobsRef.current.push(...inFlight.map((p) => p.blobUrl));
            previewRetained = true;
          }
          if (!res.ok) {
            let body: unknown = {};
            try { body = await res.json().catch(() => ({})); } catch {}
            try {
              const betaErr = parseBetaLimitError(body);
              if (betaErr) { abortReason = "betaLimit"; abortMessage = betaErr.message; return; }
            } catch {}
            const detail = (body && typeof (body as { detail?: unknown }).detail === "string")
              ? ((body as { detail: string }).detail)
              : null;
            const authLike = isAuthLikeStatus(res.status) || (res.status === 503 && isAuthLikeDetail(detail));
            if (authLike) {
              abortReason = "auth";
              abortMessage = detail ?? "인증 오류로 업로드를 진행할 수 없습니다.";
              return;
            }
            if (!firstFailDetail && detail) firstFailDetail = detail;
            allFailed.push(...batch);
          }
        } catch (e) {
          if (isNetworkFailure(e)) { abortReason = "network"; return; }
          allFailed.push(...batch);
        }
        completedBatches++;
        setUploadProgress(Math.min(90, Math.round((completedBatches / totalBatches) * 100)));
      } finally {
        // 실패·중단 케이스에서 uploading 상태 잔류 방지
        setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
        uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
        if (!previewRetained) inFlight.forEach((p) => URL.revokeObjectURL(p.blobUrl));
        reqDoneMap.set(batchIndex, true);
        syncAwaitingServer();
      }
    };

    // PC와 모바일 모두 bounded producer-consumer 파이프라인을 사용한다. 아래 round 구현은
    // 배포 중 빠른 원인 분리를 위해 남겨둔 비활성 레거시 경로이며, 현재 조건에서는 진입하지 않는다.
    const pipelineMode = true;

    if (pipelineMode) {
      // ── producer-consumer 파이프라인 (모든 기기 — include_original=false/true 공용) ──
      // bounded channel 용량 = concurrency(기존 round 하나가 담던 batch 수와 동일 상한) —
      // "무제한 큐"를 명시적으로 피한다. compression worker(PC 2 / 모바일 1)는
      // compressImagesInParallel 내부에서 유지하고, batch를 순서대로 하나씩만 이 함수에 넘긴다.
      // 워커 풀의 busy-slot 추적이 호출 1건 단위라 동시 호출하면 경합 위험이 있기 때문이다.
      // include_original=true는 effectiveBatch=1이므로 channel item 하나 = 파일 한 장 —
      // uploadOneBatch 내부에서 기존과 동일하게 /photos → original PUT → confirm을 순차 수행하고,
      // 그 배치가 완전히 끝나야 해당 lane이 channel에서 다음 item을 꺼낸다(§lane 점유 방식 동일).
      type CompressedBatch = { batchIndex: number; files: File[] };
      const channelBuffer: CompressedBatch[] = [];
      let channelClosed = false;
      const pushWaiters: Array<() => void> = [];
      const popWaiters: Array<() => void> = [];
      const channelPush = async (item: CompressedBatch) => {
        while (channelBuffer.length >= concurrency) {
          await new Promise<void>((resolve) => pushWaiters.push(resolve));
        }
        channelBuffer.push(item);
        const w = popWaiters.shift();
        if (w) w();
      };
      const channelPop = async (): Promise<CompressedBatch | undefined> => {
        while (channelBuffer.length === 0) {
          if (channelClosed) return undefined;
          await new Promise<void>((resolve) => popWaiters.push(resolve));
        }
        const item = channelBuffer.shift()!;
        const w = pushWaiters.shift();
        if (w) w();
        return item;
      };
      // 모바일은 전송 중인 batch 외에 "다음 batch"까지만 압축한다. channelPush()에서만
      // backpressure를 걸면 이미 한 batch를 더 압축한 뒤에야 대기하게 되어, 고해상도
      // 사진 여러 장의 blob/canvas가 iOS 메모리에 겹칠 수 있다.
      const waitForPhoneChannelCapacity = async () => {
        while (channelBuffer.length >= concurrency) {
          await new Promise<void>((resolve) => pushWaiters.push(resolve));
        }
      };
      const channelClose = () => {
        channelClosed = true;
        const waiters = popWaiters.splice(0, popWaiters.length);
        waiters.forEach((w) => w());
      };

      const producer = (async () => {
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          if (stopRequestedRef.current || abortReason) break;
          // 모바일은 queue가 찬 상태에서 다음 batch를 압축하지 않는다. PC의 기존 처리량
          // 특성은 유지하고, 모바일에서만 bounded queue를 메모리 상한으로도 사용한다.
          if (isMobileUploadClient()) await waitForPhoneChannelCapacity();
          if (stopRequestedRef.current || abortReason) break;
          if (batchIndex > 0 && batchIndex % refreshInterval === 0) {
            await supabase.auth.refreshSession();
            const { data: { session: fresh } } = await supabase.auth.getSession();
            if (fresh?.access_token) currentToken = fresh.access_token;
          }

          const rawBatch = rawBatches[batchIndex];
          const chunkTs = Date.now();
          const chunkQueued = rawBatch.map((file, i) => {
            const blobUrl = URL.createObjectURL(file);
            const sourceIndex = batchIndex * effectiveBatch + i;
            const preview = { tempId: `upload-${chunkTs}-${sourceIndex}`, blobUrl, filename: file.name, sourceIndex };
            queuedBlobsRef.current.push(blobUrl);
            queuedPreviewBySourceIndexRef.current.set(sourceIndex, preview);
            return preview;
          });
          // 이미 압축되어 전송 대기 중인 카드도 유지한다. 새 batch로 통째로 교체하면
          // 이전 카드가 업로드를 시작할 때까지 화면에서 사라져 깜박임처럼 보인다.
          setQueuedPreviews((prev) => [...prev, ...chunkQueued]);

          if (stopRequestedRef.current) {
            setQueuedPreviews([]);
            chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
            queuedBlobsRef.current = queuedBlobsRef.current.filter((u) => !chunkQueued.some((q) => q.blobUrl === u));
            break;
          }

          setCompressingIndex(0);
          let compressed: File[];
          try {
            compressed = await compressImagesInParallel(
              rawBatch,
              compressAbortControllerRef.current!.signal,
              isMobileUploadClient() ? 1 : 2,
              undefined,
              () => setCompressingIndex((prev) => prev + 1),
            );
          } catch (e) {
            setCompressingIndex(-1);
            setQueuedPreviews([]);
            chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
            queuedBlobsRef.current = queuedBlobsRef.current.filter((u) => !chunkQueued.some((q) => q.blobUrl === u));
            if (!(e instanceof DOMException && e.name === "AbortError")) {
              // 압축 자체가 시작 불가한 예외 — 이후 tail 처리(cleanupAllTempStates)에서 정리하고 에러 표시.
              abortReason = "compressSetup";
              abortMessage = "사진 압축을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.";
            }
            break;
          }
          setCompressingIndex(-1);
          // 큐 미리보기는 uploadOneBatch()가 같은 tempId/blobUrl로 전송 상태에 인계한다.
          // 여기서 제거하면 카드가 잠시 사라졌다가 다시 나타난다.

          await channelPush({ batchIndex, files: compressed });
        }
        channelClose();
      })();

      const runLane = async () => {
        for (;;) {
          const item = await channelPop();
          if (!item) return;
          await uploadOneBatch(item.files, item.batchIndex);
        }
      };
      const lanes = Array.from({ length: Math.max(1, concurrency) }, () => runLane());
      await Promise.all([producer, ...lanes]);
    } else {
      // ── 기존 round 기반 루프 (모바일 전체) — 동작 변경 없음 ──
      for (let chunkStart = 0; chunkStart < totalBatches; chunkStart += concurrency) {
        if (stopRequestedRef.current || abortReason) break;
        if (chunkStart > 0 && chunkStart % refreshInterval === 0) {
          await supabase.auth.refreshSession();
          const { data: { session: fresh } } = await supabase.auth.getSession();
          if (fresh?.access_token) currentToken = fresh.access_token;
        }

        // ── STEP 1: 이번 라운드의 raw 파일 배치 구성 ──
        const rawChunk: File[][] = [];
        for (let bi = 0; bi < concurrency && chunkStart + bi < totalBatches; bi++) {
          rawChunk.push(rawBatches[chunkStart + bi]);
        }

        // ── STEP 2: 이 라운드 파일만 queuedPreviews에 표시 (최대 concurrency×effectiveBatch장) ──
        const chunkTs = Date.now();
        const allRawInChunk = rawChunk.flat();
        const chunkQueued = allRawInChunk.map((file, i) => {
          const blobUrl = URL.createObjectURL(file);
          const sourceIndex = chunkStart * effectiveBatch + i;
          const preview = { tempId: `upload-${chunkTs}-${sourceIndex}`, blobUrl, filename: file.name, sourceIndex };
          queuedBlobsRef.current.push(blobUrl);
          queuedPreviewBySourceIndexRef.current.set(sourceIndex, preview);
          return preview;
        });
        setQueuedPreviews(chunkQueued);

        // ── STEP 3: 이 라운드 압축(워커 풀로 여러 장 동시 처리 — 데스크톱 2 / 모바일 1) ──
        if (stopRequestedRef.current) {
          setQueuedPreviews([]);
          chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
          queuedBlobsRef.current = queuedBlobsRef.current.filter(
            (u) => !chunkQueued.some((q) => q.blobUrl === u)
          );
          break;
        }
        setCompressingIndex(0);
        let flatCompressed: File[];
        try {
          flatCompressed = await compressImagesInParallel(
            allRawInChunk,
            compressAbortControllerRef.current!.signal,
            isMobileUploadClient() ? 1 : 2,
            undefined,
            () => setCompressingIndex((prev) => prev + 1),
          );
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            setCompressingIndex(-1);
            setQueuedPreviews([]);
            chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
            queuedBlobsRef.current = queuedBlobsRef.current.filter(
              (u) => !chunkQueued.some((q) => q.blobUrl === u)
            );
            break;
          }
          // 예외를 다시 던지면 이벤트 핸들러에서 Promise가 끊겨 업로드 잠금(ref)이
          // 해제되지 않는다. 압축 실패는 안전하게 현재 세션만 종료하고 재시도를 허용한다.
          setCompressingIndex(-1);
          setQueuedPreviews([]);
          chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
          queuedBlobsRef.current = queuedBlobsRef.current.filter(
            (u) => !chunkQueued.some((q) => q.blobUrl === u)
          );
          setUploadError("사진 압축을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
          setUploadPhase("idle");
          uploadInProgressRef.current = false;
          return;
        }
        // rawChunk(배치별)와 동일한 크기로 재분할 — 이후 STEP 4/업로드는 배치 단위로 동작
        const compressedChunk: File[][] = [];
        {
          let cursor = 0;
          for (const batch of rawChunk) {
            compressedChunk.push(flatCompressed.slice(cursor, cursor + batch.length));
            cursor += batch.length;
          }
        }
        setCompressingIndex(-1);

        // ── STEP 4: XHR 시작 시 각 카드가 같은 tempId/blobUrl로 uploading 상태에 인계된다. ──

        const chunk = compressedChunk;
        await Promise.all(chunk.map((batch, chunkOffset) => uploadOneBatch(batch, chunkStart + chunkOffset)));
        // batch 간 macrotask 경계 생성: iOS WKWebView는 macrotask 사이에서만 paint
        // 이 시점에 이전 batch blob preview가 DOM에 있고 다음 XHR이 아직 시작 안 됨 → paint 보장
        if (isMobileUploadClient()) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }

    // 개별 PUT의 3회 재시도가 모두 실패해도 다른 사진을 계속 처리한 뒤 실패 항목만 한 번 더
    // 전송한다. 정상 사진은 재전송하지 않으므로 일반 업로드 속도에는 영향이 없다.
    if (!abortReason && !stopRequestedRef.current && failedOriginalTransfers.size > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      const retryItems = Array.from(failedOriginalTransfers.values());
      let nextRetryIndex = 0;
      let retryFailed = 0;
      sendingSourceFailedRef.current = 0;
      setSendingSourcePhase(true);
      setSendingSourceSnap({
        done: sendingSourceDoneRef.current,
        total: sendingSourceTotalRef.current,
        failed: 0,
      });

      const retryLane = async () => {
        while (nextRetryIndex < retryItems.length) {
          const item = retryItems[nextRetryIndex++];
          try {
            const recovered = await recoverOriginalJob(item.presigned.job_id, currentToken);
            if (recovered.status === "confirmed") continue;
            const refreshedPresigned: OriginalPresignedItem = {
              ...item.presigned,
              url: recovered.url,
              source_key: recovered.source_key,
              content_type: recovered.content_type,
            };
            const putOk = await putOriginalToR2(refreshedPresigned, item.file, currentToken);
            const confirmed = putOk && await confirmOrRecoverOriginalUpload(
              refreshedPresigned.job_id,
              currentToken,
            );
            if (!confirmed) {
              retryFailed++;
              await reportOriginalUploadFailure(refreshedPresigned.job_id, currentToken).catch(() => {});
            }
          } catch (error) {
            retryFailed++;
            console.warn("deferred original retry failed:", error);
            await reportOriginalUploadFailure(item.presigned.job_id, currentToken).catch(() => {});
          }
          setSendingSourceSnap({
            done: sendingSourceDoneRef.current,
            total: sendingSourceTotalRef.current,
            failed: retryFailed,
          });
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(2, retryItems.length) },
        () => retryLane(),
      ));
      sendingSourceFailedRef.current = retryFailed;
      setSendingSourcePhase(false);
    }

    if (stopRequestedRef.current) {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle");
      setUploadProgress(0);
      // 중단 전에 이미 완료된 배치는 서버에서 projects.photo_count까지 갱신된다.
      // 사진 목록만 다시 읽으면 초대 CTA가 이전 project.photoCount를 계속 참조하므로,
      // 두 데이터를 함께 새로고침해 업로드 완료분을 바로 활성화 조건에 반영한다.
      await Promise.all([loadPhotos(), loadProject()]);
      setPendingPhotos([]);
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
      setUploadingPhotos([]);
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
      setQueuedPreviews([]);
      queuedBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      queuedBlobsRef.current = [];
      queuedPreviewBySourceIndexRef.current.clear();
      setUploadStopRequested(false);
      uploadInProgressRef.current = false;
      return;
    }

    // abort 시 모든 임시 상태 제거 + DB 재조회로 그리드를 실제 상태로 복원
    const cleanupAllTempStates = async () => {
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
      queuedBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      queuedBlobsRef.current = [];
      queuedPreviewBySourceIndexRef.current.clear();
      let freshPhotos: Photo[] = [];
      try { freshPhotos = await getPhotosByProjectId(id); } catch {}
      flushSync(() => {
        setPhotos(freshPhotos);
        setPendingPhotos([]);
        setUploadingPhotos([]);
        setQueuedPreviews([]);
        setPhotosLoading(false);
      });
    };
    const formatAuthError = (detail: string) =>
      /not yet valid|iat/i.test(detail)
        ? "인증 오류로 업로드할 수 없습니다. 기기의 날짜/시간이 자동 설정인지 확인 후 새로고침해 주세요."
        : `업로드에 실패했습니다. (${detail})`;

    if (abortReason === "compressSetup") { setAwaitingServerFinalize(false); setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return; }
    if (abortReason === "betaLimit") { setAwaitingServerFinalize(false); setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return; }
    if (abortReason === "network") { setAwaitingServerFinalize(false); setUploadError("업로드에 실패했습니다. 인터넷 연결을 확인해 주세요."); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return; }
    if (abortReason === "auth") { setAwaitingServerFinalize(false); setUploadError(formatAuthError(abortMessage)); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return; }

    let originalFinalize: OriginalFinalizeResult | null = null;
    if (inclOrig) originalFinalize = await finalizeOriginalUpload(id, currentToken);
    const originalIncomplete = inclOrig && (
      sendingSourceFailedRef.current > 0 || !originalFinalize?.ok
    );

    setAwaitingServerFinalize(false);
    setUploadProgress(originalIncomplete ? 99 : 100);
    if (!originalIncomplete) {
      setUploadPhase("done");
      fetch("/api/photographer/project-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "uploaded" }) }).catch(() => {});
    }
    setTimeout(async () => {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle"); setUploadProgress(0);
      uploadInProgressRef.current = false;
      if (allFailed.length > 0) {
        setUploadError(firstFailDetail
          ? `${allFailed.length}장 실패: ${firstFailDetail}`
          : `${allFailed.length}장 업로드에 실패했습니다.`);
      }
      if (backendRejected.length > 0) {
        setUploadError(
          `${backendRejected.length}개 파일은 지원하지 않는 형식입니다 (JPEG/PNG/WebP/HEIC만 가능): ${backendRejected.slice(0, 3).join(", ")}${backendRejected.length > 3 ? ` 외 ${backendRejected.length - 3}개` : ""}`
        );
      }
      const totalFail = allFailed.length + backendRejected.length;
      if (originalIncomplete) {
        const incompleteCount = Math.max(
          sendingSourceFailedRef.current,
          originalFinalize?.incomplete ?? 0,
          originalFinalize?.missing_jobs ?? 0,
        );
        setUploadError(originalFinalize
          ? `사진 업로드는 완료됐지만 원본 ${incompleteCount}장이 완료되지 않았습니다. 아래에서 원본을 복구해 주세요.`
          : "사진 업로드는 완료됐지만 원본 상태를 확인하지 못했습니다. 아래 복구 상태를 확인해 주세요.");
        setToast("원본 업로드 확인 필요");
      } else {
        setToast(totalFail === 0 ? "업로드 완료!" : `${totalFail}개 파일 처리 실패`);
      }
      await loadProject();
      // 새로 업로드된 사진이 clipPending 캐시에 반영되지 않으면 이미 분석된 것으로
      // 오인해 재분석 버튼이 조용히 무시된다 — 업로드 완료 시마다 상태를 다시 읽는다.
      loadClipAnalysisStatus();
      // finalize는 DB 상태만 집계한다. 미완료 job의 R2 HEAD 자동 복구와 배너 갱신은 여기서 수행한다.
      if (inclOrig) checkPendingOriginals();
      let freshPhotos: Photo[] = [];
      try { freshPhotos = await getPhotosByProjectId(id); } catch {}
      // blob URL 먼저 해제
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
      queuedBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      queuedBlobsRef.current = [];
      queuedPreviewBySourceIndexRef.current.clear();
      // 단일 렌더로 DB 사진 표시 + 임시 프리뷰 동시 제거 (중간 프레임 없음)
      flushSync(() => {
        setPhotos(freshPhotos);
        setPendingPhotos([]);
        setUploadingPhotos([]);
        setQueuedPreviews([]);
        setPhotosLoading(false);
      });
      router.refresh();
    }, 600);
  }, [id, loadProject, loadPhotos, router, project?.includeOriginal, loadClipAnalysisStatus, checkPendingOriginals]);

  const handleStopUpload = useCallback(() => {
    if (stopRequestedRef.current) return;
    // 현재 진행 중인 서버 요청/원본 PUT은 완료시켜 서버·R2 상태를 일관되게 유지하고,
    // 아직 시작하지 않은 압축·다음 배치만 중단한다.
    stopRequestedRef.current = true;
    compressAbortControllerRef.current?.abort();
    setUploadStopRequested(true);
  }, []);

  useEffect(() => {
    if (!project?.id || !id) return;
    checkPendingOriginals();
  }, [project?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 복구: filename+size+lastModified 매칭 후 재업로드. 매칭 실패 job은 unmatchedJobs로 표시.
  const recoverOriginalFiles = useCallback(async (selectedFiles: File[]) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const newUnmatched: PendingOriginalItem[] = [];

    for (const job of pendingRecovery) {
      const match = selectedFiles.find(
        (f) =>
          f.name === job.original_filename &&
          (job.original_file_size === null || f.size === job.original_file_size) &&
          (job.original_last_modified === null || f.lastModified === job.original_last_modified),
      );
      if (!match) {
        newUnmatched.push(job);
        continue;
      }
      try {
        const result = await recoverOriginalJob(job.id, token);
        if (result.status === "needs_upload") {
          const presignedItem: OriginalPresignedItem = {
            job_id: job.id, url: result.url,
            source_key: result.source_key, content_type: result.content_type, expires_at: "",
          };
          const putOk = await putOriginalToR2(presignedItem, match);
          if (putOk && await confirmOrRecoverOriginalUpload(job.id, token)) {
            // R2 PUT과 완료 확인까지 복구됨
          } else {
            newUnmatched.push(job); // PUT/확인 실패는 미완료 처리
          }
        }
        // result.status === "confirmed" → 이미 처리됨, 성공으로 간주
      } catch (err) {
        console.warn("recovery failed for job", job.id, err);
        newUnmatched.push(job);
      }
    }

    setUnmatchedJobs(newUnmatched);

    const remaining = await fetchPendingOriginals(id, token);
    setPendingRecovery(remaining);
    if (remaining.length === 0 && newUnmatched.length === 0) setShowRecoveryBanner(false);
  }, [id, pendingRecovery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    // 초대 링크 활성화 후에는 파일 입력이 남아 있더라도 추가 업로드를 시작하지 않는다.
    if (project?.status !== "preparing") {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!chosen?.length) return;
    let list = Array.from(chosen).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (fileInputRef.current) fileInputRef.current.value = "";
    const rawCount = list.filter(isRawFile).length;
    list = list.filter((f) => !isRawFile(f));
    if (rawCount > 0) setUploadError(`RAW 파일은 지원하지 않습니다 (${rawCount}개 제외). JPEG/PNG/WebP/HEIC로 내보내기 후 업로드해주세요.`);
    if (!list.length) return;
    const remaining = Math.max(0, betaMaxPhotosPerProject - photos.length);
    if (list.length > remaining) {
      setUploadError(`최대 ${betaMaxPhotosPerProject}장까지 업로드 가능합니다. ${list.length - remaining}장이 제외됩니다.`);
      list = list.slice(0, remaining);
      if (!list.length) return;
    } else if (isMobileUploadClient() && list.length >= 100) {
      setUploadError("모바일에서 100장 이상 업로드 시 시간이 오래 걸릴 수 있습니다. PC 사용을 권장합니다.");
    }
    setPendingFiles(list);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (!project || project.status !== "preparing") return;
    let list = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || f.type === "");
    const rawCount = list.filter(isRawFile).length;
    list = list.filter((f) => !isRawFile(f));
    if (rawCount > 0) setUploadError(`RAW 파일은 지원하지 않습니다 (${rawCount}개 제외). JPEG/PNG/WebP/HEIC로 내보내기 후 업로드해주세요.`);
    if (!list.length) return;
    const remaining = Math.max(0, betaMaxPhotosPerProject - photos.length);
    if (list.length > remaining) {
      setUploadError(`최대 ${betaMaxPhotosPerProject}장까지 업로드 가능합니다. ${list.length - remaining}장이 제외됩니다.`);
      list = list.slice(0, remaining);
      if (!list.length) return;
    } else if (isMobileUploadClient() && list.length >= 100) {
      setUploadError("모바일에서 100장 이상 업로드 시 시간이 오래 걸릴 수 있습니다. PC 사용을 권장합니다.");
    }
    setPendingFiles(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, photos.length]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }, []);

  /** 사진 추가는 고객 링크를 열기 전(preparing)에만 가능하다. */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const requestOpenFilePicker = useCallback(() => {
    if (!project) return;
    if (uploadPhase === "sending" || uploadPhase === "processing") return;
    if (project.status !== "preparing") return;
    pendingDropFilesRef.current = null;
    openFilePicker();
  }, [project, uploadPhase]);

  /** selecting 안내 모달 확인: 드롭 파일이 있었으면 pending으로 넘기고, 없으면 picker 오픈 */
  const handleSelectingWarnConfirm = useCallback(() => {
    setShowSelectingWarn(false);
    const dropped = pendingDropFilesRef.current;
    pendingDropFilesRef.current = null;
    if (dropped && dropped.length) {
      setPendingFiles(dropped);
      return;
    }
    openFilePicker();
  }, [openFilePicker]);

  const handleSelectingWarnCancel = useCallback(() => {
    pendingDropFilesRef.current = null;
    setShowSelectingWarn(false);
  }, []);

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/c/${project?.accessToken ?? ""}` : `/c/${project?.accessToken ?? ""}`;

  const handleCopyLink = () => {
    const pin = project?.accessPin;
    navigator.clipboard.writeText(pin ? `링크: ${inviteUrl}\n비밀번호: ${pin}` : inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleSavePin = async (newPin: string | null) => {
    if (!project) return;
    setPinError(""); setPinSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_pin: newPin }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({ ...project, accessPin: newPin }); setShowPinModal(false); setPinInput("");
    } catch (e) { setPinError(e instanceof Error ? e.message : "저장 실패"); }
    finally { setPinSaving(false); }
  };

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingId(photoId);
    try {
      const res = await fetch(`/api/photographer/photos/${photoId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "삭제 실패");
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setProject((prev) => prev ? { ...prev, photoCount: Math.max(0, prev.photoCount - 1) } : null);

      const group = (data as {
        group?: { groupId: string | null; action?: string; representativePhotoId?: string; photoCount?: number };
      }).group;
      if (group?.groupId) {
        if (group.action === "disbanded") {
          setPhotoGroups((prev) => prev.filter((g) => g.id !== group.groupId));
        } else if (group.action === "reassigned" && group.representativePhotoId && typeof group.photoCount === "number") {
          const { representativePhotoId, photoCount } = group;
          setPhotoGroups((prev) => prev.map((g) => (g.id === group.groupId ? { ...g, representativePhotoId, photoCount } : g)));
        } else if (group.action === "updated" && typeof group.photoCount === "number") {
          const { photoCount } = group;
          setPhotoGroups((prev) => prev.map((g) => (g.id === group.groupId ? { ...g, photoCount } : g)));
        }
      }

      setToast("삭제되었습니다.");
      // 삭제로 사진 집합이 바뀌면 이전에 캐시된 clipPending(분석 완료 판정)이 stale해진다.
      loadClipAnalysisStatus();
      // 삭제 직전/직후 원본 아카이브 워커가 상태를 바꾼 경우에도 하단 초대 버튼이
      // 이전 "정리 중" 상태를 계속 보지 않도록 프로젝트 메타데이터를 다시 읽는다.
      await loadProject();
    } catch (e) { setToast(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setDeletingId(null); }
  };

  const handleFlushAll = async () => {
    if (!project || project.status !== "preparing") return;
    setShowFlushAllConfirm(false);
    setDeletingId("__all__");
    stopRequestedRef.current = true;
    compressAbortControllerRef.current?.abort();
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos`, { method: "DELETE" });
      if (res.ok) {
        setPhotos([]);
        setProject({ ...project, photoCount: 0 });
        setPendingPhotos([]);
        pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
        pendingBlobsRef.current = [];
        setUploadingPhotos([]);
        uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
        uploadingBlobsRef.current = [];
        setUploadPhase("idle");
        setUploadProgress(0);
        setAwaitingServerFinalize(false);
        setToast("전체 삭제됨");
        // 전체 삭제 후 clipPending이 이전(분석 완료) 값 그대로 남아있으면 신규 업로드 후에도
        // "이미 최신 분석 결과입니다"로 오판해 재분석 API 호출을 건너뛴다.
        loadClipAnalysisStatus();
        await loadProject();
      } else {
        const d = await res.json().catch(() => ({}));
        setToast((d as { error?: string }).error ?? "삭제 실패");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleEnableClientAccess = async () => {
    if (!project) return;
    const m = project.photoCount;
    const n = project.requiredCount;
    if (project.status !== "preparing" || m < n) return;
    // DB에 먼저 반영된 사진 수만으로 링크를 열면, 같은 화면에서 아직 전송/압축 중인
    // 나머지 사진이 고객 갤러리에서 빠질 수 있다. 현재 업로드 세션이 완전히 끝날 때까지 막는다.
    const uploadStillActive =
      uploadPhase === "sending" ||
      uploadPhase === "processing" ||
      isPreparingFiles ||
      awaitingServerFinalize ||
      uploadingPhotos.length > 0 ||
      queuedPreviews.length > 0 ||
      sendingSourcePhase;
    if (uploadStillActive) {
      setToast("사진 업로드가 모두 완료된 뒤 고객 링크를 활성화할 수 있습니다.");
      return;
    }
    setInviteActivating(true);
    setInviteOriginalsProcessing(false);
    try {
      for (let attempt = 0; attempt < INVITE_ORIGINAL_PROCESSING_MAX_ATTEMPTS; attempt++) {
        const res = await fetch(`/api/photographer/projects/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "selecting" satisfies ProjectStatus }),
        });
        const data = await res.json().catch(() => ({})) as {
          error?: string;
          code?: string;
          processingCount?: number;
          retryAfterMs?: number;
        };
        if (res.ok) {
          fetch("/api/photographer/project-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: id, action: "selecting" }),
          }).catch(() => {});
          setProject({ ...project, status: "selecting" });
          setInviteShareModalOpen(true);
          router.refresh();
          return;
        }

        if (data.code !== "originals_processing") {
          setToast(data.error ?? "초대 링크 활성화에 실패했습니다.");
          return;
        }

        setInviteOriginalsProcessing(true);
        if (attempt === INVITE_ORIGINAL_PROCESSING_MAX_ATTEMPTS - 1) {
          setToast("원본 확인이 지연되고 있습니다. 잠시 후 다시 활성화해 주세요.");
          return;
        }
        setToast(data.error ?? "원본 상태를 확인 중입니다. 완료되면 자동으로 활성화합니다.");
        const retryMs = Math.max(500, Math.min(data.retryAfterMs ?? INVITE_ORIGINAL_PROCESSING_RETRY_MS, 3000));
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "초대 링크 활성화에 실패했습니다.");
    } finally {
      setInviteActivating(false);
      setInviteOriginalsProcessing(false);
    }
  };

  const handleStartClipAnalysis = async () => {
    // 대기 중인 사진이 없으면(이미 전체 분석 완료) API를 다시 부르지 않고 결과만 보여준다 —
    // 저장된 임베딩·그룹이 이미 최신 상태이므로 그대로 토글만 켠다.
    if (clipPending && clipPending.pending === 0 && clipPending.alreadyAnalyzed > 0) {
      setSimilarityToggleOn(true);
      setToast("이미 최신 분석 결과입니다.");
      return;
    }
    setClipAnalysisTriggering(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/gemini-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((data as { error?: string; detail?: string }).error ?? (data as { detail?: string }).detail ?? "분석 시작에 실패했습니다.");
        return;
      }
      setClipAnalysisStatus("processing");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "분석 시작에 실패했습니다.");
    } finally {
      setClipAnalysisTriggering(false);
    }
  };

  const handleCancelClipAnalysis = async () => {
    setClipAnalysisTriggering(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/gemini-analysis`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((data as { error?: string }).error ?? "분석 중단에 실패했습니다.");
        return;
      }
      await loadClipAnalysisStatus();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "분석 중단에 실패했습니다.");
    } finally {
      setClipAnalysisTriggering(false);
    }
  };

  if (loading) return <PageLoader variant="full" />;
  if (!project) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>PROJECT_NOT_FOUND</span></div>;

  const N = project.requiredCount;
  const M = project.photoCount;
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isInviteActive = project.status !== "preparing";
  const progressPct = N > 0 ? Math.min(100, Math.round((displayPhotos.length / N) * 100)) : 0;
  const isUploading = uploadPhase === "sending" || uploadPhase === "processing";
  // 갤러리 업로드, 클라이언트 압축, 서버 최종 저장, 원본 R2 PUT 중 하나라도 남아 있으면
  // 고객 링크를 열지 않는다. pendingPhotos는 완료 직후 잠깐 남는 낙관적 표시이므로 제외한다.
  const uploadBlockingInvite =
    isUploading ||
    isPreparingFiles ||
    awaitingServerFinalize ||
    uploadingPhotos.length > 0 ||
    queuedPreviews.length > 0 ||
    sendingSourcePhase ||
    pendingRecovery.length > 0;
  const showServerWorking = uploadPhase === "processing" && awaitingServerFinalize;
  const photoUploadAllowed = project.status === "preparing";
  const canFlushAll =
    project.status === "preparing" &&
    displayPhotos.length > 0 &&
    !isUploading &&
    deletingId !== "__all__";

  const labelStyle: React.CSSProperties = { fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, display: "block", marginBottom: 6 };

  return (
    <div
      className="prj-root"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        position: "relative",
        background: SURFACE_0,
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes prj-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(500%); } }
        @keyframes prj-bar-indeterminate-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        @keyframes prj-bar-indet-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        @keyframes prj-compress-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.85; } }
        .prj-compressing-overlay { position: absolute; inset: 0; z-index: 11; background: rgba(var(--accent-rgb), 0.15); display: flex; align-items: center; justify-content: center; animation: prj-compress-pulse 0.9s ease-in-out infinite; }
        .prj-tech-label { font-family: 'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif; font-size: 0.63rem; letter-spacing: 0.15em; text-transform: uppercase; }
        .prj-scroll::-webkit-scrollbar { width: 4px; }
        .prj-scroll::-webkit-scrollbar-track { background: ${SURFACE_2}; }
        .prj-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); }
        .prj-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .prj-data-cell { position: relative; cursor: pointer; transition: border-color 0.2s; }
        .prj-data-cell .prj-overlay { position: absolute; inset: 4px; border: 1px solid transparent; transition: all 0.3s; pointer-events: none; }
        .prj-data-cell:hover .prj-overlay { border-color: rgba(var(--accent-rgb), 0.3); inset: 0px; }
        .prj-data-cell:hover { border-color: rgba(var(--accent-rgb), 0.4) !important; }
        .prj-upload-tile:hover { border-color: rgba(var(--accent-rgb), 0.45) !important; background: rgba(var(--accent-rgb), 0.04) !important; }
        .prj-upload-tile:active { border-color: rgba(var(--accent-rgb), 0.4) !important; }
        .prj-upload-tile:focus-visible { outline: none; border-color: ${ACCENT} !important; }
        .prj-del-btn { opacity: 0; transition: opacity 0.15s; }
        .prj-data-cell:hover .prj-del-btn { opacity: 1; }
        @media (max-width: 768px) { .prj-del-btn { opacity: 1; } }
        .prj-group-badge {
          position: absolute; bottom: 4px; right: 4px;
          min-width: 20px; height: 18px; padding: 0 5px;
          background: rgba(0,0,0,0.75); border: 1px solid ${ACCENT};
          color: ${ACCENT}; font-family: ${MONO};
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          z-index: 10; cursor: pointer; transition: all 0.15s ease;
        }
        .prj-group-badge:hover { background: ${ACCENT}; color: #000; }
        .prj-group-badge-inline {
          flex-shrink: 0; min-width: 20px; height: 18px; padding: 0 5px;
          background: transparent; border: 1px solid ${ACCENT};
          color: ${ACCENT}; font-family: ${MONO};
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s ease;
        }
        .prj-group-badge-inline:hover { background: ${ACCENT}; color: #000; }
        .prj-similarity-toggle {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 500; background: none; border: none;
          cursor: pointer; white-space: nowrap; font-family: ${MONO}; padding: 4px 6px;
        }
        .prj-similarity-checkbox {
          width: 13px; height: 13px; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease;
        }
        .prj-similarity-toggle.prj-similarity-on .prj-similarity-checkbox {
          background: ${ACCENT}; border-color: ${ACCENT};
        }
        .prj-op-node { transition: all 0.2s; cursor: pointer; }
        .prj-op-node:hover { border-color: rgba(var(--accent-rgb), 0.4) !important; background: rgba(var(--accent-rgb), 0.04) !important; }
        .prj-op-node:hover .prj-op-arrow { color: ${ACCENT} !important; }
        .prj-modal-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); padding: 16px; }
        .prj-modal-box { background: var(--surface-raised); border: 1px solid ${BORDER_MID}; width: 100%; position: relative; }
        .prj-modal-box::before { content: ''; position: absolute; top: -1px; left: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .prj-modal-box::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .prj-btn-primary { background: ${ACCENT_DIM}; border: 1px solid rgba(var(--accent-rgb), 0.5); color: ${ACCENT}; cursor: pointer; font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-primary:hover { background: ${ACCENT}; color: #000; }
        .prj-btn-secondary { background: transparent; border: 1px solid ${BORDER_MID}; color: ${TEXT_MUTED}; cursor: pointer; font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-secondary:hover { border-color: var(--border-strong); color: ${TEXT_BRIGHT}; }
        .prj-btn-danger { background: transparent; border: 1px solid rgba(255,51,51,0.3); color: #FF3333; cursor: pointer; font-family: 'Space Mono', 'Noto Sans KR', sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-danger:hover { background: rgba(255,51,51,0.1); }
        .prj-dropzone { border: 1px dashed var(--border); transition: all 0.2s; }
        .prj-dropzone-over { border-color: rgba(var(--accent-rgb), 0.5) !important; background: ${ACCENT_DIM} !important; }
        .prj-mobile-toolbar { display: none; }
        @media (max-width: 768px) {
          .prj-desktop-toolbar { display: none !important; }
          .prj-view-toolbar { display: none !important; }
          .prj-mobile-toolbar { display: flex !important; }
          .prj-modal-box { max-width: 100% !important; margin: 0 8px !important; }
          .prj-btn-primary, .prj-btn-secondary, .prj-btn-danger { min-height: 44px !important; padding: 0 16px !important; }
          /* 고객 초대 바: 모바일 하단 탭 위 고정(스크롤 끝까지 내릴 필요 없음) */
          .prj-invite-bar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: calc(60px + env(safe-area-inset-bottom, 0px));
            z-index: 60;
            padding: 10px 12px !important;
            gap: 10px !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
          }
          .prj-invite-bar .prj-invite-sub { display: none !important; }
          .prj-invite-bar .prj-invite-title { font-size: 12px !important; margin: 0 !important; }
          .prj-invite-bar .prj-invite-meta { flex: 1; min-width: 0; }
          .prj-invite-bar .prj-invite-btn { flex-shrink: 0; white-space: nowrap !important; padding: 8px 12px !important; font-size: 12px !important; }
          /* 고정 초대 바 + 하단 네비 위 여유 */
          .prj-photo-scroll-mobile-pad {
            padding-bottom: calc(72px + 60px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }
      `}</style>

      <input ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES} style={{ display: "none" }} onChange={handleFileChange} />

      <PhotographerPageHeader
        crumbs={[
          { label: "프로젝트", href: "/photographer/projects" },
          { label: project.name, href: `/photographer/projects/${id}` },
          { label: "원본 업로드" },
        ]}
        title="원본 업로드"
        stats={[
          { label: "업로드", value: `${displayPhotos.length}장` },
          { label: "고객 셀렉", value: `${N}장`, accent: displayPhotos.length >= N && N > 0 },
        ]}
        actions={
          <span style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 10,
            letterSpacing: "0.05em",
            padding: "3px 9px",
            border: `1px solid ${project.includeOriginal ? "rgba(var(--accent-rgb),0.4)" : "rgba(150,150,150,0.3)"}`,
            color: project.includeOriginal ? "var(--accent)" : "var(--muted-foreground)",
            background: project.includeOriginal ? "rgba(var(--accent-rgb),0.08)" : "transparent",
            whiteSpace: "nowrap",
          }}>
            {project.includeOriginal ? "납품용 원본 포함" : "썸네일만"}
          </span>
        }
      />

      {/* 모바일: 헤더 바로 아래 전체 너비 진행 라인 (업로드·에러 시; 종료 시 200ms 페이드) */}
      {mobileProgressBarMounted && (
        <div
          className="prj-mobile-progress md:hidden"
          style={{
            flexShrink: 0,
            background: SURFACE_1,
            opacity: isUploading || uploadError ? 1 : 0,
            transition: "opacity 200ms ease",
            zIndex: 11,
          }}
        >
          <div style={{ height: 2, background: "var(--border)", overflow: "hidden", position: "relative" }}>
            {showServerWorking ? (
              <div style={{ width: "100%", height: "100%", background: ACCENT, animation: "prj-bar-indeterminate-pulse 1.4s ease-in-out infinite", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.35)", width: "35%", animation: "prj-bar-indet-sweep 1.1s linear infinite" }} />
              </div>
            ) : isUploading ? (
              <div style={{ width: `${overallProgress}%`, height: "100%", background: ACCENT, transition: "width 0.3s" }} />
            ) : null}
          </div>
          {isUploading && (
            <div style={{ minHeight: 38, padding: "0 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                {uploadStopRequested ? "중단 중" : sendingSourcePhase ? "원본 전송" : compressingIndex >= 0 ? "압축 중" : "업로드 중"}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sendingSourcePhase
                  ? `사진 ${pendingPhotos.length}/${totalUploadCount} · 원본 ${sendingSourceSnap.done}/${sendingSourceSnap.total}${sendingSourceSnap.failed > 0 ? ` · 재시도 ${sendingSourceSnap.failed}` : ""} · 화면을 닫지 마세요`
                  : `${pendingPhotos.length}/${totalUploadCount}장 · ${showServerWorking ? "서버 처리 중" : `${overallProgress}%`}`}
              </span>
              <button
                type="button"
                onClick={handleStopUpload}
                disabled={uploadStopRequested}
                style={{ flexShrink: 0, padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: TEXT_NORMAL, fontFamily: MONO, fontSize: 10, cursor: uploadStopRequested ? "wait" : "pointer", opacity: uploadStopRequested ? 0.55 : 1 }}
              >
                {uploadStopRequested ? "중단 중" : "중단"}
              </button>
            </div>
          )}
          {uploadError && (
            <p style={{ margin: 0, padding: "6px 16px", fontFamily: MONO, fontSize: 10, color: "#FF3333", borderBottom: `1px solid ${BORDER}` }}>
              {uploadError}
            </p>
          )}
          {/* ── 이어 업로드 복구 배너 ── */}
          {showRecoveryBanner && pendingRecovery.length > 0 && uploadPhase === "idle" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "rgba(245,158,11,0.1)", borderBottom: `1px solid rgba(245,158,11,0.3)`, flexShrink: 0 }}>
              <AlertTriangle size={12} style={{ color: "#F59E0B", flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#B45309", flex: 1 }}>
                원본 업로드 미완료 {pendingRecovery.length}개 — 파일을 선택해 이어 업로드할 수 있습니다
              </span>
              <label style={{ cursor: "pointer" }}>
                <input
                  ref={recoveryFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (recoveryFileInputRef.current) recoveryFileInputRef.current.value = "";
                    if (files.length > 0) recoverOriginalFiles(files);
                  }}
                />
                <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                  이어 업로드
                </span>
              </label>
              <button type="button" onClick={() => setShowRecoveryBanner(false)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex" }}>
                <X size={12} />
              </button>
            </div>
          )}
          {/* ── 복구 매칭 실패 — 즉시 표시 ── */}
          {unmatchedJobs.length > 0 && (
            <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.06)", borderBottom: `1px solid rgba(239,68,68,0.2)`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={12} style={{ color: "#EF4444", flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: "#B91C1C", fontWeight: 600 }}>
                  원본 파일을 찾지 못했습니다 ({unmatchedJobs.length}개)
                </span>
                <button type="button" onClick={() => setUnmatchedJobs([])} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex", marginLeft: "auto" }}>
                  <X size={12} />
                </button>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, marginBottom: 6, lineHeight: 1.6 }}>
                파일명이 변경되었거나 다른 파일을 선택했을 수 있습니다. 원본 파일명 그대로 다시 선택해 주세요.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {unmatchedJobs.map((j) => (
                  <span key={j.id} style={{ fontFamily: MONO, fontSize: 9, background: "rgba(239,68,68,0.1)", color: "#B91C1C", padding: "1px 6px", borderRadius: 3 }}>
                    {j.original_filename ?? "(파일명 없음)"}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ cursor: "pointer" }}>
                  <input
                    ref={retryRecoveryFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (retryRecoveryFileInputRef.current) retryRecoveryFileInputRef.current.value = "";
                      if (files.length > 0) {
                        // 매칭 실패 job을 pendingRecovery에 넣고 재시도
                        setPendingRecovery(unmatchedJobs);
                        setUnmatchedJobs([]);
                        recoverOriginalFiles(files);
                      }
                    }}
                  />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                    다시 파일 선택
                  </span>
                </label>
                <button
                  type="button"
                  style={{ fontFamily: MONO, fontSize: 9, color: "#EF4444", border: "1px solid rgba(239,68,68,0.4)", background: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
                  onClick={async () => {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token;
                    if (!token) return;
                    for (const j of unmatchedJobs) {
                      try { await abandonOriginalJob(j.id, token); } catch {}
                    }
                    setUnmatchedJobs([]);
                    setPendingRecovery((prev) => prev.filter((p) => !unmatchedJobs.some((u) => u.id === p.id)));
                  }}
                >
                  원본 업로드 포기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 데스크톱 업로드 오류 표시 (모바일 오류는 mobileProgressBarMounted 블록 내에 표시됨) */}
      {uploadError && (
        <div
          className="prj-desktop-toolbar"
          style={{ padding: "7px 16px", background: "rgba(255,51,51,0.07)", borderBottom: "1px solid rgba(255,51,51,0.25)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          <AlertTriangle size={12} color="#FF3333" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>{uploadError}</p>
          <button type="button" onClick={() => setUploadError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#FF3333", padding: 0, display: "flex" }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* 데스크톱 원본 복구 배너 (모바일 배너는 mobileProgressBarMounted 블록 내에 표시됨) */}
      {showRecoveryBanner && pendingRecovery.length > 0 && uploadPhase === "idle" && (
        <div className="prj-desktop-toolbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", background: "rgba(245,158,11,0.1)", borderBottom: `1px solid rgba(245,158,11,0.3)`, flexShrink: 0 }}>
          <AlertTriangle size={12} style={{ color: "#F59E0B", flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: "#B45309", flex: 1 }}>
            원본 업로드 미완료 {pendingRecovery.length}개 — 파일을 선택해 이어 업로드할 수 있습니다
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 420 }}>
            {pendingRecovery.slice(0, 8).map((j) => (
              <span key={j.id} style={{ fontFamily: MONO, fontSize: 9, background: "rgba(245,158,11,0.12)", color: "#B45309", padding: "1px 6px", borderRadius: 3 }}>
                {j.original_filename ?? "(파일명 없음)"}
              </span>
            ))}
            {pendingRecovery.length > 8 && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: "#B45309" }}>외 {pendingRecovery.length - 8}개</span>
            )}
          </div>
          <label style={{ cursor: "pointer" }}>
            <input
              ref={recoveryFileInputRefDesktop}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (recoveryFileInputRefDesktop.current) recoveryFileInputRefDesktop.current.value = "";
                if (files.length > 0) recoverOriginalFiles(files);
              }}
            />
            <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
              이어 업로드
            </span>
          </label>
          <button type="button" onClick={() => setShowRecoveryBanner(false)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex" }}>
            <X size={12} />
          </button>
        </div>
      )}
      {/* 데스크톱 복구 매칭 실패 배너 */}
      {unmatchedJobs.length > 0 && (
        <div className="prj-desktop-toolbar" style={{ padding: "8px 16px", background: "rgba(239,68,68,0.06)", borderBottom: `1px solid rgba(239,68,68,0.2)`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <AlertTriangle size={12} style={{ color: "#EF4444", flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: "#B91C1C", fontWeight: 600 }}>
              원본 파일을 찾지 못했습니다 ({unmatchedJobs.length}개)
            </span>
            <button type="button" onClick={() => setUnmatchedJobs([])} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex", marginLeft: "auto" }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, marginBottom: 6, lineHeight: 1.6 }}>
            파일명이 변경되었거나 다른 파일을 선택했을 수 있습니다. 원본 파일명 그대로 다시 선택해 주세요.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {unmatchedJobs.map((j) => (
              <span key={j.id} style={{ fontFamily: MONO, fontSize: 9, background: "rgba(239,68,68,0.1)", color: "#B91C1C", padding: "1px 6px", borderRadius: 3 }}>
                {j.original_filename ?? "(파일명 없음)"}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ cursor: "pointer" }}>
              <input
                ref={retryRecoveryFileInputRefDesktop}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (retryRecoveryFileInputRefDesktop.current) retryRecoveryFileInputRefDesktop.current.value = "";
                  if (files.length > 0) {
                    setPendingRecovery(unmatchedJobs);
                    setUnmatchedJobs([]);
                    recoverOriginalFiles(files);
                  }
                }}
              />
              <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                다시 파일 선택
              </span>
            </label>
            <button
              type="button"
              style={{ fontFamily: MONO, fontSize: 9, color: "#EF4444", border: "1px solid rgba(239,68,68,0.4)", background: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
              onClick={async () => {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) return;
                for (const j of unmatchedJobs) {
                  try { await abandonOriginalJob(j.id, token); } catch {}
                }
                setUnmatchedJobs([]);
                setPendingRecovery((prev) => prev.filter((p) => !unmatchedJobs.some((u) => u.id === p.id)));
              }}
            >
              원본 업로드 포기
            </button>
          </div>
        </div>
      )}

      {/* main */}
      <main style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", zIndex: 10, position: "relative" }}>

        {/* ── Right Panel ── */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>

          {/* ── 뷰 토글 툴바 ── */}
          {displayPhotos.length > 0 && (
            <div className="prj-desktop-toolbar prj-view-toolbar" style={{ height: 44, borderBottom: `1px solid ${BORDER}`, background: SURFACE_1, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED }}>{displayPhotos.length.toLocaleString()}장</span>
                {canFlushAll && (
                  <button
                    type="button"
                    onClick={() => setShowFlushAllConfirm(true)}
                    style={{ fontFamily: MONO, fontSize: 10, background: "transparent", border: "none", color: TEXT_MUTED, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "color 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#FF4757"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
                  >
                    <Trash2 size={11} />전체삭제
                  </button>
                )}
                {showSimilarityToggle && (
                  <button
                    type="button"
                    onClick={() => setSimilarityToggleOn((v) => !v)}
                    className={`prj-similarity-toggle${similarityToggleOn ? " prj-similarity-on" : ""}`}
                    style={{ color: similarityToggleOn ? ACCENT : TEXT_MUTED }}
                  >
                    <span className="prj-similarity-checkbox">
                      {similarityToggleOn && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={5}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    유사컷 대표이미지 적용
                  </button>
                )}
              </div>
              <div style={{ display: "flex", background: SURFACE_2, border: `1px solid ${BORDER}`, padding: 2, gap: 1 }}>
                {([["grid", <LayoutGrid key="g" size={13} />, "갤러리"] as const, ["list", <List key="l" size={13} />, "파일명"] as const]).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    style={{ padding: "4px 10px", background: viewMode === mode ? ACCENT_DIM : "transparent", border: "none", cursor: "pointer", color: viewMode === mode ? ACCENT : TEXT_MUTED, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: MONO, transition: "all 0.15s" }}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 모바일 툴바 (장수 + 원본포함 토글 + 전체삭제) ── */}
          {(displayPhotos.length > 0 || photoUploadAllowed) && (
            <div
              className="prj-mobile-toolbar"
              style={{
                minHeight: 40,
                borderBottom: `1px solid ${BORDER}`,
                background: SURFACE_1,
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 4,
                paddingBottom: 4,
                flexShrink: 0,
                flexWrap: "wrap",
                rowGap: 4,
              }}
            >
              {displayPhotos.length > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED }}>{displayPhotos.length.toLocaleString()}장</span>
              )}
              {canFlushAll && (
                <button
                  type="button"
                  onClick={() => setShowFlushAllConfirm(true)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    background: "transparent",
                    border: "none",
                    color: "#FF4757",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    minHeight: 36,
                    padding: "0 4px",
                  }}
                >
                  <Trash2 size={13} />
                  전체삭제
                </button>
              )}
              {showSimilarityToggle && (
                <button
                  type="button"
                  onClick={() => setSimilarityToggleOn((v) => !v)}
                  className={`prj-similarity-toggle${similarityToggleOn ? " prj-similarity-on" : ""}`}
                  style={{ color: similarityToggleOn ? ACCENT : TEXT_MUTED }}
                >
                  <span className="prj-similarity-checkbox">
                    {similarityToggleOn && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={5}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  유사컷 적용
                </button>
              )}
            </div>
          )}

          {/* ── 업로드 진행 배너 (압축·전송 단계 레이블 + 장수 카운터 + 역주행 없는 진행률) ── */}
          {isUploading && (
            <div className="prj-desktop-toolbar" style={{ flexShrink: 0, padding: "7px 16px", background: SURFACE_1, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, letterSpacing: "0.1em", minWidth: 52 }}>
                {uploadStopRequested ? "중단 중" : sendingSourcePhase ? "원본 전송" : compressingIndex >= 0 ? "압축 중" : "업로드 중"}
              </span>
              {totalUploadCount > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  사진 {pendingPhotos.length}/{totalUploadCount}
                  {project.includeOriginal && sendingSourceSnap.total > 0
                    ? ` · 원본 ${sendingSourceSnap.done}/${sendingSourceSnap.total}${sendingSourceSnap.failed > 0 ? ` · 재시도 ${sendingSourceSnap.failed}` : ""}`
                    : ""}
                </span>
              )}
              <div style={{ flex: 1, height: 2, background: "var(--border)", overflow: "hidden" }}>
                {showServerWorking ? (
                  <div style={{ width: "100%", height: "100%", background: ACCENT, animation: "prj-bar-indeterminate-pulse 1.4s ease-in-out infinite", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.35)", width: "35%", animation: "prj-bar-indet-sweep 1.1s linear infinite" }} />
                  </div>
                ) : (
                  <div style={{ width: `${overallProgress}%`, height: "100%", background: ACCENT, transition: "width 0.3s" }} />
                )}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_BRIGHT, minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {showServerWorking ? "…" : `${overallProgress}%`}
              </span>
              <button
                type="button"
                onClick={handleStopUpload}
                disabled={uploadStopRequested}
                style={{
                  flexShrink: 0, padding: "5px 9px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
                  color: TEXT_NORMAL, fontFamily: MONO, fontSize: 10,
                  cursor: uploadStopRequested ? "wait" : "pointer",
                  opacity: uploadStopRequested ? 0.55 : 1,
                }}
              >
                {uploadStopRequested ? "중단 중…" : "업로드 중단"}
              </button>
            </div>
          )}

          {/* photo grid — 가상 스크롤로 보이는 행만 마운트·이미지 로드 */}
          <div
            ref={photoScrollRef}
            className="prj-scroll prj-photo-scroll-mobile-pad"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "rgba(3,3,3,0.4)", position: "relative" }}
            onDrop={!isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDrop : undefined}
            onDragOver={!isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDragOver : undefined}
            onDragLeave={!isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDragLeave : undefined}
          >
            {dragOver && !isMobileUploadClient() && photoUploadAllowed && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none",
                background: "rgba(var(--accent-rgb), 0.10)",
                border: `2px dashed ${ACCENT}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
              }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", border: `1px solid ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Upload size={22} color={ACCENT} />
                </div>
                <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: ACCENT }}>
                  여기에 파일을 놓으세요
                </p>
              </div>
            )}
            {photosLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>불러오는 중...</span>
              </div>
            ) : displayPhotos.length === 0 && !photoUploadAllowed ? (
              <div
                onClick={undefined}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  height: "100%", gap: 16,
                  cursor: "default",
                  background: dragOver ? ACCENT_DIM : "transparent",
                  border: `2px dashed ${dragOver ? ACCENT : BORDER_MID}`,
                  margin: 24,
                  transition: "all 0.2s",
                  opacity: 0.7,
                }}
              >
                <div style={{ width: 64, height: 64, borderRadius: "50%", border: `1px solid ${dragOver ? ACCENT : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.2s" }}>
                  <Lock size={22} color="var(--subtle-foreground)" />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: dragOver ? ACCENT : "var(--muted-foreground)", marginBottom: 6 }}>
                    {project.status === "selecting" ? "고객이 사진을 선택 중입니다" : "사진을 추가할 수 없는 프로젝트입니다"}
                  </p>
                  <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--subtle-foreground)" }}>
                    고객 초대 전까지 사진을 추가할 수 있습니다
                  </p>
                </div>
              </div>
            ) : viewMode === "grid" || (displayPhotos.length === 0 && photoUploadAllowed) ? (
              <VirtualizedPhotoGrid
                scrollRef={photoScrollRef}
                photos={groupedDisplayPhotos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={project.status === "preparing"}
                minCols={isMobile ? 3 : 1}
                thumbQueue={thumbQueue}
                onPhotoClick={setLightboxIndex}
                groupsById={groupsById}
                similarityToggleOn={similarityToggleOn}
                expandedGroups={expandedGroups}
                onGroupBadgeClick={handleGroupBadgeClick}
                // 데스크톱은 워커 풀로 여러 장을 동시에 압축해 "지금 압축 중인 파일 1장" 하이라이트가
                // 더 이상 의미 없음(모바일은 풀 크기 1이라 기존과 동일하게 단일 하이라이트 유지)
                compressingTempId={isMobile && compressingIndex >= 0 && queuedPreviews[compressingIndex] ? queuedPreviews[compressingIndex].tempId : null}
                leadingUploadCell={
                  photoUploadAllowed ? (
                    <UploadTile
                      isUploading={isUploading}
                      uploadProgress={uploadProgress}
                      overallProgress={overallProgress}
                      showServerWorking={showServerWorking}
                      hasPhotos={displayPhotos.length > 0}
                      isPreparing={isPreparingFiles}
                      onClick={requestOpenFilePicker}
                    />
                  ) : undefined
                }
              />
            ) : (
              <VirtualizedPhotoList
                scrollRef={photoScrollRef}
                photos={groupedDisplayPhotos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={project.status === "preparing"}
                thumbQueue={thumbQueue}
                onPhotoClick={setLightboxIndex}
                groupsById={groupsById}
                similarityToggleOn={similarityToggleOn}
                expandedGroups={expandedGroups}
                onGroupBadgeClick={handleGroupBadgeClick}
              />
            )}
          </div>
        </section>
      </main>

      {/* ── AI 유사컷 분석 — 초대 링크 활성화와 독립된 별도 트리거 ── */}
      {canUploadOriginals(project.status) && displayPhotos.length > 0 && (
        <div
          className="prj-clip-analysis-bar"
          style={{
            flexShrink: 0,
            background: "rgba(8, 4, 2, 0.96)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT }}>
              AI 유사컷 분석
            </div>
            <div style={{ fontSize: 11, color: TEXT_MUTED }}>
              {analysisButtonState.subtitle}
            </div>
          </div>
          {clipAnalysisStatus === "processing" ? (
            <button
              type="button"
              onClick={handleCancelClipAnalysis}
              disabled={clipAnalysisTriggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid rgba(255,80,80,0.4)",
                borderRadius: 8,
                color: "rgba(255,100,100,0.9)",
                fontSize: 12, fontWeight: 500,
                cursor: clipAnalysisTriggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: clipAnalysisTriggering ? 0.6 : 1,
              }}
            >
              <X size={14} />
              분석 중단
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartClipAnalysis}
              disabled={clipAnalysisTriggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: `1px solid ${BORDER_MID}`,
                borderRadius: 8,
                color: TEXT_NORMAL,
                fontSize: 12, fontWeight: 500,
                cursor: clipAnalysisTriggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: clipAnalysisTriggering ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} />
              {analysisButtonState.buttonLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Gemini 유사컷 그룹핑 POC — 관리자 전용, OpenCLIP 분석과 완전히 독립된 실험 기능 ── */}
      {isAdminTier && canUploadOriginals(project.status) && displayPhotos.length > 0 && (
        <GeminiAnalysisPanel projectId={id} photos={photos} />
      )}

      {/* ── 고객 초대 하단 고정 바 ── */}
      <div
        className="prj-invite-bar"
        style={{
          flexShrink: 0,
          background: "rgba(8, 4, 2, 0.96)",
          borderTop: `1px solid ${isInviteActive ? "rgba(var(--accent-rgb), 0.35)" : "rgba(var(--accent-rgb), 0.2)"}`,
          backdropFilter: "blur(12px)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          zIndex: 50,
        }}
      >
        {isInviteActive ? (
          /* 활성화 후 — 초대 링크 공유 버튼 */
          <>
            <div className="prj-invite-meta" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div className="prj-invite-title" style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT }}>
                {isMobile ? "고객 초대 링크" : "고객 초대 링크가 활성화되었습니다"}
              </div>
              <div className="prj-invite-sub" style={{ fontSize: 11, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inviteUrl.replace(/^https?:\/\//, "")}
              </div>
              {project.includeOriginal && (
                <div style={{ fontSize: 11, color: TEXT_MUTED }}>납품용 원본은 고객 링크에서 파일별로 바로 다운로드할 수 있습니다.</div>
              )}
            </div>
            <button
              type="button"
              className="prj-invite-btn"
              onClick={() => setInviteShareModalOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 20px",
                background: ACCENT, border: "none", borderRadius: 8,
                color: "#000", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: MONO,
                boxShadow: `0 0 16px ${ACCENT_GLOW}`,
                transition: "all 0.2s",
              }}
            >
              <Link2 size={14} />
              {isMobile ? "링크 공유" : "초대 링크 공유"}
            </button>
          </>
        ) : (
          /* 활성화 전 — 초대 링크 활성화 버튼 */
          <>
            <div className="prj-invite-meta" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div className="prj-invite-title" style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT }}>
                {isMobile
                  ? (uploadBlockingInvite
                      ? "고객 초대"
                      : N > 0
                      ? (displayPhotos.length >= N ? `${displayPhotos.length}/${N}장 · 활성화 가능` : `${displayPhotos.length}/${N}장`)
                      : `${displayPhotos.length}장 · 셀렉 미정`)
                  : "고객 초대 준비"}
              </div>
              {(!isMobile || !uploadBlockingInvite) && (
                <div className="prj-invite-sub" style={{ fontSize: 11, color: TEXT_MUTED }}>
                  {M < N
                    ? `${displayPhotos.length}장 업로드됨 · ${N}장 이상 업로드 후 활성화 가능합니다`
                    : `${displayPhotos.length}장 업로드 완료 · 초대 링크를 활성화할 수 있습니다`}
                </div>
              )}
            </div>
            <button
              type="button"
              className="prj-invite-btn"
              onClick={handleEnableClientAccess}
              disabled={inviteActivating || uploadBlockingInvite || M < N}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "9px 20px",
                background: M >= N && !uploadBlockingInvite ? ACCENT : "rgba(var(--accent-rgb), 0.15)",
                border: "none", borderRadius: 8,
                color: M >= N && !uploadBlockingInvite ? "#000" : ACCENT,
                fontSize: 13, fontWeight: 600,
                cursor: M >= N && !inviteActivating && !uploadBlockingInvite ? "pointer" : "not-allowed",
                fontFamily: MONO,
                opacity: inviteActivating ? 0.75 : 1,
                boxShadow: M >= N && !uploadBlockingInvite ? `0 0 16px ${ACCENT_GLOW}` : "none",
                transition: "all 0.2s",
              }}
            >
              {inviteActivating
                ? (inviteOriginalsProcessing ? "원본 확인 중…" : "처리 중…")
                : uploadBlockingInvite
                  ? (isMobile ? "업로드 중" : "사진 업로드 중…")
                : M < N
                  ? "사진 업로드 필요"
                : isMobile ? "초대링크 활성화" : "고객 초대 링크 활성화"}
              {!inviteActivating && uploadBlockingInvite && (
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              )}
              {!inviteActivating && M >= N && !uploadBlockingInvite && !isMobile && <ChevronRight size={14} />}
            </button>
          </>
        )}
      </div>

      {/* ── 라이트박스 (body 포털: main z-10 < 사이드바 z-20 스택 때문에, 고정 오버레이가 사이드바에 가려지지 않게) ── */}
      {lightboxIndex !== null && groupedDisplayPhotos[lightboxIndex] && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              role="presentation"
              onClick={() => setLightboxIndex(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100_000,
                isolation: "isolate",
                background: "rgba(0,0,0,0.92)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* 닫기 */}
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  zIndex: 2,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} />
              </button>
              {/* 카운터 */}
              <div
                style={{
                  position: "absolute",
                  top: 22,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 2,
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {lightboxIndex + 1} / {groupedDisplayPhotos.length}
              </div>
              <PrevNextButton
                direction="prev"
                size="lg"
                align="edge"
                style={{ zIndex: 2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i! > 0 ? i! - 1 : groupedDisplayPhotos.length - 1));
                }}
              />
              {/* 이미지 */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "90vw", zIndex: 1 }}
              >
                <img
                  key={groupedDisplayPhotos[lightboxIndex].id}
                  src={groupedDisplayPhotos[lightboxIndex].previewUrl ?? groupedDisplayPhotos[lightboxIndex].url}
                  alt={groupedDisplayPhotos[lightboxIndex].originalFilename ?? ""}
                  decoding="async"
                  fetchPriority="high"
                  style={{ maxHeight: "80vh", maxWidth: "90vw", objectFit: "contain", borderRadius: 6, display: "block" }}
                />
                {groupedDisplayPhotos[lightboxIndex].originalFilename && (
                  <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {groupedDisplayPhotos[lightboxIndex].originalFilename}
                  </div>
                )}
              </div>
              <PrevNextButton
                direction="next"
                size="lg"
                align="edge"
                style={{ zIndex: 2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i! < groupedDisplayPhotos.length - 1 ? i! + 1 : 0));
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {/* ── 전체삭제 확인 팝업 ── */}
      {showFlushAllConfirm && (
        <div
          className="prj-modal-overlay"
          onClick={(e) => {
            if (deletingId === "__all__") return;
            if (e.target === e.currentTarget) setShowFlushAllConfirm(false);
          }}
        >
          <div className="prj-modal-box" style={{ maxWidth: 360 }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Trash2 size={14} style={{ color: "#FF4757" }} />
              <span className="prj-tech-label" style={{ color: "#FF4757" }}>전체 삭제</span>
            </div>
            <div style={{ padding: "20px 18px" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_BRIGHT, marginBottom: 16, lineHeight: 1.5 }}>
                {displayPhotos.length.toLocaleString()}장을 모두 삭제할까요?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowFlushAllConfirm(false)}
                  disabled={deletingId === "__all__"}
                  className="prj-btn-secondary"
                  style={{ flex: 1, padding: "10px 0", opacity: deletingId === "__all__" ? 0.5 : 1 }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleFlushAll}
                  disabled={deletingId === "__all__"}
                  className="prj-btn-danger"
                  style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: deletingId === "__all__" ? 0.5 : 1 }}
                >
                  <Trash2 size={12} />
                  {deletingId === "__all__" ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--surface-raised)", border: `1px solid ${BORDER_MID}`, padding: "10px 20px", zIndex: 200, fontFamily: MONO, fontSize: 11, color: TEXT_BRIGHT, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ── selecting 안내 모달 ── */}
      {showSelectingWarn && (
        <div
          className="prj-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleSelectingWarnCancel();
          }}
        >
          <div className="prj-modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, background: ACCENT }} />
              <span className="prj-tech-label" style={{ color: ACCENT }}>안내</span>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: TEXT_BRIGHT, marginBottom: 10 }}>
                원본 사진을 추가할까요?
              </p>
              <p style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.7, marginBottom: 18 }}>
                고객이 사진을 고르고 있는 단계예요. 추가된 사진은 즉시 갤러리에 반영되며 고객 화면에도 곧바로 보입니다.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSelectingWarnCancel}
                  className="prj-btn-secondary"
                  style={{ flex: 1, padding: "10px 0" }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSelectingWarnConfirm}
                  className="prj-btn-primary"
                  style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <ImagePlus size={12} />
                  추가하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 업로드 확인 모달 ── */}
      {pendingFiles.length > 0 && (() => {
        const heicCount = pendingFiles.filter(isHeicFile).length;
        const isMob = isMobileUploadClient();
        const inclOrig = project.includeOriginal;
        const estMin = estimateUploadMinutes(pendingFiles.length, inclOrig, isMob);
        const closeModal = () => setPendingFiles([]);
        return (
          <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="prj-modal-box" style={{ maxWidth: 400 }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, background: ACCENT }} />
                <span className="prj-tech-label" style={{ color: ACCENT }}>업로드 확인</span>
              </div>
              <div style={{ padding: 24 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: TEXT_BRIGHT, marginBottom: 4 }}>
                  {pendingFiles.length.toLocaleString()}장을 업로드합니다
                </p>
                {!isMob && (
                  <p style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, marginBottom: 16 }}>
                    약 {estMin}분 예상 · 네트워크 환경에 따라 다를 수 있습니다
                  </p>
                )}

                {/* 프로젝트 납품 설정 표시 */}
                {(!isMob || inclOrig) && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", marginBottom: heicCount > 0 && inclOrig ? 10 : 20,
                    border: `1px solid ${inclOrig ? "rgba(var(--accent-rgb),0.35)" : BORDER}`,
                    background: inclOrig ? ACCENT_DIM : SURFACE_1,
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: inclOrig ? ACCENT : TEXT_MUTED }}>
                      {inclOrig ? "납품용 원본 포함" : "썸네일만"}
                    </span>
                    {!isMob && <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>— 프로젝트 설정</span>}
                  </div>
                )}

                {/* HEIC 경고 */}
                {heicCount > 0 && inclOrig && (
                  <div style={{
                    display: "flex", gap: 8, alignItems: "flex-start",
                    padding: "10px 12px", background: "rgba(255,180,0,0.08)",
                    border: "1px solid rgba(255,180,0,0.3)", marginBottom: 20,
                  }}>
                    <AlertTriangle size={13} color="#FFB800" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontFamily: MONO, fontSize: 10, color: TEXT_NORMAL, lineHeight: 1.6 }}>
                      HEIC 파일 {heicCount}개는 원본 포함 불가 — 해당 파일은 썸네일만 업로드됩니다
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="prj-btn-secondary"
                    style={{ flex: 1, padding: "10px 0" }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const f = pendingFiles;
                      setPendingFiles([]);
                      startUpload(f);
                    }}
                    disabled={uploadPhase !== "idle"}
                    className="prj-btn-primary"
                    style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: uploadPhase !== "idle" ? 0.55 : 1 }}
                  >
                    <Upload size={12} />
                    업로드 시작
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PIN MODAL ── */}
      {showPinModal && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowPinModal(false); setPinInput(""); setPinError(""); } }}>
          <div className="prj-modal-box" style={{ maxWidth: 380 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 6, height: 6, background: ACCENT }} /><span className="prj-tech-label" style={{ color: ACCENT }}>{project.accessPin ? "PIN 변경" : "PIN 설정"}</span></div>
              <button type="button" onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 4 }}><X size={14} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <span style={{ ...labelStyle }}>접속 코드 (4자리)</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="text" inputMode="numeric" maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" style={{ flex: 1, padding: "10px 14px", background: SURFACE_2, border: `1px solid ${BORDER_MID}`, color: TEXT_BRIGHT, fontSize: 22, fontFamily: MONO, outline: "none", letterSpacing: 12, fontWeight: 700 }} onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }} onBlur={(e) => { e.currentTarget.style.borderColor = BORDER_MID; }} />
                <button type="button" onClick={() => setPinInput(Math.floor(1000 + Math.random() * 9000).toString())} className="prj-btn-secondary" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><RefreshCw size={11} />랜덤</button>
              </div>
              <p style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, marginBottom: 16 }}>4자리 숫자를 입력하거나 랜덤 생성 버튼을 누르세요</p>
              {pinError && <div style={{ padding: "6px 10px", background: "rgba(255,51,51,0.08)", border: "1px solid rgba(255,51,51,0.2)", marginBottom: 12 }}><span style={{ fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>[ERR] {pinError}</span></div>}
              <div style={{ display: "flex", gap: 8 }}>
                {project.accessPin && <button type="button" onClick={() => handleSavePin(null)} disabled={pinSaving} className="prj-btn-danger" style={{ padding: "10px 14px" }}>PIN 삭제</button>}
                <button type="button" onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }} disabled={pinSaving} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>취소</button>
                <button type="button" onClick={() => handleSavePin(pinInput || null)} disabled={pinSaving || (!!pinInput && pinInput.length !== 4)} className="prj-btn-primary" style={{ flex: 1, padding: "10px 0", opacity: (pinSaving || (!!pinInput && pinInput.length !== 4)) ? 0.4 : 1 }}>{pinSaving ? "저장 중..." : "저장"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CustomerInviteShareModal
        open={inviteShareModalOpen}
        onClose={() => setInviteShareModalOpen(false)}
        inviteUrl={inviteUrl}
        accessPin={project.accessPin}
        title="고객 초대 링크가 활성화되었습니다"
        description="카카오톡, 이메일 등으로 아래 링크를 보내주세요. 고객이 사진 셀렉을 시작할 수 있습니다."
      />

      {/* ── EDIT GUIDE MODAL ── */}
      {showEditGuideModal && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEditGuideModal(false); }}>
          <div className="prj-modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, background: "#2ed573" }} />
              <span className="prj-tech-label" style={{ color: "#2ed573" }}>안내</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><CheckCircle2 size={18} color="#2ed573" /><span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: TEXT_BRIGHT }}>보정을 시작하지 않았습니다</span></div>
              <p style={{ fontSize: 13, color: TEXT_NORMAL, lineHeight: 1.7, marginBottom: 24 }}>보정본을 업로드하려면 먼저 셀렉 결과를 확인하고<strong style={{ color: TEXT_BRIGHT }}> [보정 시작하기]</strong>를 눌러주세요.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowEditGuideModal(false)} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>닫기</button>
                <button type="button" onClick={() => { setShowEditGuideModal(false); router.push(`/photographer/projects/${id}/results`); }} className="prj-btn-primary" style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>셀렉 결과 보기<ChevronRight size={12} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
