"use client";

import { RecommendationMark } from "@/components/RecommendationMark";

import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Lock,
  RefreshCw,
  CheckCircle2,
  Upload,
  X,
  Loader2,
  ImagePlus,
  Sparkles,
  AlertTriangle,
  Search,
  ChevronDown,
  Check,
} from "lucide-react";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { parseBetaLimitError, DEFAULT_BETA_MAX_PHOTOS_PER_PROJECT } from "@/lib/beta-limits";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { compressImagesInParallel, type UploadSourceMetadata } from "@/lib/upload-client-compress";
import { UploadTelemetry, UPLOAD_SAMPLE_MS, describeUpload, formatUploadBytes, type UploadSnapshot, type UploadStage } from "@/lib/upload-telemetry";
import { AdaptiveUploadConcurrency, MobilePreviewPriorityGate, UploadWorkQueue, uploadDeferred, UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Project, ProjectStatus, Photo, PhotoGroupInfo } from "@/types";
import { CustomerInviteShareModal } from "@/components/photographer/CustomerInviteShareModal";
import { CustomerSelectionRequestModal } from "@/components/photographer/CustomerSelectionRequestModal";
import GeminiAnalysisPanel from "@/components/photographer/GeminiAnalysisPanel";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { OriginalPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import { PhotoAnalysisFilterGroup } from "@/components/photographer/PhotoAnalysisFilterGroup";
import { PhotoScopeSelect } from "@/components/photographer/PhotoScopeSelect";
import { PhotoSortSelect } from "@/components/photographer/PhotoSortSelect";
import {
  ProjectAssetToolbarViewToggle,
  ProjectAssetWorkspaceToolbar,
} from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import {
  PhotographerLightPageFrame,
  PhotographerLightPageHeader,
} from "@/components/layout/PhotographerLightPageHeader";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { matchesFilenameQuery } from "@/lib/gallery-filter";
import { selectPhotoRange } from "@/lib/drag-selection";
import { useQuota } from "@/contexts/QuotaContext";
import { useCollapsibleAssetHeaderController } from "@/hooks/useCollapsibleAssetHeader";
import themeStyles from "./UploadTheme.module.css";

// ---------- constants ----------
const ACCENT = "var(--accent)";
const ACCENT_DIM = "rgba(var(--accent-rgb), 0.12)";
const BORDER = "var(--border)";
const BORDER_MID = "var(--border-strong)";
const SURFACE_0 = "var(--background)";
const SURFACE_1 = "var(--surface-raised)";
const SURFACE_2 = "var(--surface)";
const TEXT_MUTED = "var(--subtle-foreground)";
const TEXT_NORMAL = "var(--muted-foreground)";
const TEXT_BRIGHT = "var(--foreground)";

// ---------- upload constants ----------
const UPLOAD_PHOTOS_PATH = "/api/photographer/upload/photos";
const UPLOAD_MAX_ATTEMPTS = 3;
const ORIGINAL_TRANSFER_MAX_RETRIES = 4;
const ORIGINAL_RETRY_BASE_DELAY_MS = 500;
const ORIGINAL_RETRY_MAX_DELAY_MS = 4_000;
const BATCH_SIZE = 8;
const PC_CONCURRENCY = 5;
// 미리보기·원본 큐가 공유하는 전체 네트워크 요청 상한.
// 일반 데스크톱은 4개, CPU·메모리·회선 힌트가 충분한 경우에만 6개까지 사용한다.
const ORIGINAL_PC_CONCURRENCY = 4;
const ORIGINAL_PC_CONCURRENCY_FAST = 6;
/* XHR은 1개로 묶여 있어(MOBILE_CONCURRENCY) 매 요청의 고정비(인증·DB 왕복)가
 * batch가 클수록 더 많은 파일에 나눠진다. 서버의 파일별 처리 세마포어가 요청당
 * 5장 동시 처리라(UPLOAD_PHOTOS_CONCURRENCY, be/app/routers/upload.py), 3장이면
 * 그 병렬 처리량의 일부만 쓰고 만다 — 5로 맞춰 요청당 서버 병렬성을 그대로 채운다. */
const MOBILE_BATCH_SIZE = 5;
const MOBILE_CONCURRENCY = 1;
const MOBILE_PREVIEWS_PER_ORIGINAL = 5;
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

/** 원본 업로드 화면은 고객 초대 링크 활성화 전(preparing)에만 편집할 수 있다. */
const UPLOADABLE_STATUSES: ReadonlyArray<ProjectStatus> = ["preparing"];
function canUploadOriginals(status: ProjectStatus): boolean {
  return UPLOADABLE_STATUSES.includes(status);
}

type PhotoSort = "filename-asc" | "uploaded-desc" | "uploaded-asc";
const LIST_HEADER_H = 48;
const LIST_ROW_H = 58;

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

function getDesktopCompressionConcurrency(): number {
  const device = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 4;
  const memoryGiB = device.deviceMemory ?? 4;
  if (cores >= 8 && memoryGiB >= 8) return 3;
  return cores >= 4 && memoryGiB >= 4 ? 2 : 1;
}

/**
 * 모바일 압축 워커 풀 — XHR 동시성(MOBILE_CONCURRENCY)과는 완전히 별개다.
 * XHR을 1개로 묶은 건 iOS WKWebView가 동시 요청 중엔 화면을 안 그려주던 버그를
 * 고치기 위해서였고(§업로드 문서, 5·6차 수정), 압축은 그 요청이 나가기 *전* 단계라
 * 여기 풀을 늘려도 그 버그와 무관하다.
 * Device Memory API는 iOS Safari가 아예 지원하지 않는다(deviceMemory === undefined) —
 * 그 경우 기존처럼 1을 유지해 안전지대를 벗어나지 않고, 지원하는 Android에서만
 * 4GiB 이상일 때 2로 올린다. */
function getMobileCompressionConcurrency(): number {
  const memoryGiB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memoryGiB !== undefined && memoryGiB >= 4 ? 2 : 1;
}

/* 500도 재시도한다. 서버의 500은 대부분 **일시적 네트워크 오류**(Supabase 조회 중 읽기 실패
 * 등)이고, `/api/upload/photos`는 `client_upload_id`로 멱등하게 설계돼 있어 같은 요청을 다시
 * 보내도 사진이 중복 생성되지 않는다(서버가 기존 id를 조회해 건너뛴다).
 *
 * ⚠️ 예전에는 원본 경로(`shouldRetryOriginalStatus`)만 500을 재시도하고 사진 경로는 하지 않았다.
 * 그래서 auth 조회 한 번이 일시적으로 실패하면 **그 사진이 그대로 유실**됐다 — 실제로 40장을
 * 올렸는데 39장만 저장된 사례를 확인했다(2026-09-12). 원본은 재시도 덕분에 전부 완료됐고
 * 사진만 1장 빠져, 비대칭적인 재시도 정책이 원인이라는 것이 드러났다. */
function shouldRetryStatus(status: number) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

/** 원본 경로도 같은 규칙을 쓴다 — 이름만 남겨 호출부를 건드리지 않는다 */
function shouldRetryOriginalStatus(status: number) {
  return shouldRetryStatus(status);
}

type XhrResult = { ok: boolean; status: number; json: () => Promise<unknown> };

type XhrTransferOpts = { onRequestBodySent?: () => void; onAttempt?: () => void; onRetry?: () => void };

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
        transferOpts?.onAttempt?.();
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
        if (attempt < UPLOAD_MAX_ATTEMPTS) { transferOpts?.onRetry?.(); await new Promise<void>((r) => setTimeout(r, 800 * attempt)); continue; }
      }
      return result;
    } catch (e) {
      if (e instanceof TypeError && crossOrigin) throw e;
      lastErr = e;
      if (attempt < UPLOAD_MAX_ATTEMPTS) { transferOpts?.onRetry?.(); await new Promise<void>((r) => setTimeout(r, 800 * attempt)); continue; }
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
      transferOpts?.onRetry?.();
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

async function reserveOriginalUpload(projectId: string, clientId: string, file: File, token: string): Promise<OriginalPresignedItem | null> {
  try {
    const inferred = /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg";
    const response = await fetch("/api/photographer/upload/originals/presign", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, client_upload_id: clientId, filename: file.name,
        content_type: file.type === "image/jpg" ? "image/jpeg" : file.type || inferred,
        file_size: file.size, last_modified: file.lastModified }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return null; // Optional optimization; /photos still enforces authorization and quotas.
    const item = await response.json();
    return item.deferred || !item.url ? null : { ...item, job_id: "" };
  } catch { return null; }
}

type OriginalRetryBudget = {
  retriesUsed: number;
  readonly maxRetries: number;
  onRetry?: () => void;
  onConfirmAttempt?: () => void;
};

function createOriginalRetryBudget(): OriginalRetryBudget {
  return { retriesUsed: 0, maxRetries: ORIGINAL_TRANSFER_MAX_RETRIES };
}

/**
 * 한 원본 파일의 PUT/confirm/후속 복구가 공유하는 유일한 재시도 예산이다.
 * 정상 첫 요청은 지연하지 않고, 실패 뒤 재호출할 때만 예산을 소비한다.
 */
async function waitForOriginalRetry(budget: OriginalRetryBudget): Promise<boolean> {
  if (budget.retriesUsed >= budget.maxRetries) return false;
  const exponentialDelay = Math.min(
    ORIGINAL_RETRY_BASE_DELAY_MS * (2 ** budget.retriesUsed),
    ORIGINAL_RETRY_MAX_DELAY_MS,
  );
  budget.retriesUsed++;
  budget.onRetry?.();
  // 여러 lane이 같은 순간 실패해도 재요청이 한꺼번에 몰리지 않게 ±25% jitter를 둔다.
  const jitteredDelay = Math.min(
    ORIGINAL_RETRY_MAX_DELAY_MS,
    Math.round(exponentialDelay * (0.75 + Math.random() * 0.5)),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, jitteredDelay));
  return true;
}

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

type UploadFailure = {
  /** 재시도에서도 같은 멱등 키를 사용해 응답 유실 뒤 중복 사진 생성을 막는다. */
  clientUploadId: string;
  file: File;
  reason: string;
};

function formatUploadFailureSummary(failures: UploadFailure[]): string {
  const names = failures.slice(0, 3).map(({ file }) => file.name).join(", ");
  const rest = failures.length > 3 ? ` 외 ${failures.length - 3}장` : "";
  const reason = failures[0]?.reason || "알 수 없는 오류";
  return `${failures.length}장 업로드 실패: ${names}${rest} — ${reason}`;
}

function UploadFailureNotice({
  message,
  failures,
  expanded,
  retryDisabled,
  onToggle,
  onRetry,
  onDismiss,
}: {
  message: string;
  failures: UploadFailure[];
  expanded: boolean;
  retryDisabled: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "8px 16px",
        background: "rgba(220,46,47,0.07)",
        borderBottom: "1px solid rgba(220,46,47,0.25)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <AlertTriangle size={13} color="var(--danger)" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, minWidth: 180, flex: 1, fontSize: 12, lineHeight: 1.5, color: "var(--danger)", wordBreak: "break-word" }}>
          {message}
        </p>
        {failures.length > 0 && (
          <>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "none", padding: "3px 5px", color: "var(--danger)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              파일 {expanded ? "접기" : "보기"}
              <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 150ms ease" }} />
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid rgba(220,46,47,0.35)", borderRadius: 5, background: "rgba(220,46,47,0.08)", padding: "4px 8px", color: "var(--danger)", fontSize: 11, fontWeight: 600, cursor: retryDisabled ? "not-allowed" : "pointer", opacity: retryDisabled ? 0.5 : 1 }}
            >
              <RefreshCw size={11} />
              실패 {failures.length}장 다시 시도
            </button>
          </>
        )}
        <button type="button" aria-label="업로드 오류 닫기" onClick={onDismiss} style={{ marginLeft: failures.length > 0 ? 0 : "auto", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 2, display: "flex" }}>
          <X size={13} />
        </button>
      </div>
      {expanded && failures.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE_1 }}>
          {failures.map(({ file, reason, clientUploadId }, index) => (
            <div
              key={clientUploadId}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 0.8fr)", gap: 12, padding: "7px 10px", borderBottom: index < failures.length - 1 ? `1px solid ${BORDER}` : "none", fontSize: 11, lineHeight: 1.45 }}
            >
              <span title={file.name} style={{ color: TEXT_BRIGHT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
              <span title={reason} style={{ color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = file.name.slice(dot).toLowerCase();
  return ext === ".heic" || ext === ".heif";
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
  retryBudget: OriginalRetryBudget = createOriginalRetryBudget(),
  observer?: { onProgress: (loaded: number) => void; onSending: () => void },
): Promise<boolean> {
  let url = presigned.url;
  let contentType = presigned.content_type;
  while (true) {
    try {
      observer?.onSending();
      const res = await new Promise<{ ok: boolean; status: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (event) => observer?.onProgress(event.loaded);
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
        xhr.onerror = () => reject(new TypeError("NetworkError"));
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        xhr.send(file);
      });
      if (res.ok) { observer?.onProgress(file.size); return true; }
      if (!shouldRetryOriginalStatus(res.status) && res.status !== 403) return false;
    } catch {
      // 응답 유실이면 객체가 이미 저장됐을 수 있으므로 아래 recover의 HEAD로 먼저 확인한다.
    }

    if (token) {
      try {
        const result = await recoverOriginalJob(presigned.job_id, token);
        if (result.status === "confirmed") { observer?.onProgress(file.size); return true; }
        url = result.url;
        contentType = result.content_type;
      } catch {
        // recover 자체가 일시 실패해도 공유 예산이 남아 있으면 기존 URL로 재시도한다.
      }
    }
    if (!await waitForOriginalRetry(retryBudget)) return false;
  }
}

async function confirmOriginalUpload(
  jobId: string,
  token: string,
  retryBudget: OriginalRetryBudget = createOriginalRetryBudget(),
): Promise<boolean> {
  const url = confirmOriginalUploadUrl();
  // R2 PUT은 성공했는데 완료 확인 요청만 일시 실패하면, 실제 원본이 있어도
  // awaiting_upload에 남아 고객 링크 준비가 영구히 멈출 수 있다. PUT과 같은 예산으로 재시도한다.
  while (true) {
    try {
      retryBudget.onConfirmAttempt?.();
      const form = new FormData();
      form.append("job_id", jobId);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) return true;
      if (!shouldRetryOriginalStatus(res.status)) return false;
    } catch {
      // 네트워크 일시 단절은 다음 재시도로 복구를 시도한다.
    }
    if (!await waitForOriginalRetry(retryBudget)) return false;
  }
}

async function fetchPendingOriginals(projectId: string, token: string): Promise<PendingOriginalItem[] | null> {
  try {
    const res = await fetch(`/api/photographer/upload/originals/pending?project_id=${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({ jobs: [] })) as { jobs: PendingOriginalItem[] };
    return body.jobs || [];
  } catch {
    return null;
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
async function confirmOrRecoverOriginalUpload(
  jobId: string,
  token: string,
  retryBudget: OriginalRetryBudget = createOriginalRetryBudget(),
): Promise<boolean> {
  if (await confirmOriginalUpload(jobId, token, retryBudget)) return true;
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

/**
 * 모바일 그리드 첫 셀 — 사진 추가 CTA.
 * 기존 prj-data-cell과 동일한 정사각 1px 보더 + paddingBottom 100% 형태를 유지하되,
 * border-style만 dashed로 두어 그리드와 톤을 통일.
 */
function UploadTile({
  isUploading,
  overallProgress,
  showServerWorking,
  hasPhotos,
  isPreparing,
  onClick,
}: {
  isUploading: boolean;
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
      aria-label={isUploading ? `업로드 중 ${overallProgress}%` : "사진 추가하기"}
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
              fontSize: 11,
              fontWeight: 500,
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

// Figma #56069: 사진이 한 장도 없을 때(preparing, 0장)의 첫 화면 — 아이콘+안내문구+파일조건+버튼을
// 담은 큰 드래그앤드롭 패널. 실제 드롭/드래그오버 처리는 이 컴포넌트를 감싸는 스크롤 컨테이너가 이미
// 담당하므로(그 컨테이너의 dragOver 오버레이가 이 패널 위에 그대로 겹쳐 뜬다), 여기서는 클릭 시
// 파일 선택창을 여는 것만 책임진다. 지원 파일 형식/최대 장수는 Figma 예시값이 아니라 실제 앱 값
// (ACCEPT_TYPES, betaMaxPhotosPerProject)을 그대로 보여준다.
function EmptyUploadPanel({ onBrowse, maxPhotos }: { onBrowse: () => void; maxPhotos: number }) {
  return (
    // Figma #56069의 content inset은 desktop 40px이다. 좁은 화면에서는 공용 page gutter에
    // 맞춰 16px로 줄이되, margin 대신 padding을 사용해 100% 높이에서 불필요한 스크롤을
    // 만들지 않는다.
    <div className={`box-border flex h-full p-4 md:p-8 ${themeStyles.emptyUpload}`}>
      <div
        className="flex min-h-[280px] flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface px-4 py-8 transition-colors hover:border-accent/40"
      >
        <div className="flex w-full max-w-[440px] flex-col items-center gap-6">
          <div className="flex w-full flex-col items-center gap-5">
            <div
              className="flex size-[72px] shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-raised text-accent"
              aria-hidden
            >
              <ImagePlus size={28} strokeWidth={1.8} />
            </div>
            <div className="w-full text-center">
              <p className="m-0 text-[20px] font-semibold leading-8 tracking-[-0.8px] text-foreground md:text-[24px] md:leading-[48px] md:tracking-[-1.47px]">
                <span className="hidden md:inline">셀렉할 원본 사진을 준비하세요</span>
                <span className="md:hidden">원본 사진을 선택하세요</span>
              </p>
              <p className="mb-3 hidden text-[14px] leading-6 text-muted-foreground md:block">사진이나 폴더를 이곳에 끌어다 놓을 수 있어요.</p>
              <p className="m-0 text-[12px] font-normal leading-[21px] text-muted-foreground">
                JPEG · PNG · WebP · HEIC · 최대 {maxPhotos.toLocaleString()}장
              </p>
            </div>
          </div>
          {/* Dashboard·Project List·Project Create와 공유하는 PhotographerLightButton —
              이 화면에서 유일하게 실행 가능한 Primary CTA. 하단의 셀렉 요청은 아직 실행할
              수 없어 Secondary(Neutral)로 유지한다(design-system-light.md §6 Action Hierarchy). */}
          <PhotographerLightButton
            type="button"
            variant="primary"
            onClick={onBrowse}
            className="h-10 w-[140px] px-5"
          >
            사진 선택하기
          </PhotographerLightButton>
        </div>
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

  const [inviteActivating, setInviteActivating] = useState(false);
  const [inviteShareModalOpen, setInviteShareModalOpen] = useState(false);
  const [selectionRequestModalOpen, setSelectionRequestModalOpen] = useState(false);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroupInfo[]>([]);
  const [similarityToggleOn, setSimilarityToggleOn] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [photoSearch, setPhotoSearch] = useState("");
  const [photoSort, setPhotoSort] = useState<PhotoSort>("filename-asc");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [recommendationSaving, setRecommendationSaving] = useState(false);
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePhotoManageMode, setMobilePhotoManageMode] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  /** 상세 뷰어의 유사컷 집중 보기. 별도 화면을 열지 않고 동일한 한 줄 filmstrip의
   *  데이터만 전체 사진 ↔ 그룹 멤버로 전환한다. */
  const [groupReviewGroupId, setGroupReviewGroupId] = useState<string | null>(null);
  const [groupReviewIndex, setGroupReviewIndex] = useState(0);
  const [groupActionPending, setGroupActionPending] = useState<"setRepresentative" | "remove" | null>(null);
  const [coverSaving, setCoverSaving] = useState(false);
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

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "originals" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadTelemetryRef = useRef<UploadTelemetry | null>(null);
  const [uploadSnapshot, setUploadSnapshot] = useState<UploadSnapshot | null>(null);
  const [uploadStopRequested, setUploadStopRequested] = useState(false);
  /** 네트워크 전송은 끝났고 서버(썸네일·저장) 응답 대기 중 — 99% 정지로 오해하지 않도록 별도 표시 */
  const [awaitingServerFinalize, setAwaitingServerFinalize] = useState(false);
  /** 원본 파일을 R2로 직접 PUT 중인 배치가 있는지 (동시 배치 카운터 기반) */
  const sendingSourceRef = useRef(0);          // 현재 진행 중인 R2 PUT 수 (카운터)
  const sendingSourceDoneRef = useRef(0);       // 완료된 R2 PUT 수
  const sendingSourceTotalRef = useRef(0);      // presigned URL 발급 수 (= 실제 시도 예정)
  const sendingSourceFailedRef = useRef(0);     // PUT/confirm까지 끝내지 못한 원본 수
  const [sendingSourcePhase, setSendingSourcePhase] = useState(false);
  /** 업로드 미완료(awaiting_upload) 원본 job — 복구 배너 표시용 */
  const recoveryFilesRef = useRef(new Map<string, File>());
  const recoveryBusyRef = useRef(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryCachedCount, setRecoveryCachedCount] = useState(0);
  const [pendingRecovery, setPendingRecovery] = useState<PendingOriginalItem[]>([]);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const recoveryFileInputRef = useRef<HTMLInputElement>(null);
  const retryRecoveryFileInputRef = useRef<HTMLInputElement>(null);
  const recoveryFileInputRefDesktop = useRef<HTMLInputElement>(null);
  const retryRecoveryFileInputRefDesktop = useRef<HTMLInputElement>(null);
  /** filename+size+lastModified 매칭 실패한 job 목록 */
  const [unmatchedJobs, setUnmatchedJobs] = useState<PendingOriginalItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFailures, setUploadFailures] = useState<UploadFailure[]>([]);
  const [showUploadFailureDetails, setShowUploadFailureDetails] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** selecting 상태에서 추가 업로드 시도 시 1회 안내 모달 */
  const [showSelectingWarn, setShowSelectingWarn] = useState(false);
  const [showFlushAllConfirm, setShowFlushAllConfirm] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<
    | { kind: "selected"; count: number }
    | { kind: "single"; photoId: string; filename: string }
    | null
  >(null);
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

  /** 품질 확인(눈감음·흐림) 상태 — 유사컷과 **완전히 독립**이다(별도 트리거·별도 폴링).
   * 하나가 실패해도 다른 하나는 계속 진행되어야 하므로 상태를 합치지 않는다. */
  const [qualityAnalysisStatus, setQualityAnalysisStatus] = useState<
    "processing" | "completed" | "failed" | null
  >(null);

  /** 업로드 완료 직후 뜨는 AI 분석 제안 모달 */
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  /** 어디서 열렸는지 — 업로드 직후와 툴바 버튼은 안내 문구가 달라야 한다(후자는 방금 올린 게 없다) */
  const [aiPromptSource, setAiPromptSource] = useState<"upload" | "manual">("upload");
  /** 눈감음·흐림 필터 — 고객 갤러리와 같은 키(`blurry`/`eyesClosed`) */
  const [qualityFilter, setQualityFilter] = useState<Set<"blurry" | "eyesClosed">>(new Set());
  const toggleQualityFilter = useCallback((key: "blurry" | "eyesClosed") => {
    setQualityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  /* 유사컷 묶기는 기본으로 켜둔다 — 업로드 완료 시 모달이 자동으로 뜨는데, 둘 다 꺼둔
   * 채로 열리면 "분석 시작" 버튼이 곧바로 비활성 상태라 뭔가 먼저 체크해야 누를 수 있는
   * 어색한 모달이 된다. 눈감음·흐림 확인은 판단 성격이 달라 기본으로 같이 돌리지 않는다. */
  const [aiWantSimilar, setAiWantSimilar] = useState(true);
  const [aiWantQuality, setAiWantQuality] = useState(false);

  /** Gemini 분석 POC — 관리자 전용 노출 여부 판단용 (실제 접근 제어는 API route에서도 재검증됨) */
  const { quota } = useQuota();
  const [isAdminTier, setIsAdminTier] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoScrollRef = useRef<HTMLDivElement>(null);
  const {
    compact: compactUploadHeader,
    immersive: immersiveUploadHeader,
    handleScroll: handlePhotoScroll,
  } = useCollapsibleAssetHeaderController({ compactOnly: true });
  const pendingOriginalCheckSeqRef = useRef(0);
  const deleteConfirmSubmittingRef = useRef(false);
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

  /* 품질 판정(눈감음·흔들림)은 `photos` 테이블이 아니라 `gemini_quality_assessments`에 있고,
   * 그 테이블은 RLS 때문에 브라우저에서 직접 못 읽는다 — 서버 라우트로 받아 사진에 얹는다.
   * `Photo`의 품질 필드는 **항상 Gemini 값으로 덮어쓴다**: 예전 OpenCLIP 컬럼이 남아 있는
   * 옛 사진(전체의 4%)과 새 사진이 서로 다른 출처로 섞여 보이면 안 된다(§photo-quality). */
  const loadPhotos = useCallback(async () => {
    try {
      const [list, qualityRes] = await Promise.all([
        getPhotosByProjectId(id),
        fetch(`/api/photographer/projects/${id}/photo-quality`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const quality: Record<string, { isBlurry: boolean | null; faceDetected: boolean | null; eyesClosed: boolean | null }> =
        qualityRes?.quality ?? {};
      setPhotos(list.map((p) => ({
        ...p,
        isBlurry: quality[p.id]?.isBlurry ?? null,
        faceDetected: quality[p.id]?.faceDetected ?? null,
        eyesClosed: quality[p.id]?.eyesClosed ?? null,
      })));
    }
    catch (error) { console.error("[upload] photo list refresh failed", error); }
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

  /* "건너뛰기"는 **이번 방문 동안만** 다시 묻지 않는다(새로고침하면 되살아난다).
   *
   * ⚠️ 처음에는 이걸 localStorage에 영구 저장했는데, 실제로 써 보니 치명적이었다:
   *  - Escape·배경 클릭도 같은 핸들러(onClose)로 연결돼 있어서 **실수로 닫기만 해도 영구 차단**됐다
   *  - 한 번 박히면 사진을 전부 지우고 다시 올려도 모달이 영영 안 떴다(실제 발생, 2026-09-12)
   *  - 특히 품질 확인은 툴바에 진입점이 없어서, 모달을 잃으면 **기능 자체에 도달할 수 없다**
   * 잔소리를 막자고 기능을 영구히 잠그는 건 균형이 맞지 않는다. 세션 한정이면 한 번 방문에서
   * 배치를 여러 번 올려도 더 묻지 않으면서, 다음에 다시 들어오면 기회가 돌아온다. */
  const aiPromptSkippedRef = useRef(false);

  /** 품질 확인 상태 조회 — 유사컷(`loadClipAnalysisStatus`)과 같은 모양의 독립 폴링 */
  const loadQualityAnalysisStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/photographer/projects/${id}/gemini-quality`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.gemini_quality_status !== undefined) setQualityAnalysisStatus(data.gemini_quality_status);
    } catch {}
  }, [id]);

  useEffect(() => {
    const recoveryMode = new URLSearchParams(window.location.search).get("recover") === "1";
    loadProject().then((loadedProject) => {
      if (!loadedProject) return;
      if (loadedProject.status !== "preparing" && !(recoveryMode && loadedProject.includeOriginal)) {
        router.replace(`/photographer/projects/${id}/assets/original`);
        return;
      }
      loadPhotos();
      loadPhotoGroups();
    });
  }, [id, loadProject, loadPhotos, loadPhotoGroups, router]);

  /** 마운트/재진입 시 로컬 분석 상태를 서버 상태로 시드 — processing이면 아래 폴링 이펙트가 자동 재개된다.
   *  품질도 같이 시드해야 새로고침 후에도 진행 중 표시와 완료 시 배지 갱신이 이어진다. */
  useEffect(() => {
    loadClipAnalysisStatus();
    loadQualityAnalysisStatus();
  }, [loadClipAnalysisStatus, loadQualityAnalysisStatus]);

  /** Gemini 분석 POC 노출 여부 — 관리자 등급만 (실 요금이 발생하는 실험 기능이라 접근 범위를 제한) */
  useEffect(() => {
    if (quota?.tier === "admin") setIsAdminTier(true);
  }, [quota]);

  const overallProgress = uploadSnapshot?.percent ?? uploadProgress;
  const isPreviewUploading = uploadPhase === "sending" || uploadPhase === "processing";
  const isOriginalUploading = uploadPhase === "originals";
  const isUploading = isPreviewUploading || isOriginalUploading;

  useEffect(() => {
    if (!isUploading) return;
    const sample = () => {
      const tracker = uploadTelemetryRef.current;
      if (tracker) setUploadSnapshot(tracker.snapshot());
    };
    const timer = window.setInterval(sample, UPLOAD_SAMPLE_MS);
    return () => {
      window.clearInterval(timer);
      const tracker = uploadTelemetryRef.current;
      if (tracker) {
        tracker.finish("interrupted"); // Preserves an outcome explicitly set by the upload flow.
        const report = tracker.report();
        console.info("[upload-performance]", report);
        window.dispatchEvent(new CustomEvent("acut:upload-performance", { detail: report }));
        uploadTelemetryRef.current = null;
      }
    };
  }, [isUploading]);

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

  /* 두 분석 중 하나라도 돌고 있으면 버튼은 "진행 중 · 누르면 중단"이 된다 — 유사컷과 품질이
   * 따로 도는데 버튼이 하나뿐이라, 무엇이 도는지가 아니라 **지금 AI가 일하는 중인지**를 말한다. */
  const aiBusy = clipAnalysisStatus === "processing" || qualityAnalysisStatus === "processing";
  const aiControlLabel = aiBusy
    ? (clipAnalysisStatus === "processing" && qualityAnalysisStatus === "processing"
        ? "AI 분석 중"
        : clipAnalysisStatus === "processing" ? "유사컷 분석 중" : "품질 확인 중")
    : "AI 분석";

  /** 툴바 AI 버튼으로 열 때 — 업로드 직후와 달리 **이미 끝난 항목은 꺼 둔 채** 연다.
   *  다시 눌러도 캐시 때문에 비용은 안 들지만, 켜져 있으면 "또 돌리는 건가?"를 고민하게 된다. */
  const openAiPromptManually = () => {
    const similarDone = clipAnalysisStatus === "completed" && (clipPending?.pending ?? 0) === 0;
    setAiWantSimilar(!similarDone);
    setAiWantQuality(qualityAnalysisStatus !== "completed");
    setAiPromptSource("manual");
    setAiPromptOpen(true);
  };

  /** 진행 중인 것만 골라 중단한다 — 한쪽만 돌고 있을 수 있다 */
  const handleCancelAiAnalysis = () => {
    if (clipAnalysisStatus === "processing") void handleCancelClipAnalysis();
    if (qualityAnalysisStatus === "processing") {
      void fetch(`/api/photographer/projects/${id}/gemini-quality`, { method: "DELETE" })
        .then(() => loadQualityAnalysisStatus())
        .catch(() => {});
    }
  };

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

  /* AI가 찾은 것으로 좁혀 보는 필터. 켜진 조건 중 **하나라도** 해당하면 남긴다(OR) —
   * 고객 갤러리(`gallery-filter.ts`)와 같은 규칙·같은 키 이름을 쓴다. */
  const qualityCounts = useMemo(() => ({
    blurry: photos.filter((p) => p.isBlurry === true).length,
    eyesClosed: photos.filter((p) => p.faceDetected === true && p.eyesClosed === true).length,
  }), [photos]);

  const recommendedPhotoIds = useMemo(
    () => new Set(photos.filter((photo) => photo.photographerRecommended).map((photo) => photo.id)),
    [photos],
  );

  const saveRecommendations = useCallback(async (nextIds: Set<string>, successMessage: string, clearSelection = false) => {
    if (recommendationSaving) return;
    setRecommendationSaving(true);
    try {
      const response = await fetch(`/api/photographer/projects/${id}/recommendations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_ids: [...nextIds] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "추천 저장에 실패했습니다.");
      setPhotos((current) => current.map((photo) => ({
        ...photo,
        photographerRecommended: nextIds.has(photo.id),
      })));
      if (clearSelection) {
        setSelectedPhotoIds(new Set());
        setMobilePhotoManageMode(false);
      }
      setToast(successMessage);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "추천 저장에 실패했습니다.");
    } finally {
      setRecommendationSaving(false);
    }
  }, [id, recommendationSaving]);

  const galleryPhotos = useMemo(() => {
    const sourcePhotos = showRecommendedOnly ? displayPhotos : groupedDisplayPhotos;
    const searched = photoSearch.trim()
      ? sourcePhotos.filter((photo) => matchesFilenameQuery(photo.originalFilename ?? "", photoSearch))
      : sourcePhotos;
    const recommendationFiltered = showRecommendedOnly ? searched.filter(photo => recommendedPhotoIds.has(photo.id)) : searched;
    const filtered = qualityFilter.size === 0
      ? recommendationFiltered
      : recommendationFiltered.filter((photo) =>
          (qualityFilter.has("blurry") && photo.isBlurry === true) ||
          (qualityFilter.has("eyesClosed") && photo.faceDetected === true && photo.eyesClosed === true));
    return [...filtered].sort((a, b) => {
      if (photoSort === "uploaded-desc" || photoSort === "uploaded-asc") {
        const aTime = Date.parse(a.createdAt ?? "") || 0;
        const bTime = Date.parse(b.createdAt ?? "") || 0;
        if (aTime !== bTime) {
          if (!aTime) return 1;
          if (!bTime) return -1;
          return photoSort === "uploaded-desc" ? bTime - aTime : aTime - bTime;
        }
      }
      return (a.originalFilename ?? "").localeCompare(
        b.originalFilename ?? "",
        undefined,
        { numeric: true, sensitivity: "base" },
      );
    });
  }, [displayPhotos, groupedDisplayPhotos, photoSearch, photoSort, qualityFilter, showRecommendedOnly, recommendedPhotoIds]);

  /** 상세 뷰어의 전체 filmstrip에서는 그룹마다 대표 썸네일 하나만 남긴다.
   * 검색/정렬 결과에 대표컷이 없으면 현재 결과의 첫 멤버를 대신 사용해 검색 맥락을 보존한다. */
  const viewerOverviewPhotos = useMemo(() => {
    const visibleById = new Map(galleryPhotos.map((photo) => [photo.id, photo]));
    const seenGroups = new Set<string>();
    const result: Photo[] = [];

    for (const photo of galleryPhotos) {
      const groupId = photo.similarityGroupId;
      const group = groupId ? groupsById.get(groupId) : undefined;
      if (!groupId || !group || group.photoCount < 2) {
        result.push(photo);
        continue;
      }
      if (seenGroups.has(groupId)) continue;
      seenGroups.add(groupId);
      result.push(visibleById.get(group.representativePhotoId) ?? photo);
    }
    return result;
  }, [galleryPhotos, groupsById]);

  /** ── 상세 뷰어 유사컷 집중 보기 파생값 ── */
  const inGroupReview = groupReviewGroupId !== null;
  const isPhotoViewerOpen = lightboxIndex !== null || inGroupReview;
  const groupReviewGroup = groupReviewGroupId ? groupsById.get(groupReviewGroupId) : undefined;
  const groupReviewMembers = useMemo(
    () => (groupReviewGroupId ? membersByGroup.get(groupReviewGroupId) ?? [] : []),
    [groupReviewGroupId, membersByGroup],
  );
  const activePhoto = inGroupReview
    ? groupReviewMembers[groupReviewIndex] ?? null
    : (lightboxIndex !== null ? viewerOverviewPhotos[lightboxIndex] ?? null : null);
  const activeOverviewGroup = !inGroupReview && activePhoto?.similarityGroupId
    ? groupsById.get(activePhoto.similarityGroupId)
    : undefined;
  const canEnterActiveGroup = !!activeOverviewGroup
    && (membersByGroup.get(activeOverviewGroup.id)?.length ?? activeOverviewGroup.photoCount) > 1;

  /** 리뷰 도중 그룹이 2명 미만으로 줄거나 해체되면 집중 보기를 종료한다. */
  useEffect(() => {
    if (!groupReviewGroupId) return;
    if (!groupReviewGroup || groupReviewMembers.length < 2) { setGroupReviewGroupId(null); return; }
    setGroupReviewIndex((i) => Math.min(i, groupReviewMembers.length - 1));
  }, [groupReviewGroupId, groupReviewGroup, groupReviewMembers.length]);

  const handleEnterGroupReview = useCallback((photo?: Photo) => {
    const targetPhoto = photo ?? activePhoto;
    if (!targetPhoto?.similarityGroupId || !groupsById.has(targetPhoto.similarityGroupId)) return;
    const groupId = targetPhoto.similarityGroupId;
    const members = membersByGroup.get(groupId) ?? [];
    const idx = members.findIndex((member) => member.id === targetPhoto.id);
    if (idx < 0) return;
    setGroupReviewGroupId(groupId);
    setGroupReviewIndex(idx);
  }, [activePhoto, groupsById, membersByGroup]);

  /** 그룹 해체/검색 변경으로 전체 strip이 줄어도 현재 인덱스를 유효 범위에 둔다. */
  useEffect(() => {
    if (lightboxIndex === null || viewerOverviewPhotos.length === 0) return;
    if (lightboxIndex >= viewerOverviewPhotos.length) setLightboxIndex(viewerOverviewPhotos.length - 1);
  }, [lightboxIndex, viewerOverviewPhotos.length]);

  const handleExitGroupReview = useCallback(() => setGroupReviewGroupId(null), []);

  /** Grid/List의 실제 사진을 연다. 그룹 멤버라면 중간 CTA 없이 바로 같은 viewer의
   * 유사컷 집중 보기로 진입하고, 전체 보기 복귀 위치는 해당 그룹 대표 썸네일로 맞춘다. */
  const handleOpenPhotoViewer = useCallback((galleryIndex: number) => {
    const photo = galleryPhotos[galleryIndex];
    if (!photo) return;
    const overviewIndex = viewerOverviewPhotos.findIndex((candidate) =>
      photo.similarityGroupId
        ? candidate.similarityGroupId === photo.similarityGroupId
        : candidate.id === photo.id,
    );
    setLightboxIndex(Math.max(overviewIndex, 0));

    const group = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
    const members = photo.similarityGroupId ? membersByGroup.get(photo.similarityGroupId) ?? [] : [];
    if (group && members.length > 1) {
      setGroupReviewGroupId(group.id);
      setGroupReviewIndex(Math.max(members.findIndex((member) => member.id === photo.id), 0));
    } else {
      setGroupReviewGroupId(null);
    }
  }, [galleryPhotos, viewerOverviewPhotos, groupsById, membersByGroup]);

  /** 라이트박스를 완전히 닫는다 — 그룹 리뷰 모드 중이었다면 그것도 함께 초기화해야 한다.
   *  lightboxIndex만 null로 바꾸면 groupReviewGroupId가 남아있어 포털 렌더 조건
   *  (lightboxIndex !== null || inGroupReview)이 여전히 참이 되어 X/배경 클릭이 안 먹는 버그가 있었다. */
  const handleCloseLightbox = useCallback(() => {
    setLightboxIndex(null);
    setGroupReviewGroupId(null);
  }, []);

  const handleGroupReviewPrev = useCallback(() => {
    setGroupReviewIndex((i) => (i > 0 ? i - 1 : groupReviewMembers.length - 1));
  }, [groupReviewMembers.length]);

  const handleGroupReviewNext = useCallback(() => {
    setGroupReviewIndex((i) => (i < groupReviewMembers.length - 1 ? i + 1 : 0));
  }, [groupReviewMembers.length]);

  const handleSetRepresentative = useCallback(async (photoId: string, groupId: string) => {
    setGroupActionPending("setRepresentative");
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photo-groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, representativePhotoId: photoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "대표 사진 설정에 실패했습니다.");
      const photoGroup = (data as { photoGroup?: PhotoGroupInfo }).photoGroup;
      if (photoGroup) setPhotoGroups((prev) => prev.map((g) => (g.id === groupId ? photoGroup : g)));
      setToast("대표 사진으로 설정했습니다.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "대표 사진 설정에 실패했습니다.");
    } finally {
      setGroupActionPending(null);
    }
  }, [id]);

  const handleSaveEntryCover = useCallback(async (photoId: string) => {
    setCoverSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_photo_id: photoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "진입 대표 사진을 저장하지 못했습니다.");
      setProject((current) => current ? { ...current, coverPhotoId: photoId } : current);
      setToast("고객 진입 대표 사진을 저장했습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "진입 대표 사진을 저장하지 못했습니다.");
    } finally {
      setCoverSaving(false);
    }
  }, [id]);

  const handleRemoveFromGroup = useCallback(async (photoId: string) => {
    setGroupActionPending("remove");
    try {
      const res = await fetch(`/api/photographer/photos/${photoId}/group`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "그룹에서 제외하지 못했습니다.");

      setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, similarityGroupId: null } : p)));

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
      setToast("묶음에서 제외했습니다.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "그룹에서 제외하지 못했습니다.");
    } finally {
      setGroupActionPending(null);
    }
  }, []);

  const selectableGalleryIds = useMemo(
    () => galleryPhotos.filter((photo) => !photo.isPending).map((photo) => photo.id),
    [galleryPhotos],
  );
  const selectionAnchorRef = useRef<string | null>(null);
  const togglePhotoSelected = useCallback((photoId: string, options?: { range?: boolean }) => {
    setSelectedPhotoIds((current) => {
      if (options?.range && selectionAnchorRef.current) {
        return selectPhotoRange(selectableGalleryIds, selectionAnchorRef.current, photoId, current);
      }
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      selectionAnchorRef.current = photoId;
      return next;
    });
    if (isMobile && mobilePhotoManageMode && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  }, [isMobile, mobilePhotoManageMode, selectableGalleryIds]);

  const enterMobilePhotoManageMode = useCallback((photoId?: string) => {
    setMobilePhotoManageMode(true);
    setSelectedPhotoIds((current) => {
      if (!photoId || current.has(photoId)) return current;
      const next = new Set(current);
      next.add(photoId);
      return next;
    });
    if (photoId && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  const exitMobilePhotoManageMode = useCallback(() => {
    setMobilePhotoManageMode(false);
    setSelectedPhotoIds(new Set());
  }, []);

  useEffect(() => {
    if (isMobile || isUploading || deletingId || project?.status !== "preparing") return;
    const handleSelectAllShortcut = (event: KeyboardEvent) => {
      if (!hasShortcutModifier(event) || event.key.toLowerCase() !== "a" || (!event.metaKey && !event.ctrlKey) || event.altKey
        || !photoScrollRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      setSelectedPhotoIds(new Set(selectableGalleryIds));
    };
    window.addEventListener("keydown", handleSelectAllShortcut);
    return () => window.removeEventListener("keydown", handleSelectAllShortcut);
  }, [deletingId, isMobile, isUploading, project?.status, selectableGalleryIds]);

  useEffect(() => {
    const existingIds = new Set(photos.map((photo) => photo.id));
    setSelectedPhotoIds((current) => {
      const next = new Set([...current].filter((photoId) => existingIds.has(photoId)));
      const unchanged = next.size === current.size && [...next].every((photoId) => current.has(photoId));
      return unchanged ? current : next;
    });
  }, [photos]);

  const viewerFilmstripPhotos = inGroupReview ? groupReviewMembers : viewerOverviewPhotos;
  const viewerFilmstripIndex = inGroupReview ? groupReviewIndex : lightboxIndex;

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

  /** 품질 확인 폴링 — 유사컷과 같은 주기, 서로 독립이라 한쪽이 끝나도 다른 쪽은 계속 돈다 */
  useEffect(() => {
    if (qualityAnalysisStatus !== "processing") return;
    const t = setInterval(() => { void loadQualityAnalysisStatus(); }, 4000);
    return () => clearInterval(t);
  }, [qualityAnalysisStatus, loadQualityAnalysisStatus]);

  /** 품질 확인이 끝나면 사진을 다시 불러온다 — 눈감음·흐림 배지는 `Photo`에 실려 오므로
   *  다시 읽지 않으면 분석이 끝나도 화면에 아무 변화가 없다. */
  const prevQualityStatusRef = useRef(qualityAnalysisStatus);
  useEffect(() => {
    const prev = prevQualityStatusRef.current;
    prevQualityStatusRef.current = qualityAnalysisStatus;
    if (prev === "processing" && qualityAnalysisStatus === "completed") loadPhotos();
  }, [qualityAnalysisStatus, loadPhotos]);


  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isMobile || photosLoading || project?.status !== "preparing" || displayPhotos.length === 0) return;
    const storageKey = "acut:mobile-original-photo-management-tip:v1";
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, "seen");
      setToast("사진을 길게 눌러 추천하거나 삭제할 수 있어요.");
    } catch {
      // 사생활 보호 모드처럼 localStorage를 사용할 수 없는 환경에서는 안내 없이 계속 진행한다.
    }
  }, [displayPhotos.length, isMobile, photosLoading, project?.status]);

  /** 모바일 헤더 아래 진행 라인: 업로드 종료 후 200ms 페이드아웃 */
  const [mobileProgressBarMounted, setMobileProgressBarMounted] = useState(false);
  useEffect(() => {
    const active = isMobile && (isUploading || !!uploadError || showRecoveryBanner || recoveryBusy);
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
  }, [isMobile, isUploading, uploadError, showRecoveryBanner, recoveryBusy]);

  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUploading]);

  // iOS에서 업로드 중 앱 전환/화면 잠금 감지 → 복귀 시 경고
  useEffect(() => {
    if (!isUploading || !isMobileUploadClient()) return;
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
  }, [isUploading]);

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
    const checkSequence = ++pendingOriginalCheckSeqRef.current;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    let jobs = await fetchPendingOriginals(id, token);
    if (jobs === null || checkSequence !== pendingOriginalCheckSeqRef.current) return;
    if (jobs.length > 0 && await autoConfirmUploadedOriginals(jobs, token)) {
      jobs = await fetchPendingOriginals(id, token);
    }
    if (jobs === null || checkSequence !== pendingOriginalCheckSeqRef.current) return;
    const pendingIds = new Set(jobs.map(job => job.id));
    for (const jobId of recoveryFilesRef.current.keys()) if (!pendingIds.has(jobId)) recoveryFilesRef.current.delete(jobId);
    setRecoveryCachedCount(recoveryFilesRef.current.size);
    if (jobs.length > 0) {
      setPendingRecovery(jobs);
      setShowRecoveryBanner(true);
    } else {
      // 자동 HEAD 복구 또는 정상 confirm으로 0건이 됐을 때 과거 배너 상태를 반드시 제거한다.
      setPendingRecovery([]);
      setUnmatchedJobs([]);
      setShowRecoveryBanner(false);
      if (new URLSearchParams(window.location.search).get("recover") === "1") {
        router.replace(`/photographer/projects/${id}/assets/original`);
      }
    }
  }, [id, router]);

  // ── upload ──
  const startUpload = useCallback(async (uploadFiles: File[], retryClientUploadIds?: string[]) => {
    if (!uploadFiles.length || uploadInProgressRef.current) return;
    uploadInProgressRef.current = true;
    const inclOrig = project?.includeOriginal ?? false;
    const telemetry = new UploadTelemetry(uploadFiles.map(file => file.size), inclOrig, isMobileUploadClient() ? "mobile" : "pc");
    uploadTelemetryRef.current = telemetry;
    setUploadSnapshot(telemetry.snapshot());
    setUploadError(null);
    setUploadFailures([]);
    setShowUploadFailureDetails(false);
    setAwaitingServerFinalize(false);
    sendingSourceDoneRef.current = 0;
    sendingSourceTotalRef.current = 0;
    sendingSourceFailedRef.current = 0;
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
    if (userError || !user) { telemetry.finish("incomplete"); setUploadError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); uploadInProgressRef.current = false; return; }
    if (!token) { telemetry.finish("incomplete"); setUploadError("로그인이 필요합니다."); setUploadPhase("idle"); uploadInProgressRef.current = false; return; }

    let currentToken = token;
    const totalFiles = uploadFiles.length;
    // 같은 파일 전송의 XHR 재시도와 direct API -> Next proxy fallback 전체에서 재사용한다.
    // 서버 UNIQUE(project_id, client_upload_id)가 응답 유실 후 중복 photo/job 생성을 막는다.
    const clientUploadIds = uploadFiles.map((_, index) => retryClientUploadIds?.[index] ?? createClientUploadId());

    // Compression producer + bounded preview channel; originals have their own FIFO queue.
    // Original-inclusive previews stay one file per request so reservations/jobs are unambiguous.
    // PC dedicates up to two preview lanes; all queues share the existing network cap.
    // Mobile keeps one network request at a time while raw PUT can overlap local compression.
    const mobileUploadClient = isMobileUploadClient();
    const effectiveBatch = inclOrig ? 1 : (mobileUploadClient ? MOBILE_BATCH_SIZE : BATCH_SIZE);
    const concurrency = inclOrig
      ? (mobileUploadClient ? 1 : getDesktopUploadConcurrency(true))
      : (mobileUploadClient ? MOBILE_CONCURRENCY : getDesktopUploadConcurrency(false));
    const requestSlots = new UploadWorkQueue(concurrency);
    const originalConcurrencyMax = mobileUploadClient ? 1 : Math.max(1, concurrency - 1);
    // 프리뷰가 모두 등록되기 전에는 원본 lane 하나만 열어 고객 링크 준비 시간을 우선한다.
    // 이후에는 기존 적응형 상한 안에서 원본 처리량을 다시 높인다.
    const originalConcurrencyInitial = 1;
    const originalConcurrencyAfterPreviews = mobileUploadClient ? 1 : Math.min(2, originalConcurrencyMax);
    const originalQueue = new UploadWorkQueue(originalConcurrencyInitial);
    const mobilePreviewPriority = inclOrig && mobileUploadClient
      ? new MobilePreviewPriorityGate(MOBILE_PREVIEWS_PER_ORIGINAL)
      : null;
    let adaptiveOriginalConcurrency: AdaptiveUploadConcurrency | null = null;
    const previewConcurrency = inclOrig ? Math.min(2, concurrency) : concurrency;
    const reservationPromises = new Map<number, Promise<OriginalPresignedItem | null>>();
    const originalResults = uploadFiles.map(() => uploadDeferred<{ job: OriginalPresignedItem; token: string } | null>());
    const originalTasks: Promise<void>[] = [];
    const totalBatches = Math.ceil(totalFiles / effectiveBatch);
    const rawBatches: File[][] = Array.from({ length: totalBatches }, (_, i) =>
      uploadFiles.slice(i * effectiveBatch, Math.min((i + 1) * effectiveBatch, totalFiles))
    );

    const batchStage = (index: number, stage: UploadStage) => {
      for (let i = index * effectiveBatch; i < Math.min((index + 1) * effectiveBatch, totalFiles); i++) telemetry.stage(i, stage);
    };
    const applyProgress = (index: number, loaded: number, total: number) => {
      if (inclOrig || total <= 0) return;
      // Selection-only sessions use source-size weights with measured compressed-body fractions.
      for (let i = index * effectiveBatch; i < Math.min((index + 1) * effectiveBatch, totalFiles); i++) {
        telemetry.progress(i, uploadFiles[i].size * Math.min(1, loaded / total));
      }
    };

    const failureBySourceIndex = new Map<number, UploadFailure>();
    const settledSourceIndexes = new Set<number>();
    const recordBatchFailure = (batchIndex: number, reason: string) => {
      const start = batchIndex * effectiveBatch;
      const end = Math.min(start + effectiveBatch, uploadFiles.length);
      for (let sourceIndex = start; sourceIndex < end; sourceIndex++) {
        telemetry.stage(sourceIndex, "failed");
        settledSourceIndexes.add(sourceIndex);
        failureBySourceIndex.set(sourceIndex, {
          clientUploadId: clientUploadIds[sourceIndex],
          file: uploadFiles[sourceIndex],
          reason,
        });
      }
    };
    const listFailuresInSelectionOrder = () => Array.from(failureBySourceIndex.entries())
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .map(([, failure]) => failure);
    const collectUnsettledFailures = (reason: string): UploadFailure[] => {
      for (let sourceIndex = 0; sourceIndex < uploadFiles.length; sourceIndex++) {
        if (settledSourceIndexes.has(sourceIndex)) continue;
        failureBySourceIndex.set(sourceIndex, {
          clientUploadId: clientUploadIds[sourceIndex],
          file: uploadFiles[sourceIndex],
          reason,
        });
      }
      return listFailuresInSelectionOrder();
    };
    const backendRejected: string[] = []; // BUG-01: 서버에서 거부된 파일명 (CR3 등 미지원 형식)
    const failedOriginalJobIds = new Set<string>();

    // "compressSetup": pipelineMode 전용 — 압축 자체가 시작 불가한 예외(워커/canvas 폴백 모두 실패).
    // legacy 경로는 이 값을 쓰지 않고 기존과 동일하게 즉시 return한다(§아래 legacy 분기).
    let abortReason: "betaLimit" | "network" | "auth" | "compressSetup" | null = null;
    let abortMessage = "";
    // BUG-04: PC도 30배치(약 240장)마다 토큰 갱신 (대용량 업로드 중 만료 방지)
    const refreshInterval = mobileUploadClient ? 20 : 30;

    const putOriginalMeasured = async (
      presigned: OriginalPresignedItem,
      file: File,
      uploadToken: string | undefined,
      retryBudget: OriginalRetryBudget,
      observer: { onProgress: (loaded: number) => void; onSending: () => void },
    ) => {
      const startedAt = performance.now();
      let succeeded = false;
      try {
        succeeded = await putOriginalToR2(presigned, file, uploadToken, retryBudget, observer);
        return succeeded;
      } finally {
        adaptiveOriginalConcurrency?.record(file.size, performance.now() - startedAt, succeeded);
        if (adaptiveOriginalConcurrency) telemetry.setOriginalConcurrency(adaptiveOriginalConcurrency.report());
      }
    };

    const startOriginalTask = (index: number) => {
      if (!inclOrig || reservationPromises.has(index)) return;
      const file = uploadFiles[index];
      const reservation = requestSlots.run(() => stopRequestedRef.current || abortReason
        ? Promise.resolve(null) : reserveOriginalUpload(id, clientUploadIds[index], file, currentToken));
      reservationPromises.set(index, reservation);
      const task = originalQueue.run(async () => {
        const early = await reservation;
        // Only the first PUT may precede photo/job creation. Subsequent attempts use the
        // established job recover/confirm path and its single shared retry budget.
        let earlyOk: boolean | null = null;
        const budget = createOriginalRetryBudget();
        budget.onRetry = () => telemetry.originalStage(index, "retrying");
        budget.onConfirmAttempt = () => telemetry.originalStage(index, "confirming");
        const observer = {
          onSending: () => telemetry.originalStage(index, "originalSending"),
          onProgress: (loaded: number) => telemetry.progress(index, loaded),
        };
        // 모바일은 공유 네트워크 슬롯이 하나라 early PUT이 프리뷰 요청을 막는다.
        // 예약은 유지하되 photo/job 등록 뒤에 같은 원본을 전송한다.
        if (!mobileUploadClient && early && Date.parse(early.expires_at) > Date.now() + 30_000 && !stopRequestedRef.current && !abortReason) {
          earlyOk = await requestSlots.run(() => putOriginalMeasured(early, file, undefined, { retriesUsed: 0, maxRetries: 0 }, observer));
          telemetry.originalStage(index, null);
        }
        const registered = await originalResults[index].promise;
        if (!registered) { telemetry.originalStage(index, null); return; }
        await mobilePreviewPriority?.waitForOriginal();
        const { job } = registered;
        let jobToken = registered.token;
        if (stopRequestedRef.current && earlyOk !== true) {
          telemetry.stage(index, "failed");
          recoveryFilesRef.current.set(job.job_id, file);
          setRecoveryCachedCount(recoveryFilesRef.current.size);
          return;
        }
        sendingSourceTotalRef.current++;
        sendingSourceRef.current++;
        setSendingSourcePhase(true);
        try {
          // A long original backlog may outlive the token used by its preview request.
          const { data: { session: latestSession } } = await supabase.auth.getSession();
          jobToken = latestSession?.access_token ?? jobToken;
          let putOk = earlyOk === true && early?.source_key === job.source_key;
          if (!putOk) {
            // Recover first: an early PUT can succeed even if its response was lost.
            const recovered = await requestSlots.run(() => recoverOriginalJob(job.job_id, jobToken).catch(() => null));
            if (recovered?.status === "confirmed") putOk = true;
            else {
              if (earlyOk !== null && !await waitForOriginalRetry(budget)) throw new Error("원본 재시도 한도 초과");
              const target = recovered?.status === "needs_upload" ? { ...job, ...recovered } : job;
              putOk = await requestSlots.run(() => putOriginalMeasured(target, file, jobToken, budget, observer));
            }
          }
          telemetry.originalStage(index, "confirming");
          const confirmed = putOk && await requestSlots.run(() => confirmOrRecoverOriginalUpload(job.job_id, jobToken, budget));
          telemetry.originalStage(index, null);
          telemetry.stage(index, confirmed ? "completed" : "failed");
          if (!confirmed) {
            failedOriginalJobIds.add(job.job_id);
            recoveryFilesRef.current.set(job.job_id, file);
            setRecoveryCachedCount(recoveryFilesRef.current.size);
            sendingSourceFailedRef.current++;
          } else recoveryFilesRef.current.delete(job.job_id);
        } catch {
          telemetry.originalStage(index, null);
          telemetry.stage(index, "failed");
          failedOriginalJobIds.add(job.job_id);
          recoveryFilesRef.current.set(job.job_id, file);
          setRecoveryCachedCount(recoveryFilesRef.current.size);
          sendingSourceFailedRef.current++;
        } finally {
          sendingSourceRef.current--;
          sendingSourceDoneRef.current++;
          if (sendingSourceRef.current <= 0) setSendingSourcePhase(false);
        }
      });
      originalTasks.push(task);
    };

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
    const uploadOneBatch = async (
      batch: File[],
      batchIndex: number,
      sourceMetadata: UploadSourceMetadata[] = [],
    ) => {
      // 카드 식별자·위치는 queued 단계에서 만든 값을 인계하되, 표시 이미지는 압축본으로 바꾼다.
      // 원본 blob은 고해상도/HEIC일 수 있어 브라우저가 해독하는 동안 카드가 검게 보일 수 있다.
      const earlyReservation = inclOrig ? await reservationPromises.get(batchIndex) : null;
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
          if (earlyReservation) f.append("early_original_upload", "true");
          batch.forEach((file, fileIndex) => {
            const sourceIndex = batchIndex * effectiveBatch + fileIndex;
            const sourceFile = uploadFiles[sourceIndex] ?? file;
            const sourceInfo = sourceMetadata[fileIndex];
            f.append("files", file);
            f.append("client_upload_ids", clientUploadIds[sourceIndex]);
            // 원본 납품 여부와 무관하게 목록용 원본 메타데이터는 항상 보존한다.
            // width/height=0은 기존 압축 단계에서 치수를 얻지 못한 경우이며,
            // 서버가 썸네일 생성 시 이미 디코딩한 입력 치수로 채운다.
            f.append("original_filenames", sourceFile.name);
            f.append("original_file_sizes", String(sourceFile.size));
            f.append("original_last_modifieds", String(sourceFile.lastModified));
            f.append("original_content_types", sourceFile.type === "image/jpg" ? "image/jpeg" : sourceFile.type || "");
            f.append("source_widths", String(sourceInfo?.width ?? 0));
            f.append("source_heights", String(sourceInfo?.height ?? 0));
          });
          return f;
        };
        try {
          let res = await requestSlots.run(() => postPhotosUpload(
            buildForm,
            currentToken,
            useProxyRef,
            (loaded, total) => applyProgress(globalIdx, loaded, total),
            {
              onAttempt: () => batchStage(batchIndex, "previewSending"),
              onRetry: () => batchStage(batchIndex, "retrying"),
              onRequestBodySent: () => { batchStage(batchIndex, "previewProcessing"); bodySentMap.set(batchIndex, true); syncAwaitingServer(); },
            },
          ));
          if (res.status === 401) {
            await supabase.auth.refreshSession();
            const { data: { session: after } } = await supabase.auth.getSession();
            if (after?.access_token) {
              currentToken = after.access_token;
              res = await requestSlots.run(() => postPhotosUpload(
                buildForm,
                currentToken,
                useProxyRef,
                (loaded, total) => applyProgress(globalIdx, loaded, total),
                {
                  onAttempt: () => batchStage(batchIndex, "previewSending"),
                  onRetry: () => batchStage(batchIndex, "retrying"),
                  onRequestBodySent: () => { batchStage(batchIndex, "previewProcessing"); bodySentMap.set(batchIndex, true); syncAwaitingServer(); },
                },
              ));
            }
          }
          if (res.ok) applyProgress(globalIdx, 1, 1);
          // BUG-01: 성공 응답에서 서버 거부 파일 목록 수집
          if (res.ok) {
            type UploadOkBody = { rejected?: string[]; original_presigned?: OriginalPresignedItem[] };
            let okBody: UploadOkBody = {};
            try { okBody = await res.json().catch(() => ({})) as UploadOkBody; } catch {}
            if (okBody.rejected?.length) backendRejected.push(...okBody.rejected);
            for (let sourceIndex = batchIndex * effectiveBatch; sourceIndex < Math.min((batchIndex + 1) * effectiveBatch, uploadFiles.length); sourceIndex++) {
              settledSourceIndexes.add(sourceIndex);
            }

            if (inclOrig && rawFile) {
              mobilePreviewPriority?.recordPreview();
              const job = okBody.original_presigned?.[0];
              if (job) {
                batchStage(batchIndex, "ready");
                originalResults[batchIndex].resolve({ job, token: currentToken });
              } else {
                batchStage(batchIndex, "failed");
                sendingSourceFailedRef.current++;
              }
            } else {
              for (let i = 0; i < batch.length; i++) {
                telemetry.stage(batchIndex * effectiveBatch + i, okBody.rejected?.includes(batch[i].name) ? "failed" : "completed");
              }
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
            const rawDetail = (body as { detail?: unknown } | null)?.detail;
            // no_valid_files 등 일부 400 응답은 detail이 문자열이 아니라 {error, message, rejected}
            // 객체다 — 문자열만 인정하면 서버가 실제로 준 이유를 통째로 버리고 사용자에게
            // "N장 업로드에 실패했습니다."만 뜨는 원인이 된다.
            const detail = typeof rawDetail === "string"
              ? rawDetail
              : (rawDetail && typeof rawDetail === "object" && typeof (rawDetail as { message?: unknown }).message === "string")
                ? (rawDetail as { message: string }).message
                : null;
            const rejected = rawDetail && typeof rawDetail === "object" && Array.isArray((rawDetail as { rejected?: unknown }).rejected)
              ? (rawDetail as { rejected: unknown[] }).rejected.filter((value): value is string => typeof value === "string")
              : [];
            const authLike = isAuthLikeStatus(res.status) || (res.status === 503 && isAuthLikeDetail(detail));
            if (authLike) {
              abortReason = "auth";
              abortMessage = detail ?? "인증 오류로 업로드를 진행할 수 없습니다.";
              return;
            }
            if (rejected.length > 0 && (rawDetail as { error?: unknown }).error === "no_valid_files") {
              backendRejected.push(...rejected);
              batchStage(batchIndex, "failed");
              for (let sourceIndex = batchIndex * effectiveBatch; sourceIndex < Math.min((batchIndex + 1) * effectiveBatch, uploadFiles.length); sourceIndex++) {
                settledSourceIndexes.add(sourceIndex);
              }
            } else {
              recordBatchFailure(batchIndex, detail ?? `HTTP ${res.status}`);
            }
          }
        } catch (e) {
          if (isNetworkFailure(e)) { abortReason = "network"; return; }
          // 재시도 소진 후 던져지는 Error("HTTP 503") 등 — 그동안 메시지를 버려서 사용자에게
          // 아무 단서도 없이 "N장 업로드에 실패했습니다."만 보였다.
          recordBatchFailure(batchIndex, e instanceof Error ? e.message : String(e));
        }

        // Visible progress is sampled from telemetry; completed batches never overwrite byte progress.
      } finally {
        if (inclOrig) originalResults[batchIndex].resolve(null);
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
      // "무제한 큐"를 명시적으로 피한다. 원본 포함 PC는 1장 batch 2~3개를 한 호출로 묶어
      // 워커 풀을 실제 병렬 활용하고, 모바일과 셀렉 전용 흐름은 기존 batch 단위를 유지한다.
      // Original-inclusive channel items contain one preview. The lane is released after
      // /photos registration; originalQueue independently joins its raw PUT and confirmation.
      type CompressedBatch = {
        batchIndex: number;
        files: File[];
        sourceMetadata: UploadSourceMetadata[];
      };
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
        const compressionWorkers = mobileUploadClient ? getMobileCompressionConcurrency() : (inclOrig ? getDesktopCompressionConcurrency() : 2);
        const batchesPerCompressionRound = inclOrig && !mobileUploadClient ? compressionWorkers : 1;
        let nextTokenRefreshAt = refreshInterval;
        for (let groupStart = 0; groupStart < totalBatches; groupStart += batchesPerCompressionRound) {
          if (stopRequestedRef.current || abortReason) break;
          // Mobile does not decode another image while its prepared-preview channel is full.
          if (mobileUploadClient) await waitForPhoneChannelCapacity();
          if (stopRequestedRef.current || abortReason) break;
          if (groupStart >= nextTokenRefreshAt) {
            await supabase.auth.refreshSession();
            const { data: { session: fresh } } = await supabase.auth.getSession();
            if (fresh?.access_token) currentToken = fresh.access_token;
            while (nextTokenRefreshAt <= groupStart) nextTokenRefreshAt += refreshInterval;
          }

          const batchIndexes = Array.from(
            { length: Math.min(batchesPerCompressionRound, totalBatches - groupStart) },
            (_, offset) => groupStart + offset,
          );
          batchIndexes.forEach(startOriginalTask);
          const rawGroup = batchIndexes.flatMap(batchIndex => rawBatches[batchIndex]);
          const chunkTs = Date.now();
          const chunkQueued = batchIndexes.flatMap(batchIndex => rawBatches[batchIndex].map((file, i) => {
            const blobUrl = URL.createObjectURL(file);
            const sourceIndex = batchIndex * effectiveBatch + i;
            const preview = { tempId: `upload-${chunkTs}-${sourceIndex}`, blobUrl, filename: file.name, sourceIndex };
            queuedBlobsRef.current.push(blobUrl);
            queuedPreviewBySourceIndexRef.current.set(sourceIndex, preview);
            return preview;
          }));
          // 이미 압축되어 전송 대기 중인 카드도 유지한다. 새 batch로 통째로 교체하면
          // 이전 카드가 업로드를 시작할 때까지 화면에서 사라져 깜박임처럼 보인다.
          setQueuedPreviews((prev) => [...prev, ...chunkQueued]);

          if (stopRequestedRef.current) {
            setQueuedPreviews([]);
            chunkQueued.forEach((q) => URL.revokeObjectURL(q.blobUrl));
            queuedBlobsRef.current = queuedBlobsRef.current.filter((u) => !chunkQueued.some((q) => q.blobUrl === u));
            break;
          }

          batchIndexes.forEach(batchIndex => batchStage(batchIndex, "preparing"));
          setCompressingIndex(0);
          let compressed: File[];
          const sourceMetadata: UploadSourceMetadata[] = [];
          try {
            compressed = await compressImagesInParallel(
              rawGroup,
              compressAbortControllerRef.current!.signal,
              compressionWorkers,
              { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY },
              () => setCompressingIndex((prev) => prev + 1),
              sourceMetadata,
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

          telemetry.addPreviewBytes(compressed.reduce((sum, file) => sum + file.size, 0));
          let compressedOffset = 0;
          for (const batchIndex of batchIndexes) {
            const batchLength = rawBatches[batchIndex].length;
            batchStage(batchIndex, "ready");
            await channelPush({
              batchIndex,
              files: compressed.slice(compressedOffset, compressedOffset + batchLength),
              sourceMetadata: sourceMetadata.slice(compressedOffset, compressedOffset + batchLength),
            });
            compressedOffset += batchLength;
          }
        }
        channelClose();
      })();

      const runLane = async () => {
        for (;;) {
          const item = await channelPop();
          if (!item) return;
          await uploadOneBatch(item.files, item.batchIndex, item.sourceMetadata);
        }
      };
      const lanes = Array.from({ length: Math.max(1, previewConcurrency) }, () => runLane());
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
        const flatSourceMetadata: UploadSourceMetadata[] = [];
        try {
          flatCompressed = await compressImagesInParallel(
            allRawInChunk,
            compressAbortControllerRef.current!.signal,
            isMobileUploadClient() ? 1 : 2,
            undefined,
            () => setCompressingIndex((prev) => prev + 1),
            flatSourceMetadata,
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
        const metadataChunk: UploadSourceMetadata[][] = [];
        {
          let cursor = 0;
          for (const batch of rawChunk) {
            compressedChunk.push(flatCompressed.slice(cursor, cursor + batch.length));
            metadataChunk.push(flatSourceMetadata.slice(cursor, cursor + batch.length));
            cursor += batch.length;
          }
        }
        setCompressingIndex(-1);

        // ── STEP 4: XHR 시작 시 각 카드가 같은 tempId/blobUrl로 uploading 상태에 인계된다. ──

        const chunk = compressedChunk;
        await Promise.all(chunk.map((batch, chunkOffset) =>
          uploadOneBatch(batch, chunkStart + chunkOffset, metadataChunk[chunkOffset]),
        ));
        // batch 간 macrotask 경계 생성: iOS WKWebView는 macrotask 사이에서만 paint
        // 이 시점에 이전 batch blob preview가 DOM에 있고 다음 XHR이 아직 시작 안 됨 → paint 보장
        if (isMobileUploadClient()) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }

    originalResults.forEach(result => result.resolve(null));
    mobilePreviewPriority?.finishPreviews();
    if (inclOrig && !abortReason && !stopRequestedRef.current) {
      // 이 시점에는 모든 preview 요청과 photos INSERT가 끝났다. 원본 queue는 계속 두되
      // 프로젝트/사진 수를 먼저 갱신해 고객 셀렉 요청을 즉시 열 수 있게 한다.
      originalQueue.setConcurrency(originalConcurrencyAfterPreviews);
      if (!mobileUploadClient) {
        adaptiveOriginalConcurrency = new AdaptiveUploadConcurrency(
          originalConcurrencyAfterPreviews,
          1,
          originalConcurrencyMax,
          next => originalQueue.setConcurrency(next),
        );
        telemetry.setOriginalConcurrency(adaptiveOriginalConcurrency.report());
      }
      await Promise.all([loadPhotos(), loadProject()]);
      setUploadPhase("originals");
    }
    await Promise.all(originalTasks);

    // PUT과 confirm은 파일별 공유 예산 안에서 이미 모두 재시도했다. 여기서는 재전송을
    // 중첩하지 않고 최종 실패만 기록해, 파일당 총 재시도 상한을 지킨다.
    if (!abortReason && !stopRequestedRef.current && failedOriginalJobIds.size > 0) {
      const failedJobIds = Array.from(failedOriginalJobIds);
      let nextFailureReportIndex = 0;
      const reportLane = async () => {
        while (nextFailureReportIndex < failedJobIds.length) {
          const jobId = failedJobIds[nextFailureReportIndex++];
          await reportOriginalUploadFailure(jobId, currentToken).catch(() => {});
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(2, failedJobIds.length) },
        () => reportLane(),
      ));
    }

    if (stopRequestedRef.current) {
      telemetry.finish("stopped");
      setAwaitingServerFinalize(false);
      setUploadPhase("idle");
      setUploadProgress(0);
      // 중단 전에 이미 완료된 배치는 서버에서 projects.photo_count까지 갱신된다.
      // 사진 목록만 다시 읽으면 초대 CTA가 이전 project.photoCount를 계속 참조하므로,
      // 두 데이터를 함께 새로고침해 업로드 완료분을 바로 활성화 조건에 반영한다.
      await Promise.all([loadPhotos(), loadProject()]);
      if (inclOrig) await checkPendingOriginals();
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
      let freshPhotos: Photo[] | null = null;
      try { freshPhotos = await getPhotosByProjectId(id); }
      catch (error) { console.error("[upload] cleanup photo list refresh failed", error); }
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
      queuedBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      queuedBlobsRef.current = [];
      queuedPreviewBySourceIndexRef.current.clear();
      if (!freshPhotos) {
        // 완료된 batch의 pending preview는 목록 재조회에 성공할 때까지 유지한다.
        flushSync(() => {
          setUploadingPhotos([]);
          setQueuedPreviews([]);
          setPhotosLoading(false);
        });
        return;
      }
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
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

    if (abortReason) telemetry.finish("incomplete");
    if (abortReason === "compressSetup") {
      const failures = collectUnsettledFailures(abortMessage);
      setAwaitingServerFinalize(false); setUploadFailures(failures); setUploadError(formatUploadFailureSummary(failures)); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return;
    }
    if (abortReason === "betaLimit") { setAwaitingServerFinalize(false); setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return; }
    if (abortReason === "network") {
      const failures = collectUnsettledFailures("인터넷 연결 오류");
      setAwaitingServerFinalize(false); setUploadFailures(failures); setUploadError(formatUploadFailureSummary(failures)); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return;
    }
    if (abortReason === "auth") {
      const reason = formatAuthError(abortMessage);
      const failures = collectUnsettledFailures(reason);
      setAwaitingServerFinalize(false); setUploadFailures(failures); setUploadError(formatUploadFailureSummary(failures)); setUploadPhase("idle"); setUploadProgress(0); await cleanupAllTempStates(); uploadInProgressRef.current = false; return;
    }

    let originalFinalize: OriginalFinalizeResult | null = null;
    telemetry.finalizing = true;
    const finalizeStarted = performance.now();
    if (inclOrig) originalFinalize = await finalizeOriginalUpload(id, currentToken);
    telemetry.finalize(performance.now() - finalizeStarted);
    const originalIncomplete = inclOrig && (
      sendingSourceFailedRef.current > 0 || !originalFinalize?.ok
    );

    setAwaitingServerFinalize(false);
    telemetry.finish(originalIncomplete || failureBySourceIndex.size > 0 || backendRejected.length > 0 ? "incomplete" : "completed");
    setUploadSnapshot(telemetry.snapshot());
    setUploadProgress(originalIncomplete ? 99 : 100);
    if (!originalIncomplete) {
      setUploadPhase("done");
      fetch("/api/photographer/project-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "uploaded" }) }).catch(() => {});
    }
    setTimeout(async () => {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle"); setUploadProgress(0);
      uploadInProgressRef.current = false;
      const failures = listFailuresInSelectionOrder();
      if (failures.length > 0) {
        setUploadFailures(failures);
        setUploadError(formatUploadFailureSummary(failures));
      }
      if (backendRejected.length > 0) {
        const rejectedMessage = `${backendRejected.length}개 파일은 지원하지 않는 형식입니다 (JPEG/PNG/WebP/HEIC만 가능): ${backendRejected.slice(0, 3).join(", ")}${backendRejected.length > 3 ? ` 외 ${backendRejected.length - 3}개` : ""}`;
        setUploadError(failures.length > 0 ? `${formatUploadFailureSummary(failures)} · ${rejectedMessage}` : rejectedMessage);
      }
      const totalFail = failures.length + backendRejected.length;
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
      let freshPhotos: Photo[] | null = null;
      for (let attempt = 1; attempt <= 3 && !freshPhotos; attempt++) {
        try {
          freshPhotos = await getPhotosByProjectId(id);
        } catch (error) {
          console.error(`[upload] completed photo list refresh failed (${attempt}/3)`, error);
          if (attempt < 3) await new Promise<void>((resolve) => setTimeout(resolve, 400 * attempt));
        }
      }
      if (!freshPhotos) {
        // DB 저장은 끝났으므로 낙관적 preview를 유지한다. 여기서 []로 바꾸면 사용자는
        // 업로드가 사라진 것으로 오인하고 초기 dropzone이 다시 노출된다.
        uploadingBlobsRef.current.forEach((url) => URL.revokeObjectURL(url));
        uploadingBlobsRef.current = [];
        queuedBlobsRef.current.forEach((url) => URL.revokeObjectURL(url));
        queuedBlobsRef.current = [];
        queuedPreviewBySourceIndexRef.current.clear();
        setUploadError("업로드는 완료됐지만 사진 목록을 새로고침하지 못했습니다. 잠시 후 새로고침해 주세요.");
        setUploadingPhotos([]);
        setQueuedPreviews([]);
        setPhotosLoading(false);
        router.refresh();
        return;
      }
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

      /* 업로드가 끝난 **바로 이 순간**이 AI 분석 의도가 가장 높은 지점이다 — 지금까지는
       * 작가가 (a) 기능의 존재를 알아채고 (b) 정렬 드롭다운과 똑같이 생긴 버튼을 찾아
       * (c) 눌러야만 했다. 다음 조건을 모두 만족할 때만 띄운다:
       *  - 사진이 실제로 올라갔고(실패만 있는 업로드에서는 묻지 않는다)
       *  - 이 프로젝트에서 "건너뛰기"를 누른 적이 없고
       *  - 이미 분석이 돌고 있지 않다(중복 트리거 방지) */
      if (
        freshPhotos.length > 0 &&
        !aiPromptSkippedRef.current &&
        clipAnalysisStatus !== "processing" &&
        qualityAnalysisStatus !== "processing"
      ) {
        setAiWantSimilar(true);
        setAiWantQuality(false);
        setAiPromptSource("upload");
        setAiPromptOpen(true);
      }
    }, 600);
  }, [id, loadProject, loadPhotos, router, project?.includeOriginal, loadClipAnalysisStatus, checkPendingOriginals, clipAnalysisStatus, qualityAnalysisStatus]);

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
    if (recoveryBusyRef.current || uploadInProgressRef.current || !project?.includeOriginal) return;
    recoveryBusyRef.current = true;
    uploadInProgressRef.current = true;
    setRecoveryBusy(true);
    setSendingSourcePhase(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setUploadError("로그인이 필요합니다."); return; }
      const newUnmatched: PendingOriginalItem[] = [];
      let failed = 0;
      for (const job of pendingRecovery) {
        const match = recoveryFilesRef.current.get(job.id) ?? selectedFiles.find(file =>
          file.name === job.original_filename &&
          (job.original_file_size === null || file.size === job.original_file_size) &&
          (job.original_last_modified === null || file.lastModified === job.original_last_modified));
        if (!match) { newUnmatched.push(job); continue; }
        recoveryFilesRef.current.set(job.id, match);
        try {
          const budget = createOriginalRetryBudget();
          const result = await recoverOriginalJob(job.id, token);
          let restored = result.status === "confirmed";
          if (result.status === "needs_upload") {
            const item: OriginalPresignedItem = { job_id: job.id, ...result, expires_at: "" };
            restored = await putOriginalToR2(item, match, token, budget)
              && await confirmOrRecoverOriginalUpload(job.id, token, budget);
          }
          if (restored) recoveryFilesRef.current.delete(job.id);
          else failed++;
        } catch { failed++; }
      }
      setUnmatchedJobs(newUnmatched);
      const remaining = await fetchPendingOriginals(id, token);
      if (remaining !== null) {
        setPendingRecovery(remaining);
        const remainingIds = new Set(remaining.map(job => job.id));
        for (const jobId of recoveryFilesRef.current.keys()) if (!remainingIds.has(jobId)) recoveryFilesRef.current.delete(jobId);
        setShowRecoveryBanner(remaining.length > 0);
        if (remaining.length === 0) {
          setUploadError(null);
          setToast("원본 업로드 복구 완료!");
          if (new URLSearchParams(window.location.search).get("recover") === "1") {
            window.setTimeout(() => router.replace(`/photographer/projects/${id}/assets/original`), 600);
          }
        }
      }
      if (failed) setUploadError(`원본 ${failed}장을 아직 저장하지 못했습니다. 실패한 원본만 다시 시도해주세요.`);
    } finally {
      setRecoveryCachedCount(recoveryFilesRef.current.size);
      recoveryBusyRef.current = false;
      uploadInProgressRef.current = false;
      setRecoveryBusy(false);
      setSendingSourcePhase(false);
    }
  }, [id, pendingRecovery, project?.includeOriginal, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    // 초대 링크 활성화 후에는 파일 입력이 남아 있더라도 추가 업로드를 시작하지 않는다.
    if (project?.status !== "preparing" || recoveryBusyRef.current) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!chosen?.length) return;
    setUploadFailures([]);
    setShowUploadFailureDetails(false);
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
    if (!project || project.status !== "preparing" || recoveryBusyRef.current) return;
    setUploadFailures([]);
    setShowUploadFailureDetails(false);
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

  /** CustomerInviteShareModal의 인라인 PIN 편집이 위임하는 저장 — 실패하면 던져서
   * 그 모달 안의 에러 문구로 보여준다(별도 PIN 모달을 다시 띄우지 않는다). */
  const handleSavePin = async (newPin: string | null) => {
    if (!project) return;
    const res = await fetch(`/api/photographer/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_pin: newPin }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
    setProject({ ...project, accessPin: newPin });
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

  const handleDeleteSelected = async () => {
    const photoIds = [...selectedPhotoIds].filter((photoId) => photos.some((photo) => photo.id === photoId));
    if (photoIds.length === 0) return;
    setDeletingId("__selected__");
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos/selected`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; photoCount?: number };
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");

      const deletedIds = new Set(photoIds);
      setPhotos((current) => current.filter((photo) => !deletedIds.has(photo.id)));
      setProject((current) => current
        ? { ...current, photoCount: data.photoCount ?? Math.max(0, current.photoCount - photoIds.length) }
        : current);
      setSelectedPhotoIds(new Set());
      setMobilePhotoManageMode(false);
      setToast(`${photoIds.length.toLocaleString()}장을 삭제했습니다.`);
      // 응답에는 DB 트랜잭션 결과가 이미 반영되어 있다. UI를 즉시 갱신한 뒤 그룹/분석 캐시는
      // 백그라운드에서 한 번만 재조회해 삭제 버튼 대기 시간을 늘리지 않는다.
      void Promise.all([loadPhotos(), loadPhotoGroups(), loadProject(), loadClipAnalysisStatus()]);
    } catch (error) {
      await Promise.all([loadPhotos(), loadPhotoGroups(), loadProject()]);
      setToast(error instanceof Error ? error.message : "선택한 사진을 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmPhotoDelete = async () => {
    const target = deleteConfirmTarget;
    if (!target || deletingId || deleteConfirmSubmittingRef.current) return;
    deleteConfirmSubmittingRef.current = true;
    try {
      if (target.kind === "selected") {
        await handleDeleteSelected();
      } else {
        await handleDeletePhoto(target.photoId);
      }
      setDeleteConfirmTarget(null);
    } finally {
      deleteConfirmSubmittingRef.current = false;
    }
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

  const handleEnableClientAccess = async (requestDeadline: string) => {
    if (!project) return;
    const m = project.photoCount;
    const n = project.requiredCount;
    if (project.status !== "preparing" || m < n) return;
    // 고객 갤러리에 들어갈 preview 등록까지만 기다린다. 전달용 원본 PUT은 별도 queue에서
    // 계속 진행하며 고객 셀렉 시작을 막지 않는다.
    const uploadStillActive =
      uploadPhase === "sending" ||
      uploadPhase === "processing" ||
      isPreparingFiles ||
      awaitingServerFinalize ||
      uploadingPhotos.length > 0 ||
      queuedPreviews.length > 0;
    if (uploadStillActive) {
      setToast("셀렉용 사진 저장이 끝난 뒤 고객 링크를 활성화할 수 있습니다.");
      return;
    }
    setInviteActivating(true);
    try {
      if (requestDeadline !== project.deadline) {
        const deadlineResponse = await fetch(`/api/photographer/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadline: requestDeadline }),
        });
        const deadlineData = await deadlineResponse.json().catch(() => ({})) as { error?: string };
        if (!deadlineResponse.ok) {
          setToast(deadlineData.error ?? "셀렉 마감일 저장에 실패했습니다.");
          return;
        }
        setProject((current) => current ? { ...current, deadline: requestDeadline } : current);
      }

      const res = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selecting" satisfies ProjectStatus }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; alreadyActive?: boolean };
      if (res.ok) {
        if (!data.alreadyActive) {
          fetch("/api/photographer/project-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: id, action: "selecting" }),
          }).catch(() => {});
        }
        setProject((current) => current
          ? { ...current, deadline: requestDeadline, status: "selecting" }
          : current);
        setSelectionRequestModalOpen(false);
        setInviteShareModalOpen(true);
        setToast("셀렉 요청을 시작했습니다.");
        router.refresh();
        return;
      }
      setToast(data.error ?? "초대 링크 활성화에 실패했습니다.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "초대 링크 활성화에 실패했습니다.");
    } finally {
      setInviteActivating(false);
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

  /** 업로드 완료 모달의 [분석 시작] — 체크한 것만 트리거하고 바로 닫는다.
   * 둘은 서로 독립이라 한쪽이 실패해도 다른 쪽은 그대로 진행시킨다(`allSettled`). */
  const handleStartAiFromPrompt = async () => {
    setAiPromptOpen(false);
    const jobs: Promise<unknown>[] = [];

    if (aiWantSimilar) {
      setClipAnalysisTriggering(true);
      jobs.push(
        fetch(`/api/photographer/projects/${id}/gemini-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => { if (res.ok) setClipAnalysisStatus("processing"); return res; })
          .finally(() => setClipAnalysisTriggering(false))
      );
    }

    if (aiWantQuality) {
      jobs.push(
        fetch(`/api/photographer/projects/${id}/gemini-quality`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).then((res) => { if (res.ok) setQualityAnalysisStatus("processing"); return res; })
      );
    }

    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as Response).ok));
    if (failed.length === results.length && results.length > 0) {
      setToast("분석 시작에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } else if (failed.length > 0) {
      setToast("일부 분석을 시작하지 못했습니다.");
    } else if (results.length > 0) {
      setToast("AI 분석을 시작했습니다. 완료되면 알려드릴게요.");
    }
  };

  /** [건너뛰기] — 명시적 거절이므로 이번 방문 동안은 다시 묻지 않는다 */
  const handleSkipAiPrompt = () => {
    setAiPromptOpen(false);
    aiPromptSkippedRef.current = true;
  };

  /** Escape·배경 클릭 — "지금은 닫기"일 뿐 거절이 아니다. 다음 업로드 때 다시 묻는다.
   *  (둘을 같은 핸들러로 묶었다가 실수로 닫은 사용자가 기능을 영영 못 보게 된 적이 있다) */
  const handleDismissAiPrompt = () => {
    setAiPromptOpen(false);
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

  if (loading) return <SystemLoadingScreen />;
  if (!project) return (
    <div className={themeStyles.lightTheme} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0, fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}>
      <span style={{ fontSize: 13, color: TEXT_MUTED }}>프로젝트를 찾을 수 없습니다</span>
    </div>
  );

  const N = project.requiredCount;
  const M = project.photoCount;
  const isInviteActive = project.status !== "preparing";
  // 프로젝트 코드는 바로 위 breadcrumb에 이미 노출되므로 부제에서는 반복하지 않는다.
  const shootTypeLabel = SHOOT_TYPES.find((t) => t.value === project.shootType)?.label;
  const headerSubtitle = [
    shootTypeLabel,
    project.customerName ? `${project.customerName} 고객` : null,
  ].filter(Boolean).join(" | ");
  // 고객 갤러리용 preview 구성만 활성화를 막는다. 전달용 원본 PUT과 복구는 링크를
  // 연 뒤에도 계속되므로 초대 가능 여부와 분리한다.
  const uploadBlockingInvite =
    isPreviewUploading ||
    isPreparingFiles ||
    awaitingServerFinalize ||
    uploadingPhotos.length > 0 ||
    queuedPreviews.length > 0;
  // 헤더 초대 버튼이 지금 실제로 눌러 실행할 수 있는 상태인지 — design-system.md §23:
  // 실행 불가 상태는 Primary(orange fill)가 아니라 Secondary(Neutral Surface fill)로 표현한다.
  const inviteButtonReady = isInviteActive || (M >= N && !uploadBlockingInvite);
  const uploadCopy = uploadSnapshot ? describeUpload(uploadSnapshot, project.includeOriginal ?? false) : null;
  const showServerWorking = uploadCopy?.checking ?? false;
  const uploadStatusLabel = uploadStopRequested ? "업로드 중단 중" : uploadCopy?.label ?? "사진 준비 중";
  const uploadEtaLabel = uploadCopy ? `${uploadCopy.transfer} · ${uploadCopy.eta}` : "남은 시간 계산 중";
  const uploadSavedLabel = uploadCopy?.details;
  const photoUploadAllowed = project.status === "preparing" && !recoveryBusy;

  const photoSelectionActive = mobilePhotoManageMode || (!isMobile && selectedPhotoIds.size > 0);
  const selectedPhotosAreRecommended = selectedPhotoIds.size > 0
    && [...selectedPhotoIds].every((photoId) => recommendedPhotoIds.has(photoId));
  const updateSelectedRecommendations = () => {
    if (selectedPhotoIds.size === 0 || recommendationSaving) return;
    const nextIds = new Set(recommendedPhotoIds);
    for (const photoId of selectedPhotoIds) {
      if (selectedPhotosAreRecommended) nextIds.delete(photoId);
      else nextIds.add(photoId);
    }
    const count = selectedPhotoIds.size.toLocaleString();
    void saveRecommendations(
      nextIds,
      selectedPhotosAreRecommended
        ? `${count}장을 작가 추천에서 제외했습니다.`
        : `${count}장을 작가 추천으로 지정했습니다.`,
      true,
    );
  };
  const setPhotoScope = (recommended: boolean) => {
    setShowRecommendedOnly(recommended);
    setLightboxIndex(null);
    setGroupReviewGroupId(null);
  };
  const changePhotoViewMode = (mode: "gallery" | "list") => {
    photoScrollRef.current?.scrollTo({ top: 0 });
    setViewMode(mode === "gallery" ? "grid" : "list");
  };
  const photoScopeControl = (
    <PhotoScopeSelect
      totalCount={displayPhotos.length}
      recommendedCount={recommendedPhotoIds.size}
      recommendedOnly={showRecommendedOnly}
      onChange={setPhotoScope}
    />
  );
  const recommendationHint = recommendedPhotoIds.size === 0
    ? "추천 없이 고객에게 셀렉을 요청할 수 있어요."
    : recommendedPhotoIds.size === N
      ? `고객이 추천 ${N.toLocaleString()}장을 확인하고 바로 확정할 수 있어요.`
      : recommendedPhotoIds.size < N
        ? `${(N - recommendedPhotoIds.size).toLocaleString()}장을 더 추천하면 고객이 추천 구성 그대로 확정할 수 있어요.`
        : `추천을 ${N.toLocaleString()}장으로 맞추면 고객이 추천 구성 그대로 확정할 수 있어요.`;

  return (
    <div
      data-photographer-viewport-page
      className={`prj-root ${themeStyles.lightTheme} ${themeStyles.workspace}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        position: "relative",
        background: SURFACE_0,
        fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes prj-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(500%); } }
        @keyframes prj-bar-indeterminate-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        @keyframes prj-bar-indet-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        @keyframes prj-compress-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.85; } }
        .prj-compressing-overlay { position: absolute; inset: 0; z-index: 11; background: rgba(var(--accent-rgb), 0.15); display: flex; align-items: center; justify-content: center; animation: prj-compress-pulse 0.9s ease-in-out infinite; }
        .prj-scroll::-webkit-scrollbar { width: 4px; }
        .prj-scroll::-webkit-scrollbar-track { background: ${SURFACE_2}; }
        .prj-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); }
        .prj-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .prj-data-cell { position: relative; cursor: default; transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.18s; }
        .prj-photo-media[role="button"] { cursor: pointer; }
        .prj-photo-media[role="button"]:focus-visible { outline: 2px solid rgba(var(--accent-rgb), 0.34); outline-offset: 2px; }
        .prj-data-cell.is-selected { background: rgba(var(--accent-rgb), 0.045) !important; box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.10); }
        .prj-data-cell.is-selected .prj-photo-media { box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.22); }
        .prj-data-cell.is-selected .prj-photo-name-row { color: var(--foreground); font-weight: 600; }
        .prj-data-cell .prj-overlay { position: absolute; inset: 0; border: 1px solid transparent; border-radius: 8px; transition: border-color 0.18s; pointer-events: none; z-index: 5; }
        .prj-data-cell:hover .prj-overlay { border-color: rgba(var(--accent-rgb), 0.28); }
        .prj-photo-name-row { height: 24px; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 3px; font-size: 13px; font-weight: 500; line-height: 20px; letter-spacing: -0.35px; color: var(--muted-foreground); }
        .prj-photo-name-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: color-mix(in srgb, var(--foreground) 74%, transparent); }
        .prj-data-cell.is-selected .prj-photo-name-row > span { color: var(--foreground); }
        .prj-photo-select { width: 16px; height: 16px; flex: 0 0 16px; padding: 0; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--surface); color: var(--accent-foreground); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .prj-photo-select[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); }
        .prj-photo-select:focus-visible { outline: 2px solid rgba(var(--accent-rgb), 0.34); outline-offset: 2px; }
        .prj-photo-media { aspect-ratio: 218.32 / 150.7; }
        .prj-upload-tile:hover { border-color: rgba(var(--accent-rgb), 0.45) !important; background: rgba(var(--accent-rgb), 0.04) !important; }
        .prj-upload-tile:active { border-color: rgba(var(--accent-rgb), 0.4) !important; }
        .prj-upload-tile:focus-visible { outline: none; border-color: ${ACCENT} !important; }
        .prj-group-badge {
          position: absolute; top: 8px; right: 8px;
          min-width: 40px; height: 25px; padding: 0 9px;
          background: rgba(0,0,0,0.52); border: 0;
          border-radius: 4px; color: #fff;
          font-size: 12px; font-weight: 600;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          z-index: 10; cursor: pointer; transition: all 0.15s ease;
        }
        .prj-group-badge:hover { background: rgba(0,0,0,0.72); }
        .prj-group-badge-inline {
          flex-shrink: 0; min-width: 20px; height: 18px; padding: 0 5px;
          background: transparent; border: 1px solid ${ACCENT};
          color: ${ACCENT};
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s ease;
        }
        .prj-group-badge-inline:hover { background: ${ACCENT}; color: var(--accent-foreground); }
        .prj-list-table {
          width: calc(100% - 80px); max-width: 1600px; min-width: 760px;
          margin: 8px auto 96px; background: var(--surface);
          border: 1px solid var(--border-subtle); border-radius: 8px 8px 0 0;
          overflow: clip; box-sizing: border-box;
        }
        .prj-list-header, .prj-list-row {
          display: grid;
          grid-template-columns: 18px minmax(320px, 720px) 140px 180px minmax(0, 1fr);
          column-gap: 20px; align-items: center; padding: 0 32px; box-sizing: border-box;
        }
        .prj-list-header {
          position: sticky; top: 0; z-index: 12; height: ${LIST_HEADER_H}px;
          border-bottom: 1px solid var(--border-subtle); background: var(--surface-raised);
          color: var(--muted-foreground); font-size: 14px; font-weight: 600;
          line-height: 24px; letter-spacing: -0.45px;
        }
        .prj-list-numeric { text-align: right; }
        .prj-list-row {
          height: ${LIST_ROW_H}px; border-bottom: 1px solid var(--border-subtle);
          background: var(--surface); transition: background 160ms ease;
        }
        .prj-list-row:hover { background: color-mix(in srgb, var(--surface-raised) 46%, var(--surface)); }
        .prj-list-row.is-selected { background: rgba(var(--accent-rgb), 0.075); }
        .prj-list-row.is-selected:hover { background: rgba(var(--accent-rgb), 0.095); }
        .prj-list-row.is-group-expanded:not(.is-selected) { background: var(--surface-raised); }
        .prj-list-file { min-width: 0; display: flex; align-items: center; gap: 14px; }
        .prj-list-thumbnail {
          flex: 0 0 auto; overflow: hidden; padding: 0; border: 1px solid var(--border-subtle);
          border-radius: 4px; background: var(--surface-raised); cursor: pointer;
        }
        .prj-list-thumbnail:focus-visible { outline: 2px solid rgba(var(--accent-rgb), 0.3); outline-offset: 2px; }
        .prj-list-filename {
          min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: var(--foreground); font-size: 14px; font-weight: 500;
          line-height: 24px; letter-spacing: -0.45px;
        }
        .prj-list-value {
          color: color-mix(in srgb, var(--foreground) 70%, transparent); text-align: right; white-space: nowrap;
          font-size: 14px; font-weight: 450; line-height: 24px; letter-spacing: -0.2px;
          font-variant-numeric: tabular-nums;
        }
        .prj-list-value.is-empty { color: var(--subtle-foreground); font-size: 13px; }
        .prj-list-group-badge {
          min-width: 41px; height: 24px; padding: 0 9px; border: 0; border-radius: 4px;
          background: color-mix(in srgb, var(--foreground) 72%, transparent); color: var(--surface);
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
          font-size: 14px; font-weight: 500; line-height: 19px; cursor: pointer;
        }
        .prj-list-group-badge:hover { background: var(--foreground); }
        .prj-similarity-toggle {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 500; background: none; border: none;
          cursor: pointer; white-space: nowrap; padding: 4px 6px;
        }
        .prj-similarity-checkbox {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 1.5px solid var(--border-strong);
          border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease;
        }
        .prj-similarity-toggle.prj-similarity-on .prj-similarity-checkbox {
          background: ${ACCENT}; border-color: ${ACCENT};
        }
        .prj-op-node { transition: all 0.2s; cursor: pointer; }
        .prj-op-node:hover { border-color: rgba(var(--accent-rgb), 0.4) !important; background: rgba(var(--accent-rgb), 0.04) !important; }
        .prj-op-node:hover .prj-op-arrow { color: ${ACCENT} !important; }
        .prj-dropzone { border: 1px dashed var(--border); transition: all 0.2s; }
        .prj-dropzone-over { border-color: rgba(var(--accent-rgb), 0.5) !important; background: ${ACCENT_DIM} !important; }
        .prj-gallery-toolbar { min-height: 72px; flex: 0 0 72px; box-sizing: border-box; padding: 14px 40px; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); background: var(--surface); }
        .prj-gallery-toolbar:has(.prj-upload-compact) { flex-basis: auto; }
        .prj-gallery-toolbar-inner:has(.prj-upload-compact) { height: auto; flex-wrap: wrap; }
        .prj-gallery-toolbar-inner { width: 100%; min-width: 0; height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .prj-gallery-context { flex-shrink: 0; display: flex; align-items: center; gap: 16px; }
        .prj-gallery-summary { display: flex; align-items: center; gap: 12px; }
        .prj-gallery-analysis { display: flex; flex-wrap:wrap; gap:8px; align-items: center; padding-left: 16px; border-left: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent); }
        .prj-gallery-query-tools { min-width: 0; flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
        .prj-gallery-display-tools { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding-left: 12px; border-left: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent); }
        .prj-toolbar-check { width: 18px; height: 18px; flex: 0 0 18px; padding: 0; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--surface); color: var(--accent-foreground); display: inline-flex; align-items: center; justify-content: center; }
        .prj-toolbar-check[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); }
        .prj-ai-control { height: 44px; padding: 0 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--foreground); display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; line-height: 24px; letter-spacing: -0.45px; white-space: nowrap; cursor: pointer; transition: border-color 160ms ease, background 160ms ease, color 160ms ease; }
        .prj-ai-control:hover:not(:disabled) { border-color: var(--border-strong); background: var(--surface-raised); }
        /* AI 버튼은 **중립 크롬에서 빼낸다**. 이 자리에 정렬 드롭다운(.prj-gallery-sort)·뷰 전환기와
         * 높이(44px)·테두리·배경·radius가 전부 같은 버튼으로 있었더니, 기능이 아니라 화면 장치로
         * 읽혀 "AI가 있는 줄도 몰랐다"는 말이 나왔다.
         * 구분은 **테두리가 아니라 면**으로 한다 — 테두리를 두면 옆 드롭다운·뷰 전환기와 같은
         * "네모 칸" 문법에 다시 갇힌다. 무테 + accent 틴트 면이면 같은 줄에서도 성격이 갈린다
         * (주황 **채움**은 하단 제출 CTA의 몫이라 여기서는 옅은 틴트까지만 쓴다).
         * ⚠️ 위의 일반 hover 규칙과 명시도가 같으므로 **반드시 그 뒤에** 와야 덮어쓴다. */
        .prj-ai-control-idle { border-color: transparent; background: rgba(var(--accent-rgb), 0.09); color: var(--accent); }
        .prj-ai-control-idle:hover:not(:disabled) { border-color: transparent; background: rgba(var(--accent-rgb), 0.16); }
        .prj-ai-control-processing { border-color: transparent; background: var(--surface-raised); }

        .prj-ai-control:focus-visible { outline: 2px solid rgba(var(--accent-rgb), 0.24); outline-offset: 2px; }
        .prj-ai-control:disabled { cursor: wait; opacity: 0.62; }
        .prj-ai-control-processing { color: var(--muted-foreground); }
        /* 색·테두리·placeholder는 FilenameSearchInput(fsi-root)이 고정한다 — 여기서는
         * --fsi-* 변수로 이 툴바 자리에 맞는 크기만 넘긴다. */
        .prj-gallery-search { --fsi-width: min(500px, 28vw); --fsi-height: 44px; --fsi-gap: 18px; --fsi-radius: 8px; --fsi-font-size: 14px; }
        .prj-upload-compact { min-width: 0; min-height: 62px; padding: 5px 10px; border: 1px solid rgba(var(--accent-rgb), 0.18); border-radius: 8px; background: rgba(var(--accent-rgb), 0.06); display: inline-flex; align-items: center; gap: 10px; color: var(--foreground); }
        .prj-upload-compact-copy { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0; white-space: normal; }
        .prj-upload-compact-copy strong { font-size: 14px; font-weight: 600; line-height: 20px; letter-spacing: -0.45px; }
        .prj-upload-compact-copy span { font-size: 12px; font-weight: 500; line-height: 18px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
        .prj-upload-ring { width: 22px; height: 22px; flex: 0 0 22px; transform: rotate(-90deg); }
        .prj-upload-ring-track { fill: none; stroke: var(--border); stroke-width: 2.5; }
        .prj-upload-ring-value { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; transition: stroke-dashoffset 0.3s ease; }
        .prj-upload-stop { min-width: 32px; height: 32px; padding: 0 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--muted-foreground); font-size: 12px; font-weight: 600; white-space: nowrap; }
        .prj-upload-stop:hover:not(:disabled) { border-color: var(--border-strong); color: var(--foreground); }
        .prj-upload-stop:disabled { cursor: wait; opacity: 0.55; }
        @media (max-width: 1280px) and (min-width: 769px) {
          .prj-gallery-toolbar { padding-inline: 24px; gap: 12px; }
          .prj-gallery-context { gap: 12px; }
          .prj-gallery-analysis { padding-left: 12px; }
          .prj-gallery-query-tools { gap: 8px; }
          .prj-gallery-display-tools { padding-left: 8px; }
          .prj-gallery-search { --fsi-width: min(320px, 24vw); }
          .prj-ai-control { padding-inline: 12px; }
          .prj-list-table { width: calc(100% - 48px); margin-inline: auto; }
          .prj-list-header, .prj-list-row { grid-template-columns: 18px minmax(220px, 1fr) 112px 136px; padding-inline: 24px; gap: 16px; }
        }
        .prj-mobile-toolbar { display: none; }
        @media (max-width: 768px) {
          .prj-desktop-toolbar { display: none !important; }
          .prj-view-toolbar { display: none !important; }
          .prj-mobile-toolbar { display: flex !important; }
          .prj-photo-name-row { display: none; }
          .prj-photo-media { aspect-ratio: 1 / 1; }
          .prj-photo-select { display: none; }
          /* 하단 메뉴 여유는 공통 PhotographerFormActionBar가 책임진다. */
        }
      `}</style>

      <input ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES} style={{ display: "none" }} onChange={handleFileChange} />

      {/* 공통 Light page frame/header로 breadcrumb·title·description·actions의 시작점을 다른 작가 화면과 공유한다. */}
      <div
        data-upload-header-mode={immersiveUploadHeader ? "immersive" : compactUploadHeader ? "compact" : "expanded"}
        className="relative z-20 shrink-0 bg-background"
      >
        {/* 축소 상태에서도 프로젝트 이동과 현재 위치를 유지한다. */}
        <div className={themeStyles.compactHeader} aria-hidden={!compactUploadHeader} inert={!compactUploadHeader}>
          <button type="button" onClick={() => router.push(`/photographer/projects/${id}`)} aria-label="프로젝트 상세로 돌아가기">←</button>
          <span title={project.name}>{project.name}</span>
          <strong>원본 업로드</strong>
        </div>
        <div className={themeStyles.expandedHeader} aria-hidden={compactUploadHeader} inert={compactUploadHeader}>
        <div className={themeStyles.expandedHeaderInner}>
        <PhotographerLightPageFrame
          className="pb-4 md:!pt-6"
        >
          <PhotographerLightPageHeader
            compact={false}
            mobileDense
            breadcrumb={
            <nav aria-label="현재 위치" className="flex items-center gap-2 text-[14px] font-medium leading-[17px] tracking-[-0.15px] text-subtle-foreground">
              <button type="button" onClick={() => router.push("/photographer/projects")} className="transition-colors hover:text-foreground">프로젝트</button>
              <ChevronRight size={14} aria-hidden />
              <button type="button" onClick={() => router.push(`/photographer/projects/${id}`)} className="transition-colors hover:text-foreground">
                {project.name}
              </button>
              <ChevronRight size={14} aria-hidden />
              <span className="text-muted-foreground">원본 업로드</span>
            </nav>
            }
            title="원본 업로드"
            description={
              <span>
                {headerSubtitle}
                <span className="mx-2 text-disabled-foreground">·</span>
                {project.includeOriginal ? "납품용 원본 포함" : "셀렉용 사진만 전달"}
              </span>
            }
          />
        </PhotographerLightPageFrame>
        </div>
        </div>
      </div>

      {/* 모바일도 전체 폭 진행 바 대신 compact 상태를 유지한다. */}
      {mobileProgressBarMounted && (
        <div
          className="prj-mobile-progress md:hidden"
          style={{
            flexShrink: 0,
            background: SURFACE_1,
            opacity: isUploading || uploadError || showRecoveryBanner || recoveryBusy ? 1 : 0,
            transition: "opacity 200ms ease",
            zIndex: 11,
          }}
        >
          {isUploading && (
            <div style={{ minHeight: 48, padding: "4px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${BORDER}` }} role="status" aria-live="polite">
              {showServerWorking ? (
                <Loader2 size={20} className="shrink-0 animate-spin text-accent" aria-hidden />
              ) : (
                <svg className="prj-upload-ring" viewBox="0 0 20 20" aria-hidden>
                  <circle className="prj-upload-ring-track" cx="10" cy="10" r="8" />
                  <circle className="prj-upload-ring-value" cx="10" cy="10" r="8" strokeDasharray="50.27" strokeDashoffset={50.27 * (1 - Math.min(100, overallProgress) / 100)} />
                </svg>
              )}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: 13, lineHeight: "18px", color: TEXT_BRIGHT }}>{uploadStatusLabel}</strong>
                {uploadSavedLabel ? <span style={{ fontSize: 11, lineHeight: "16px", color: TEXT_MUTED }}>{uploadSavedLabel}</span> : null}
                {uploadEtaLabel && !uploadStopRequested ? <span style={{ fontSize: 11, lineHeight: "16px", color: TEXT_MUTED }}>{uploadEtaLabel}</span> : null}
              </div>
              <button
                type="button"
                onClick={handleStopUpload}
                disabled={uploadStopRequested}
                className="prj-upload-stop"
              >
                {uploadStopRequested ? "중단 중" : "중단"}
              </button>
            </div>
          )}
          {uploadError && (
            <UploadFailureNotice
              message={uploadError}
              failures={uploadFailures}
              expanded={showUploadFailureDetails}
              retryDisabled={isUploading || project.status !== "preparing"}
              onToggle={() => setShowUploadFailureDetails((value) => !value)}
              onRetry={() => startUpload(
                uploadFailures.map(({ file }) => file),
                uploadFailures.map(({ clientUploadId }) => clientUploadId),
              )}
              onDismiss={() => {
                setUploadError(null);
                setUploadFailures([]);
                setShowUploadFailureDetails(false);
              }}
            />
          )}
          {/* ── 이어 업로드 복구 배너 ── */}
          {showRecoveryBanner && pendingRecovery.length > 0 && uploadPhase === "idle" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 14px", background: "rgba(250,192,5,0.1)", borderBottom: `1px solid rgba(250,192,5,0.3)`, flexShrink: 0 }}>
              <AlertTriangle size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--warning)", flex: 1 }}>
                원본 {pendingRecovery.length}장 확인 필요 · 완료된 사진은 다시 보내지 않습니다
              </span>
              {recoveryCachedCount > 0 && (
                <button type="button" disabled={recoveryBusy} onClick={() => recoverOriginalFiles([])}
                  style={{ fontSize: 12, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "4px 8px", borderRadius: 4, flexShrink: 0 }}>
                  {recoveryBusy ? "다시 업로드 중…" : `실패 원본 ${recoveryCachedCount}장 재시도`}
                </button>
              )}
              <label style={{ cursor: "pointer" }}>
                <input
                  ref={recoveryFileInputRef}
                  disabled={recoveryBusy}
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
                <span style={{ fontSize: 12, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                  파일 다시 선택
                </span>
              </label>
              <button type="button" onClick={() => setShowRecoveryBanner(false)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex" }}>
                <X size={12} />
              </button>
            </div>
          )}
          {/* ── 복구 매칭 실패 — 즉시 표시 ── */}
          {unmatchedJobs.length > 0 && (
            <div style={{ padding: "8px 14px", background: "rgba(220,46,47,0.06)", borderBottom: `1px solid rgba(220,46,47,0.2)`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={12} style={{ color: "var(--danger)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                  원본 파일을 찾지 못했습니다 ({unmatchedJobs.length}개)
                </span>
                <button type="button" onClick={() => setUnmatchedJobs([])} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex", marginLeft: "auto" }}>
                  <X size={12} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6, lineHeight: 1.6 }}>
                파일명이 변경되었거나 다른 파일을 선택했을 수 있습니다. 원본 파일명 그대로 다시 선택해 주세요.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {unmatchedJobs.map((j) => (
                  <span key={j.id} style={{ fontSize: 11, background: "rgba(220,46,47,0.1)", color: "var(--danger)", padding: "1px 6px", borderRadius: 3 }}>
                    {j.original_filename ?? "(파일명 없음)"}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ cursor: "pointer" }}>
                  <input
                    ref={retryRecoveryFileInputRef}
                    disabled={recoveryBusy}
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
                  <span style={{ fontSize: 11, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                    다시 파일 선택
                  </span>
                </label>
                <button
                  type="button"
                  style={{ fontSize: 11, color: "var(--danger)", border: "1px solid rgba(220,46,47,0.4)", background: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
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
        <div className="prj-desktop-toolbar">
          <UploadFailureNotice
            message={uploadError}
            failures={uploadFailures}
            expanded={showUploadFailureDetails}
            retryDisabled={isUploading || project.status !== "preparing"}
            onToggle={() => setShowUploadFailureDetails((value) => !value)}
            onRetry={() => startUpload(
              uploadFailures.map(({ file }) => file),
              uploadFailures.map(({ clientUploadId }) => clientUploadId),
            )}
            onDismiss={() => {
              setUploadError(null);
              setUploadFailures([]);
              setShowUploadFailureDetails(false);
            }}
          />
        </div>
      )}

      {/* 데스크톱 원본 복구 배너 (모바일 배너는 mobileProgressBarMounted 블록 내에 표시됨) */}
      {showRecoveryBanner && pendingRecovery.length > 0 && uploadPhase === "idle" && (
        <div className="prj-desktop-toolbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", background: "rgba(250,192,5,0.1)", borderBottom: `1px solid rgba(250,192,5,0.3)`, flexShrink: 0 }}>
          <AlertTriangle size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--warning)", flex: 1 }}>
            원본 {pendingRecovery.length}장 확인 필요 · 완료된 사진은 다시 보내지 않습니다
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 420 }}>
            {pendingRecovery.slice(0, 8).map((j) => (
              <span key={j.id} style={{ fontSize: 11, background: "rgba(250,192,5,0.12)", color: "var(--warning)", padding: "1px 6px", borderRadius: 3 }}>
                {j.original_filename ?? "(파일명 없음)"}
              </span>
            ))}
            {pendingRecovery.length > 8 && (
              <span style={{ fontSize: 11, color: "var(--warning)" }}>외 {pendingRecovery.length - 8}개</span>
            )}
          </div>
          {recoveryCachedCount > 0 && (
                <button type="button" disabled={recoveryBusy} onClick={() => recoverOriginalFiles([])}
                  style={{ fontSize: 12, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "4px 8px", borderRadius: 4, flexShrink: 0 }}>
                  {recoveryBusy ? "다시 업로드 중…" : `실패 원본 ${recoveryCachedCount}장 재시도`}
                </button>
              )}
              <label style={{ cursor: "pointer" }}>
            <input
              ref={recoveryFileInputRefDesktop}
              disabled={recoveryBusy}
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
            <span style={{ fontSize: 12, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
              파일 다시 선택
            </span>
          </label>
          <button type="button" onClick={() => setShowRecoveryBanner(false)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex" }}>
            <X size={12} />
          </button>
        </div>
      )}
      {/* 데스크톱 복구 매칭 실패 배너 */}
      {unmatchedJobs.length > 0 && (
        <div className="prj-desktop-toolbar" style={{ padding: "8px 16px", background: "rgba(220,46,47,0.06)", borderBottom: `1px solid rgba(220,46,47,0.2)`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <AlertTriangle size={12} style={{ color: "var(--danger)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
              원본 파일을 찾지 못했습니다 ({unmatchedJobs.length}개)
            </span>
            <button type="button" onClick={() => setUnmatchedJobs([])} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "flex", marginLeft: "auto" }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6, lineHeight: 1.6 }}>
            파일명이 변경되었거나 다른 파일을 선택했을 수 있습니다. 원본 파일명 그대로 다시 선택해 주세요.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {unmatchedJobs.map((j) => (
              <span key={j.id} style={{ fontSize: 11, background: "rgba(220,46,47,0.1)", color: "var(--danger)", padding: "1px 6px", borderRadius: 3 }}>
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
              <span style={{ fontSize: 11, color: ACCENT, border: `1px solid ${ACCENT}`, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                다시 파일 선택
              </span>
            </label>
            <button
              type="button"
              style={{ fontSize: 11, color: "var(--danger)", border: "1px solid rgba(220,46,47,0.4)", background: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
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

          {displayPhotos.length > 0 && (
            <ProjectAssetWorkspaceToolbar
              ariaLabel="원본 업로드 도구"
              className="prj-desktop-toolbar prj-gallery-toolbar"
              leading={(
                  <div className="prj-gallery-context">
                    <div className="prj-gallery-summary">
                      {photoScopeControl}
                    </div>
                    <div className="prj-gallery-analysis">
                      {/* 업로드 진행 현황은 하단 바로 옮겼다 — 그 자리는 업로드 중엔 어차피
                        * "사진 추가"·초대 버튼이 비활성으로 노는 자리라(§PhotographerFormActionBar),
                        * 같은 정보를 화면 위아래 두 곳에 겹쳐 보여줄 이유가 없다. */}
                      {isUploading ? null : canUploadOriginals(project.status) ? (
                        /* AI 버튼과 유사컷 토글은 **서로 대체하지 않는다**.
                         * 예전에는 삼항으로 갈라 분석이 끝나면 버튼이 토글로 바뀌었는데, 그러면
                         * 분석 이후 AI 진입점이 화면에서 사라져 품질 확인을 시작할 방법이 없었다.
                         * 토글은 "묶어서 볼까"라는 보기 설정이고 버튼은 "분석을 걸까"라는 작업이다. */
                        <>
                          <button
                            type="button"
                            onClick={aiBusy ? handleCancelAiAnalysis : openAiPromptManually}
                            disabled={clipAnalysisTriggering}
                            className={`prj-ai-control${aiBusy ? " prj-ai-control-processing" : " prj-ai-control-idle"}`}
                          >
                            {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            <span>{aiControlLabel}</span>
                          </button>
                          {/* 원본 업로드와 원본 탭이 같은 필터 컴포넌트를 쓴다. 유사컷은 목록을
                            * 좁히는 필터가 아니라 그룹을 대표컷으로 접는 보기 설정이며,
                            * 눈감음·흔들림을 함께 켜면 두 조건은 OR로 적용된다. */}
                          <PhotoAnalysisFilterGroup
                            similarity={showSimilarityToggle ? {
                              count: photoGroups.length,
                              checked: similarityToggleOn,
                              onChange: setSimilarityToggleOn,
                            } : undefined}
                            eyesClosed={qualityCounts.eyesClosed > 0 ? {
                              count: qualityCounts.eyesClosed,
                              checked: qualityFilter.has("eyesClosed"),
                              onChange: () => toggleQualityFilter("eyesClosed"),
                            } : undefined}
                            blurry={qualityCounts.blurry > 0 ? {
                              count: qualityCounts.blurry,
                              checked: qualityFilter.has("blurry"),
                              onChange: () => toggleQualityFilter("blurry"),
                            } : undefined}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
              )}
              actions={(
                  <div className="prj-gallery-query-tools">
                    <FilenameSearchInput
                      value={photoSearch}
                      onChange={setPhotoSearch}
                      className="prj-gallery-search"
                    />
                    <div className="prj-gallery-display-tools">
                      <PhotoSortSelect
                        value={photoSort}
                        onChange={setPhotoSort}
                        options={[
                          { value: "filename-asc", label: "파일명순" },
                          { value: "uploaded-desc", label: "최근 업로드순" },
                          { value: "uploaded-asc", label: "오래된 업로드순" },
                        ]}
                      />
                      <ProjectAssetToolbarViewToggle
                        value={viewMode === "grid" ? "gallery" : "list"}
                        onChange={changePhotoViewMode}
                      />
                    </div>
                  </div>
              )}
            />
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
              {mobilePhotoManageMode ? (
                <>
                  {photoScopeControl}
                  <div data-mobile-photo-manage-mode style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_BRIGHT }}>사진 선택</span>
                    <span
                      aria-label={`${selectedPhotoIds.size.toLocaleString()}장 선택됨`}
                      style={{
                        minWidth: 28,
                        height: 24,
                        padding: "0 8px",
                        borderRadius: 999,
                        background: "rgba(var(--accent-rgb), 0.10)",
                        color: ACCENT,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {selectedPhotoIds.size.toLocaleString()}장
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={exitMobilePhotoManageMode}
                    style={{ minHeight: 44, padding: "0 4px", border: 0, background: "transparent", color: TEXT_NORMAL, fontSize: 13, fontWeight: 600 }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  {displayPhotos.length > 0 ? photoScopeControl : <span />}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                    {showSimilarityToggle && (
                      <button
                        type="button"
                        onClick={() => setSimilarityToggleOn((v) => !v)}
                        className={`prj-similarity-toggle${similarityToggleOn ? " prj-similarity-on" : ""}`}
                        style={{ color: similarityToggleOn ? ACCENT : TEXT_MUTED }}
                      >
                        <span className="prj-similarity-checkbox">
                          {similarityToggleOn && (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--accent-foreground)" strokeWidth={5}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        유사컷 적용
                      </button>
                    )}
                    <ProjectAssetToolbarViewToggle
                      value={viewMode === "grid" ? "gallery" : "list"}
                      onChange={changePhotoViewMode}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* photo grid — 가상 스크롤로 보이는 행만 마운트·이미지 로드 */}
          <div
            ref={photoScrollRef}
            tabIndex={-1}
            aria-label="원본 사진 갤러리"
            onPointerDownCapture={(event) => {
              if (event.target instanceof Element && !event.target.closest("article, button, input, select, a")) {
                event.currentTarget.focus({ preventScroll: true });
              }
            }}
            onScroll={handlePhotoScroll}
            className="prj-scroll prj-photo-scroll-mobile-pad"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain", background: "var(--background)", position: "relative", outline: "none" }}
            onDrop={!mobilePhotoManageMode && !isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDrop : undefined}
            onDragOver={!mobilePhotoManageMode && !isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDragOver : undefined}
            onDragLeave={!mobilePhotoManageMode && !isMobileUploadClient() && photoUploadAllowed && uploadPhase === "idle" ? onDragLeave : undefined}
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
                <p style={{ fontWeight: 600, fontSize: 15, color: ACCENT }}>
                  여기에 파일을 놓으세요
                </p>
              </div>
            )}
            {photosLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>불러오는 중...</span>
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
                  <p style={{ fontWeight: 600, fontSize: 15, color: dragOver ? ACCENT : "var(--muted-foreground)", marginBottom: 6 }}>
                    {project.status === "selecting" ? "고객이 사진을 선택 중입니다" : "사진을 추가할 수 없는 프로젝트입니다"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--subtle-foreground)" }}>
                    고객 초대 전까지 사진을 추가할 수 있습니다
                  </p>
                </div>
              </div>
            ) : displayPhotos.length === 0 && photoUploadAllowed ? (
              <EmptyUploadPanel onBrowse={requestOpenFilePicker} maxPhotos={betaMaxPhotosPerProject} />
            ) : galleryPhotos.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Search size={24} className="text-subtle-foreground" aria-hidden />
                <p className="m-0 text-[15px] font-semibold leading-6 tracking-[-0.45px] text-foreground">{showRecommendedOnly && recommendedPhotoIds.size === 0 ? "아직 추천한 사진이 없습니다" : "검색 결과가 없습니다"}</p>
                <PhotographerLightButton variant="secondary" onClick={() => { setShowRecommendedOnly(false); setPhotoSearch(""); setQualityFilter(new Set()); }}>전체 사진 보기</PhotographerLightButton>
              </div>
            ) : (
              <OriginalPhotoGallery
                scrollRef={photoScrollRef}
                photos={galleryPhotos}
                viewMode={viewMode}
                minCols={isMobile ? 3 : 1}
                mobileMinCols={3}
                mobileGridGap={6}
                mobileSquareMedia
                thumbQueue={thumbQueue}
                onPhotoClick={handleOpenPhotoViewer}
                showQualityBadges
                groupsById={groupsById}
                showSimilarityGroups={similarityToggleOn}
                expandedGroups={expandedGroups}
                onGroupBadgeClick={handleGroupBadgeClick}
                // 데스크톱은 워커 풀로 여러 장을 동시에 압축해 "지금 압축 중인 파일 1장" 하이라이트가
                // 더 이상 의미 없음(모바일은 풀 크기 1이라 기존과 동일하게 단일 하이라이트 유지)
                compressingPhotoId={isMobile && compressingIndex >= 0 && queuedPreviews[compressingIndex] ? queuedPreviews[compressingIndex].tempId : null}
                readonly={isMobile ? !mobilePhotoManageMode : true}
                selectedPhotoIds={selectedPhotoIds}
                onToggleSelected={togglePhotoSelected}
                onDragSelectionChange={!isMobile && photoUploadAllowed && !isUploading && !deletingId ? setSelectedPhotoIds : undefined}
                selectionOnHover={!isMobile && photoUploadAllowed && !isUploading && !deletingId}
                recommendedPhotoIds={recommendedPhotoIds}
                mobileManageMode={isMobile && mobilePhotoManageMode}
                mobileSelectionVisible={isMobile && photoUploadAllowed && !isUploading}
                onPhotoLongPress={isMobile && photoUploadAllowed && !isUploading ? enterMobilePhotoManageMode : undefined}
                compact={isMobile}
                leadingCell={
                  photoUploadAllowed && isMobile && !mobilePhotoManageMode ? (
                    <UploadTile
                      isUploading={isUploading}
                      overallProgress={overallProgress}
                      showServerWorking={showServerWorking}
                      hasPhotos={displayPhotos.length > 0}
                      isPreparing={isPreparingFiles}
                      onClick={requestOpenFilePicker}
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        </section>
      </main>

      {/* ── AI 유사컷 분석 — 초대 링크 활성화와 독립된 별도 트리거 ── */}
      {canUploadOriginals(project.status) && displayPhotos.length > 0 && (
        <div
          className="hidden"
          style={{
            flexShrink: 0,
            background: SURFACE_1,
            borderTop: `1px solid ${BORDER}`,
            padding: "10px 24px",
            display: "none",
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
                border: "1px solid rgba(220,46,47,0.4)",
                borderRadius: 8,
                color: "var(--danger)",
                fontSize: 12, fontWeight: 500,
                cursor: clipAnalysisTriggering ? "not-allowed" : "pointer",
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
                opacity: clipAnalysisTriggering ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} />
              {analysisButtonState.buttonLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Gemini 유사컷 그룹핑 POC — 관리자용 데스크톱 실험 기능 ── */}
      {isAdminTier && canUploadOriginals(project.status) && displayPhotos.length > 0 && (
        <div className="hidden md:block" data-admin-gemini-analysis>
          <GeminiAnalysisPanel projectId={id} photos={photos} />
        </div>
      )}

      {/* 업로드 화면의 주요 행동도 생성·수정 화면과 동일한 공통 하단 액션 영역에서 관리한다.
        * 업로드 중에는 "사진 추가"·초대 버튼 둘 다 어차피 비활성이라(§isUploading), 그 자리에
        * "사진 업로드 중…"이라는 죽은 문구만 있었다 — 그 자리를 실제 진행률로 채운다.
        * 예전엔 이 정보가 갤러리 위 toolbar에도 따로 떠서, 화면 위아래에 같은 걸 두 번
        * 보여주고 있었다(§prj-gallery-analysis). */}
      <PhotographerFormActionBar
        maxWidth={1920}
        className="shrink-0"
        leading={photoSelectionActive ? (
          <p className="text-sm font-bold text-foreground">{selectedPhotoIds.size.toLocaleString()}장 선택됨</p>
        ) : isUploading ? (
          <div className="prj-upload-bottom-status flex items-center gap-3" role="status" aria-live="polite">
            {showServerWorking ? (
              <Loader2 size={22} className="shrink-0 animate-spin text-accent" aria-hidden />
            ) : (
              <svg className="prj-upload-ring" viewBox="0 0 20 20" aria-hidden>
                <circle className="prj-upload-ring-track" cx="10" cy="10" r="8" />
                <circle
                  className="prj-upload-ring-value"
                  cx="10"
                  cy="10"
                  r="8"
                  strokeDasharray="50.27"
                  strokeDashoffset={50.27 * (1 - Math.min(100, overallProgress) / 100)}
                />
              </svg>
            )}
            <div className="prj-upload-compact-copy">
              <strong>{uploadStatusLabel}</strong>
              {uploadSavedLabel ? <span>{uploadSavedLabel}</span> : null}
              {uploadEtaLabel && !uploadStopRequested ? <span>{uploadEtaLabel}</span> : null}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-foreground">
              원본 {M.toLocaleString()}장
              <span className="mx-2 font-medium text-disabled-foreground">·</span>
              셀렉 목표 {N.toLocaleString()}장
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isInviteActive
                ? "고객에게 초대 링크를 공유할 수 있어요."
                : M < N
                  ? `셀렉 요청까지 원본 ${(N - M).toLocaleString()}장이 더 필요해요.`
                  : recommendationHint}
            </p>
          </div>
        )}
        actions={photoSelectionActive ? (<>
          <PhotographerLightButton
            type="button"
            onClick={updateSelectedRecommendations}
            disabled={selectedPhotoIds.size === 0 || recommendationSaving || !!deletingId}
            pending={recommendationSaving}
            pendingLabel="저장 중…"
            className="h-12 w-full px-5 text-[14px] md:w-auto"
          >
            <RecommendationMark size={16} aria-hidden />
            {selectedPhotosAreRecommended ? "작가 추천에서 제외" : "작가 추천으로 지정"}
          </PhotographerLightButton>
          <PhotographerLightButton
            type="button"
            variant="danger"
            onClick={() => setDeleteConfirmTarget({ kind: "selected", count: selectedPhotoIds.size })}
            disabled={selectedPhotoIds.size === 0 || deletingId === "__selected__"}
            className="h-12 w-full px-5 text-[14px] md:w-auto"
          >
            <Trash2 size={16} />
            {selectedPhotoIds.size > 0
              ? `선택한 사진 ${selectedPhotoIds.size.toLocaleString()}장 삭제`
              : "삭제할 사진을 선택하세요"}
          </PhotographerLightButton>
          </>
        ) : isPreviewUploading ? (
          <PhotographerLightButton
            type="button"
            variant="secondary"
            onClick={handleStopUpload}
            disabled={uploadStopRequested}
            className="min-w-[129px]"
          >
            {uploadStopRequested ? "중단 중…" : "업로드 중단"}
          </PhotographerLightButton>
        ) : isOriginalUploading ? (
          <>
            <PhotographerLightButton
              type="button"
              variant="secondary"
              onClick={handleStopUpload}
              disabled={uploadStopRequested}
            >
              {uploadStopRequested ? "중단 중…" : "원본 업로드 중단"}
            </PhotographerLightButton>
            <PhotographerLightButton
              type="button"
              variant="primary"
              onClick={isInviteActive
                ? () => setInviteShareModalOpen(true)
                : () => setSelectionRequestModalOpen(true)}
              disabled={!isInviteActive && (inviteActivating || uploadBlockingInvite || M < N)}
              className="min-w-[129px]"
            >
              {isInviteActive ? (isMobile ? "링크 공유" : "초대 링크 공유") : "셀렉 요청하기"}
            </PhotographerLightButton>
          </>
        ) : (
          <>
            {photoUploadAllowed && displayPhotos.length > 0 ? (
              <PhotographerLightButton
                type="button"
                variant="secondary"
                onClick={requestOpenFilePicker}
                disabled={isPreparingFiles}
              >
                <ImagePlus size={15} />사진 추가
              </PhotographerLightButton>
            ) : null}
            <PhotographerLightButton
              type="button"
              variant={inviteButtonReady ? "primary" : "secondary"}
              onClick={isInviteActive
                ? () => setInviteShareModalOpen(true)
                : () => setSelectionRequestModalOpen(true)}
              disabled={!isInviteActive && (inviteActivating || uploadBlockingInvite || M < N)}
              className="min-w-[129px]"
            >
              {isInviteActive
                ? (isMobile ? "링크 공유" : "초대 링크 공유")
                : inviteActivating
                  ? "처리 중…"
                  : uploadBlockingInvite
                    ? (isMobile ? "업로드 중" : "사진 업로드 중…")
                    : M < N
                      ? "사진 업로드 필요"
                      : "셀렉 요청하기"}
            </PhotographerLightButton>
          </>
        )}
      />

      {isPhotoViewerOpen && activePhoto && viewerFilmstripIndex !== null ? (
        <OriginalPhotoViewer
          photos={viewerFilmstripPhotos}
          headerControls={photoUploadAllowed ? (
            <button type="button" disabled={recommendationSaving} aria-pressed={recommendedPhotoIds.has(activePhoto.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm text-white disabled:opacity-50"
              onClick={() => {
                const nextIds = new Set(recommendedPhotoIds);
                const recommended = recommendedPhotoIds.has(activePhoto.id);
                if (recommended) nextIds.delete(activePhoto.id);
                else nextIds.add(activePhoto.id);
                void saveRecommendations(nextIds, recommended ? "작가 추천에서 제외했습니다." : "작가 추천으로 지정했습니다.");
              }}>
              <RecommendationMark size={16} />
              {recommendedPhotoIds.has(activePhoto.id) ? "추천 제외" : "작가 추천"}
            </button>
          ) : undefined}
          activeIndex={viewerFilmstripIndex}
          onActiveIndexChange={(index) => {
            if (inGroupReview) setGroupReviewIndex(index);
            else setLightboxIndex(index);
          }}
          onClose={handleCloseLightbox}
          onPrevious={inGroupReview
            ? handleGroupReviewPrev
            : () => setLightboxIndex((index) => (index! > 0 ? index! - 1 : viewerOverviewPhotos.length - 1))}
          onNext={inGroupReview
            ? handleGroupReviewNext
            : () => setLightboxIndex((index) => (index! < viewerOverviewPhotos.length - 1 ? index! + 1 : 0))}
          reviewMode={inGroupReview}
          showGroupShortcut
          canToggleGroup={canEnterActiveGroup}
          onToggleGroup={inGroupReview ? handleExitGroupReview : () => handleEnterGroupReview()}
          reviewBar={canUploadOriginals(project.status) ? (
            <div className="flex flex-col text-white">
              <div className="flex min-h-[52px] items-center justify-between gap-4 px-5 py-2 max-md:flex-wrap max-md:gap-2 max-md:px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ImagePlus size={16} aria-hidden className="shrink-0 text-white/70" />
                  <span className="whitespace-nowrap text-[12px] font-semibold">고객 진입 대표</span>
                  <span className="truncate text-[11px] text-white/50">현재 사진을 첫 화면에 사용</span>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                  disabled={coverSaving || project.coverPhotoId === activePhoto.id}
                  onClick={() => void handleSaveEntryCover(activePhoto.id)}
                >
                  {coverSaving
                    ? "저장 중…"
                    : project.coverPhotoId === activePhoto.id
                      ? <><Check size={14} aria-hidden /> 대표 사진</>
                      : "대표 사진으로 설정"}
                </button>
              </div>
              {inGroupReview && groupReviewGroup ? (
                <div className="flex min-h-[48px] items-center justify-between gap-4 border-t border-white/10 px-5 py-2 max-md:px-3">
                  <div className="flex min-w-0 items-center gap-3 max-md:gap-1.5">
                    <button type="button" className="flex items-center gap-1.5 border-0 bg-transparent px-1 py-1.5 text-[13px] font-semibold text-white" onClick={handleExitGroupReview}>
                      <ChevronLeft size={16} aria-hidden /> 전체 사진
                    </button>
                    <span className="whitespace-nowrap text-[12px] leading-[18px] text-white/60">유사컷 {groupReviewMembers.length.toLocaleString()}장</span>
                  </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-white/25 bg-transparent px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                    disabled={groupActionPending !== null || groupReviewGroup.representativePhotoId === activePhoto.id}
                    onClick={() => handleSetRepresentative(activePhoto.id, groupReviewGroup.id)}
                  >
                    {groupReviewGroup.representativePhotoId === activePhoto.id ? <><Check size={14} aria-hidden /> 대표컷</> : "대표컷으로 지정"}
                  </button>
                  <button type="button" className="inline-flex items-center justify-center rounded-md border border-white/25 bg-transparent px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50" disabled={groupActionPending !== null} onClick={() => handleRemoveFromGroup(activePhoto.id)}>
                    묶음에서 제외
                  </button>
                </div>
                </div>
              ) : null}
            </div>
          ) : undefined}
          onThumbnailClick={(photo, index) => {
            if (inGroupReview) setGroupReviewIndex(index);
            else {
              const group = photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
              const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
              if (group && count > 1) handleEnterGroupReview(photo);
              else setLightboxIndex(index);
            }
          }}
          getThumbnailAriaLabel={(photo, index, isActive) => {
            const group = !inGroupReview && photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
            const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
            return group && count > 1
              ? `${photo.originalFilename ?? `${index + 1}번째 사진`} 유사컷 ${count}장 보기`
              : `${index + 1}번째 사진${isActive ? " (현재)" : ""}`;
          }}
          renderThumbnailOverlay={(photo) => {
            const group = !inGroupReview && photo.similarityGroupId ? groupsById.get(photo.similarityGroupId) : undefined;
            const count = group ? (membersByGroup.get(group.id)?.length ?? group.photoCount) : 0;
            const representative = inGroupReview && groupReviewGroup?.representativePhotoId === photo.id;
            const entryCover = project.coverPhotoId === photo.id;
            return <>
              {group && count > 1 ? <span className="absolute bottom-[5px] right-[5px] z-[2] inline-flex h-5 min-w-[25px] items-center justify-center rounded-full border border-white/45 bg-[#111315]/80 px-1.5 text-[10px] font-bold text-white">+{(count - 1).toLocaleString()}</span> : null}
              {representative ? <span className="absolute bottom-0.5 left-0.5 z-[2] rounded-[3px] bg-accent px-1 py-px text-[8px] font-bold text-accent-foreground">대표</span> : null}
              {entryCover ? <span className="absolute left-0.5 top-0.5 z-[2] rounded-[3px] bg-white/90 px-1 py-px text-[8px] font-bold text-[#191918]">진입 대표</span> : null}
            </>;
          }}
        />
      ) : null}

      {/* ── 업로드 완료 → AI 분석 제안 ──
        * 버튼 하나를 눈에 띄게 만드는 대신 **AI가 무엇을 해주는지 목록으로 가르치는** 자리다.
        * 유사컷 버튼은 툴바에서 정렬 드롭다운·뷰 전환기와 폭·높이·테두리·배경이 전부 같아
        * 중립 크롬으로 읽혔고, 품질 확인은 관리자 패널 밖으로 나온 적이 없어 존재 자체가 숨어 있었다.
        * 모달을 닫아도 툴바 버튼은 상시 진입점으로 남는다. */}
      <PhotographerModal
        open={aiPromptOpen}
        onClose={handleDismissAiPrompt}
        maxWidth={412}
        variant="confirmation"
        title="AI가 정리를 도와드릴까요?"
        description={aiPromptSource === "upload"
          ? `원본 ${displayPhotos.length.toLocaleString()}장 업로드가 완료되었습니다.`
          : `이 프로젝트의 원본 ${displayPhotos.length.toLocaleString()}장을 분석합니다.`}
        footer={(
          <div className="flex gap-2">
            <PhotographerLightButton
              type="button"
              variant="secondary"
              onClick={handleSkipAiPrompt}
              size="confirmation"
              className="flex-1"
            >
              건너뛰기
            </PhotographerLightButton>
            <PhotographerLightButton
              type="button"
              variant="primary"
              /* 둘 다 끄면 시작할 게 없다 — 빈 요청을 보내는 대신 버튼을 잠근다 */
              disabled={!aiWantSimilar && !aiWantQuality}
              onClick={() => { void handleStartAiFromPrompt(); }}
              size="confirmation"
              className="flex-1"
            >
              분석 시작
            </PhotographerLightButton>
          </div>
        )}
      >
        <div className="flex flex-col gap-2">
          {([
            {
              checked: aiWantSimilar,
              set: setAiWantSimilar,
              label: "유사컷 묶기",
              desc: "연속 촬영된 비슷한 사진을 자동으로 묶습니다",
              /* 툴바 버튼으로도 열 수 있게 되면서 "이미 한 걸 또 하는 건가?"를 답해줘야 한다.
               * 분석은 캐시가 있어 이미 끝난 사진은 다시 부르지 않으므로, 남은 장수를 그대로 알린다. */
              state: clipAnalysisStatus === "completed" && (clipPending?.pending ?? 0) === 0
                ? "이미 분석 완료"
                : (clipPending?.pending ?? 0) > 0 && (clipPending?.alreadyAnalyzed ?? 0) > 0
                  ? `새 사진 ${clipPending?.pending.toLocaleString()}장 분석`
                  : null,
            },
            {
              checked: aiWantQuality,
              set: setAiWantQuality,
              label: "눈감음·흐림 확인",
              desc: "골라내기 전에 확인할 사진을 미리 표시합니다",
              state: qualityAnalysisStatus === "completed" ? "이미 확인 완료" : null,
            },
          ] as const).map((item) => (
            <label
              key={item.label}
              className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-raised p-4"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.set(e.target.checked)}
                className="mt-[2px] h-4 w-4 flex-none accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-semibold leading-[22px] tracking-[-0.35px] text-foreground">
                  {item.label}
                  {item.state && (
                    <span className="rounded px-1.5 py-px text-[11px] font-medium leading-[16px] tracking-[-0.2px] text-subtle-foreground ring-1 ring-inset ring-border">
                      {item.state}
                    </span>
                  )}
                </span>
                <span className="block text-[13px] font-normal leading-[20px] tracking-[-0.3px] text-muted-foreground">
                  {item.desc}
                </span>
              </span>
            </label>
          ))}
          <p className="m-0 px-1 text-[12px] leading-[18px] tracking-[-0.25px] text-subtle-foreground">
            분석은 백그라운드에서 진행되며 언제든 중단할 수 있어요.
          </p>
        </div>
      </PhotographerModal>

      {/* ── 사진 삭제 확인 — Figma #55798 공용 confirmation pattern ── */}
      <PhotographerConfirmDialog
        open={deleteConfirmTarget !== null}
        onClose={() => { if (!deletingId) setDeleteConfirmTarget(null); }}
        onConfirm={handleConfirmPhotoDelete}
        title={deleteConfirmTarget?.kind === "selected"
          ? `원본 ${deleteConfirmTarget.count.toLocaleString()}장을 삭제할까요?`
          : `“${deleteConfirmTarget?.filename ?? "선택한 사진"}”을 삭제할까요?`}
        description={deleteConfirmTarget?.kind === "selected"
          ? "삭제한 원본은 복구할 수 없어요."
          : "삭제한 원본은 복구할 수 없으며, 필요한 사진은 다시 업로드해야 해요."}
        confirmLabel={deleteConfirmTarget?.kind === "selected" ? "원본 삭제" : "삭제하기"}
        pendingLabel="삭제 중…"
        pending={deletingId !== null}
        tone="danger"
      />

      <PhotographerConfirmDialog
        open={showFlushAllConfirm}
        onClose={() => { if (deletingId !== "__all__") setShowFlushAllConfirm(false); }}
        onConfirm={handleFlushAll}
        title={`원본 ${displayPhotos.length.toLocaleString()}장을 삭제할까요?`}
        description={(
          <>
            <span className="block">삭제한 원본은 복구할 수 없으며,</span>
            <span className="block">필요한 사진은 다시 업로드해야 해요</span>
          </>
        )}
        confirmLabel="삭제하기"
        pendingLabel="삭제 중…"
        pending={deletingId === "__all__"}
        tone="danger"
      />

      {/* toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: isMobile ? "calc(88px + env(safe-area-inset-bottom, 0px))" : 24, left: "50%", transform: "translateX(-50%)", background: "var(--surface-raised)", border: `1px solid ${BORDER_MID}`, padding: "10px 20px", zIndex: 200, fontSize: 13, color: TEXT_BRIGHT, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ── selecting 안내 모달 — 공용 PhotographerModal 재사용 ── */}
      <PhotographerModal
        open={showSelectingWarn}
        onClose={handleSelectingWarnCancel}
        title="원본 사진을 추가할까요?"
        description="고객이 현재 사진을 고르고 있습니다."
        maxWidth={420}
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <PhotographerLightButton type="button" variant="secondary" onClick={handleSelectingWarnCancel} className="flex-1">
              취소
            </PhotographerLightButton>
            <PhotographerLightButton type="button" variant="primary" onClick={handleSelectingWarnConfirm} className="flex-1">
              <ImagePlus size={12} />
              추가하기
            </PhotographerLightButton>
          </div>
        }
      >
        <div className="rounded-xl bg-surface-raised p-4 text-[13px] leading-5 text-muted-foreground">
          추가한 사진은 업로드가 끝나는 즉시 고객 갤러리에 표시됩니다.
        </div>
      </PhotographerModal>

      {/* ── 업로드 확인 모달 — 공용 PhotographerModal 재사용 ── */}
      {pendingFiles.length > 0 && (() => {
        const heicCount = pendingFiles.filter(isHeicFile).length;
        const isMob = isMobileUploadClient();
        const inclOrig = project.includeOriginal;
        const selectedBytes = pendingFiles.reduce((sum, file) => sum + file.size, 0);
        const closeModal = () => setPendingFiles([]);
        return (
          <PhotographerModal
            open
            onClose={closeModal}
            title={`원본 ${pendingFiles.length.toLocaleString()}장을 업로드할까요?`}
            description={!isMob
              ? `총 ${formatUploadBytes(selectedBytes)} · 전송을 시작하면 남은 시간을 안내합니다.`
              : "선택한 원본의 업로드 설정을 확인해 주세요."}
            maxWidth={440}
            footer={
              <div style={{ display: "flex", gap: 8 }}>
                <PhotographerLightButton type="button" variant="secondary" onClick={closeModal} className="flex-1">
                  취소
                </PhotographerLightButton>
                <PhotographerLightButton
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const f = pendingFiles;
                    setPendingFiles([]);
                    startUpload(f);
                  }}
                  disabled={uploadPhase !== "idle"}
                  className="flex-1"
                >
                  <Upload size={12} />
                  업로드 시작
                </PhotographerLightButton>
              </div>
            }
          >
            <div className="flex flex-col gap-4">
              {/* 프로젝트에서 정한 납품 설정은 변경 컨트롤이 아니라 확인용 정보 행으로 표시한다. */}
              <div className="flex min-h-12 items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3">
                <span className="text-[12px] font-medium text-muted-foreground">업로드 설정</span>
                <span className="text-[13px] font-semibold text-foreground">
                  {inclOrig ? "납품용 원본 포함" : "썸네일만 업로드"}
                </span>
              </div>

              {/* Warning만 semantic color를 사용한다. */}
              {heicCount > 0 && inclOrig ? (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  <p className="text-[12px] leading-[18px] text-muted-foreground">
                    HEIC 파일 {heicCount}개는 원본을 포함할 수 없어 썸네일만 업로드됩니다.
                  </p>
                </div>
              ) : null}
            </div>
          </PhotographerModal>
        );
      })()}

      <CustomerInviteShareModal
        open={inviteShareModalOpen}
        onClose={() => setInviteShareModalOpen(false)}
        inviteUrl={inviteUrl}
        accessPin={project.accessPin}
        title="고객 초대 링크가 활성화되었습니다"
        description="카카오톡, 이메일 등으로 아래 링크를 보내주세요. 고객이 사진 셀렉을 시작할 수 있습니다."
        onSavePin={handleSavePin}
      />

      <CustomerSelectionRequestModal
        key={selectionRequestModalOpen ? "selection-request-open" : "selection-request-closed"}
        open={selectionRequestModalOpen}
        onClose={() => setSelectionRequestModalOpen(false)}
        customerName={project.customerName}
        customerPhone={project.customerPhone}
        photoCount={M}
        requiredCount={project.requiredCount}
        recommendedCount={recommendedPhotoIds.size}
        includeOriginal={project.includeOriginal}
        originalUploadInProgress={project.includeOriginal && photos.some((photo) => photo.originalStatus !== "completed")}
        initialDeadline={project.deadline?.slice(0, 10) ?? ""}
        inviteUrl={inviteUrl}
        accessPin={project.accessPin}
        pending={inviteActivating}
        onRequest={handleEnableClientAccess}
        onSavePin={handleSavePin}
      />

      {/* ── EDIT GUIDE MODAL — 공용 PhotographerModal 재사용 ── */}
      <PhotographerModal
        open={showEditGuideModal}
        onClose={() => setShowEditGuideModal(false)}
        title="보정 작업을 먼저 시작해 주세요"
        description="셀렉 결과를 확인하면 보정본 업로드를 시작할 수 있습니다."
        maxWidth={420}
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <PhotographerLightButton type="button" variant="secondary" onClick={() => setShowEditGuideModal(false)} className="flex-1">
              닫기
            </PhotographerLightButton>
            <PhotographerLightButton
              type="button"
              variant="primary"
              onClick={() => { setShowEditGuideModal(false); router.push(`/photographer/projects/${id}/results`); }}
              className="flex-1"
            >
              셀렉 결과 보기<ChevronRight size={12} />
            </PhotographerLightButton>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-xl bg-surface-raised p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success" aria-hidden>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-foreground">셀렉 결과 확인이 필요합니다</p>
            <p className="mt-1 break-keep text-[13px] leading-5 text-muted-foreground">선택 사진과 고객 요청을 확인한 뒤 ‘보정 시작하기’를 눌러주세요.</p>
          </div>
        </div>
      </PhotographerModal>
    </div>
  );
}
