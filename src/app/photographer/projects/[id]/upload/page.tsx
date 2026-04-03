"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Upload,
  Loader2,
  FolderOpen,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  X,
  AlertTriangle,
  Pin,
  RefreshCw,
} from "lucide-react";
import { BETA_MAX_PHOTOS_PER_PROJECT, parseBetaLimitError } from "@/lib/beta-limits";
import { useVirtualizer } from "@tanstack/react-virtual";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import type { Project, Photo } from "@/types";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT, photographerDock } from "@/lib/photographer-theme";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import { compressImageFileForMobileIfNeeded } from "@/lib/upload-client-compress";

/** 모바일 스펙: 넓은 이미지 선택 + HEIC; 필터는 handleFileChange에서 image/ 유지 */
const ACCEPT_TYPES = "image/*,image/heic,image/heif";
/** 로컬·API URL 미설정 시에만 동일 출처 프록시(Next → 백엔드) */
const UPLOAD_PHOTOS_PATH = "/api/photographer/upload/photos";

/** NEXT_PUBLIC_API_URL 이 있으면 브라우저→백엔드 직접 POST (Vercel 프록시 서버리스 타임아웃·본문 제한 회피). 없으면 프록시. */
function uploadPhotosUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/api/upload/photos`;
  return UPLOAD_PHOTOS_PATH;
}

const UPLOAD_MAX_ATTEMPTS = 3;

/** PC와 달리 휴대폰 브라우저는 멀티파트·연결이 불안정한 경우가 많아 1장씩 전송 */
function isPhoneLikeClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  return false;
}

function shouldRetryUploadStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function postPhotosWithRetry(
  url: string,
  buildForm: () => FormData,
  token: string,
): Promise<Response> {
  const crossOrigin = /^https?:\/\//i.test(url);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: buildForm(),
        cache: "no-store",
        mode: crossOrigin ? "cors" : "same-origin",
      });
      if (shouldRetryUploadStatus(res.status)) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt < UPLOAD_MAX_ATTEMPTS) {
          await new Promise<void>((r) => setTimeout(r, 800 * attempt));
          continue;
        }
      }
      return res;
    } catch (e) {
      // 크로스 오리진 TypeError = CORS 거부 → 재시도해도 동일 결과, 즉시 throw
      if (e instanceof TypeError && crossOrigin) throw e;
      lastErr = e;
      if (attempt < UPLOAD_MAX_ATTEMPTS) {
        await new Promise<void>((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * 브라우저→백엔드 직접 POST는 CORS 미설정 시 TypeError로 실패.
 * 첫 CORS 실패 시 useProxyRef.current = true 로 설정해 이후 배치는 프록시만 사용.
 */
async function postPhotosUpload(
  buildForm: () => FormData,
  token: string,
  useProxyRef: { current: boolean },
): Promise<Response> {
  const primary = uploadPhotosUrl();
  if (useProxyRef.current || primary === UPLOAD_PHOTOS_PATH) {
    return postPhotosWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token);
  }
  try {
    return await postPhotosWithRetry(primary, buildForm, token);
  } catch (e) {
    if (e instanceof TypeError) {
      useProxyRef.current = true; // 이후 배치는 프록시 사용
      try {
        return await postPhotosWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token);
      } catch {
        /* 원인 파악용으로 최초 오류 유지 */
      }
    }
    throw e;
  }
}

function isUploadNetworkFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    return e.name === "NetworkError";
  }
  return false;
}

function uploadConnectionErrorMessage(): string {
  if (isPhoneLikeClient()) {
    return "업로드 연결이 끊어졌습니다. Wi‑Fi로 바꾸거나 화면을 켜 둔 채로 다시 시도해 주세요. 많은 장수는 나눠 올리면 더 안정적입니다.";
  }
  return "업로드에 실패했습니다. 인터넷 연결을 확인해 주세요. 계속되면 Railway의 ALLOWED_ORIGINS에 이 사이트 URL을 추가했는지 확인해 주세요.";
}
const INITIAL_VISIBLE = 40;
const LOAD_MORE       = 40;
const BATCH_SIZE = 5;
const PC_CONCURRENCY = 3; // PC: 동시에 처리할 배치 수 (3배치 병렬 → 약 3배 속도 향상)

const VIEW_CONFIG = {
  filename: { cols: 1, rowH: 32  },  // 파일명+사이즈 텍스트 리스트
  gallery:  { cols: 8, rowH: 110 },  // 8열 이미지 그리드 + 파일명
} as const;
type ViewMode = keyof typeof VIEW_CONFIG;

function logUploadTokenDebug(scope: string, token: string | null | undefined) {
  const tokenStr = token ?? "";
  const dotCount  = (tokenStr.match(/\./g) ?? []).length;
  console.log(`[auth:${scope}] token_source=session.access_token`, {
    hasToken: Boolean(tokenStr), isJwtLike: dotCount === 2,
    tokenPreview: tokenStr ? `${tokenStr.slice(0, 20)}...` : "(empty)",
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      background: C.surface2, border: `1px solid ${C.borderMd}`, borderRadius: 10,
      padding: "10px 20px", fontSize: 13, color: C.text, zIndex: 9999,
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {message}
    </div>
  );
}

// ── 확인 모달 ──────────────────────────────────────────────────────────────
function ConfirmModal({
  title, desc, confirmLabel, onConfirm, onCancel, loading, danger = false,
}: {
  title: string; desc: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean; danger?: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${danger ? "rgba(255,71,87,0.2)" : C.borderMd}`,
        borderRadius: 14, padding: "28px 28px 24px", maxWidth: 400, width: "100%", margin: "0 16px",
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>{title}</div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>{desc}</p>
        <div className="up-modal-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={loading} style={{
            padding: "8px 16px", background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.muted, fontSize: 13, cursor: "pointer",
            fontFamily: PS_FONT,
          }}>취소</button>
          <button type="button" onClick={onConfirm} disabled={loading} style={{
            padding: "8px 18px",
            background: danger ? "rgba(255,71,87,0.15)" : C.steel,
            border: danger ? "1px solid rgba(255,71,87,0.35)" : "none",
            borderRadius: 8, color: danger ? C.red : "white",
            fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: PS_FONT,
          }}>
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 지연 로딩 썸네일 ────────────────────────────────────────────────────────
function LazyThumb({
  photo, index, isReadOnly, deleting, onDelete, onClick, isEditMode = false, squareThumb = false,
}: {
  photo: Photo; index: number; isReadOnly: boolean;
  deleting: boolean; onDelete: () => void; onClick: () => void; isEditMode?: boolean;
  /** 모바일 갤러리: 1:1 비율 */
  squareThumb?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const filename = photo.originalFilename ?? `${index + 1}`;
  return (
    <div
      className="up-thumb"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}
      onClick={onClick}
    >
      {/* 이미지 영역 */}
      <div style={{
        aspectRatio: squareThumb ? "1 / 1" : "3 / 2", background: C.surface2, borderRadius: 5,
        position: "relative", overflow: "hidden",
        border: `1px solid ${C.border}`, transition: "border-color 0.15s",
      }}>
        <div style={{
          position: "absolute", inset: 0, background: C.surface2,
          transition: "opacity 0.25s", opacity: loaded ? 0 : 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <ImageIcon size={10} color={C.dim} style={{ opacity: 0.3 }} />
        </div>
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          onLoad={(e) => { setLoaded(true); (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
          style={{
            width: "100%", height: "100%", objectFit: "cover", display: "block",
            opacity: 0, transition: "opacity 0.25s",
          }}
        />
        {!isReadOnly && (
          <button
            className={isEditMode ? "up-thumb-del up-thumb-del-active" : "up-thumb-del"}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            style={{
              position: "absolute", top: 3, right: 3,
              width: 20, height: 20, borderRadius: "50%",
              background: "rgba(255,71,87,0.85)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "white", opacity: 0, cursor: "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {deleting
              ? <Loader2 size={8} style={{ animation: "spin 1s linear infinite" }} />
              : <X size={12} strokeWidth={2.5} />}
          </button>
        )}
      </div>
      {/* 파일명 */}
      <div style={{
        fontSize: 9, color: C.muted, lineHeight: 1.3, textAlign: "center",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        padding: "0 2px",
      }}>
        {filename}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;
  const fileInputRef       = useRef<HTMLInputElement>(null);
  const thumbScrollRef     = useRef<HTMLDivElement>(null);
  const stopRequestedRef   = useRef(false);
  const useProxyRef        = useRef(false);

  // ── 데이터 상태 ──
  const [project,  setProject]  = useState<Project | null>(null);
  const [photos,   setPhotos]   = useState<Photo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // ── 업로드 상태 ──
  const [files,          setFiles]          = useState<File[]>([]);
  const [dragOver,       setDragOver]       = useState(false);
  const [uploadPhase,    setUploadPhase]    = useState<"idle"|"sending"|"processing"|"done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [batchProgress,  setBatchProgress]  = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [stopRequested,  setStopRequested]  = useState(false);
  const [uploadSummary,  setUploadSummary]  = useState<{ total: number; succeeded: number; failedFiles: File[] } | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);

  // ── 모바일 상태 ──
  const [isMobile,       setIsMobile]       = useState(false);
  const [isEditMode,     setIsEditMode]     = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

  // ── UI 상태 ──
  const [deletingId,          setDeletingId]          = useState<string | null>(null);
  const [showDeleteAllModal,  setShowDeleteAllModal]  = useState(false);
  const [deleteAllSubmitting, setDeleteAllSubmitting] = useState(false);
  const [showInviteModal,     setShowInviteModal]     = useState(false);
  const [inviteSubmitting,    setInviteSubmitting]    = useState(false);
  const [lightboxIndex,       setLightboxIndex]       = useState<number | null>(null);
  const [pendingFiles,        setPendingFiles]        = useState<File[]>([]);
  const [viewMode,            setViewMode]            = useState<ViewMode>("filename");

  // ── 가상 스크롤 ──────────────────────────────────────────────────────────
  const { cols: baseCols, rowH: baseRowH } = VIEW_CONFIG[viewMode];
  const effectiveCols = viewMode === "gallery" && isMobile ? 3 : baseCols;
  /** 모바일 갤러리 1:1 + 파일명 줄: 가상행 높이 여유. 파일명 리스트는 터치 행 높이(44px)에 맞춤 */
  const effectiveRowH =
    viewMode === "gallery" && isMobile ? 148
    : viewMode === "filename" && isMobile ? 44
    : baseRowH;

  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount],
  );
  const rowCount = Math.ceil(visiblePhotos.length / effectiveCols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => thumbScrollRef.current,
    estimateSize: () => effectiveRowH,
    overscan: 3,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  /** 라이트박스 닫은 뒤 갤러리 가상행으로 스크롤 복귀 */
  const pendingGalleryScrollPhotoIndexRef = useRef<number | null>(null);

  const closeLightbox = useCallback(() => {
    setLightboxIndex((cur) => {
      if (cur !== null) pendingGalleryScrollPhotoIndexRef.current = cur;
      return null;
    });
  }, []);

  // ── 라이트박스 키보드 ──
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
      else if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length));
      else if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length, closeLightbox]);

  useLayoutEffect(() => {
    if (lightboxIndex !== null) return;
    const photoIdx = pendingGalleryScrollPhotoIndexRef.current;
    if (photoIdx == null || photos.length === 0) return;

    const cols = effectiveCols;
    const needVisible = Math.min(photoIdx + cols + 4, photos.length);
    if (visibleCount < needVisible) {
      setVisibleCount(needVisible);
      return;
    }

    pendingGalleryScrollPhotoIndexRef.current = null;
    const rowIdx = Math.floor(photoIdx / cols);
    const v = rowVirtualizerRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        v.scrollToIndex(rowIdx, { align: "center" });
      });
    });
  }, [lightboxIndex, visibleCount, photos.length, effectiveCols, viewMode, rowCount]);

  const loadProject = useCallback(async () => {
    try {
      const p = await getProjectById(id);
      setProject(p);
      if (!p) setError("프로젝트를 찾을 수 없습니다.");
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트 정보를 불러오지 못했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPhotos = useCallback(async () => {
    try { setPhotos(await getPhotosByProjectId(id)); } catch {}
  }, [id]);

  useEffect(() => {
    loadProject().then((p) => { if (p) loadPhotos(); });
  }, [id, loadProject, loadPhotos]);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (isMobile) setViewMode("gallery");
  }, [isMobile]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /** 업로드 중 탭 닫기/새로고침 시 브라우저 기본 확인(모바일 포함) — 진행 중 전송 손실 방지 */
  useEffect(() => {
    const uploading = uploadPhase === "sending" || uploadPhase === "processing";
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploadPhase]);

  // ── 무한 스크롤 ──────────────────────────────────────────────────────────
  const handleThumbScroll = useCallback(() => {
    const el = thumbScrollRef.current;
    if (!el) return;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 200 &&
      visibleCount < photos.length
    ) {
      setVisibleCount((prev) => Math.min(prev + LOAD_MORE, photos.length));
    }
  }, [visibleCount, photos.length]);

  // ── 업로드 (PC: 3배치 동시 처리 / 모바일: 1장씩 순차) ──────────────
  const startUpload = useCallback(async (uploadFiles: File[]) => {
    if (!uploadFiles.length) return;
    setFiles(uploadFiles);
    setError(null);
    setUploadPhase(isPhoneLikeClient() ? "processing" : "sending");
    setUploadProgress(0);
    setProcessedCount(0);
    setUploadSummary(null);
    setStopRequested(false);
    stopRequestedRef.current = false;
    useProxyRef.current = false;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const token = session?.access_token;
    logUploadTokenDebug("v1-upload/photos", token);
    if (userError || !user) { setError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); return; }
    if (!token) { setError("로그인이 필요합니다."); setUploadPhase("idle"); return; }

    let currentToken = token;

    let filesToUpload = uploadFiles;
    let wasStopped = false;

    // 모바일만: 브라우저에서 해상도·용량 줄여 전송 실패·지연 완화 (PC는 원본 유지)
    if (isPhoneLikeClient()) {
      const compressed: File[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        if (stopRequestedRef.current) {
          wasStopped = true;
          break;
        }
        compressed.push(await compressImageFileForMobileIfNeeded(uploadFiles[i]));
        setProcessedCount(i + 1);
        setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
      }
      if (wasStopped) {
        setUploadPhase("idle");
        setUploadProgress(0);
        setProcessedCount(0);
        setFiles([]);
        setToast("업로드가 중지됐습니다. 언제든 이어서 업로드할 수 있어요.");
        loadProject();
        loadPhotos();
        router.refresh();
        return;
      }
      filesToUpload = compressed;
      setFiles(filesToUpload);
    }

    setUploadPhase("sending");
    setUploadProgress(0);
    setProcessedCount(0);

    // 휴대폰: 한 요청에 여러 장이 불안정 → 1장씩. PC는 5장 배치 유지.
    const effectiveBatchSize = isPhoneLikeClient() ? 1 : BATCH_SIZE;
    const batches: File[][] = [];
    for (let i = 0; i < filesToUpload.length; i += effectiveBatchSize) {
      batches.push(filesToUpload.slice(i, i + effectiveBatchSize));
    }
    setBatchProgress({ current: 0, total: batches.length });

    let totalUploaded = 0;
    const allFailed: File[] = [];
    wasStopped = false;
    let completedBatches = 0;
    let abortReason: "betaLimit" | "network" | null = null;
    let abortMessage = "";
    const concurrency = isPhoneLikeClient() ? 1 : PC_CONCURRENCY;

    for (let chunkStart = 0; chunkStart < batches.length; chunkStart += concurrency) {
      if (stopRequestedRef.current) { wasStopped = true; break; }
      if (abortReason) break;

      // 모바일: 20배치마다 세션 갱신
      if (isPhoneLikeClient() && chunkStart > 0 && chunkStart % 20 === 0) {
        await supabase.auth.refreshSession();
        const { data: { session: fresh } } = await supabase.auth.getSession();
        if (fresh?.access_token) currentToken = fresh.access_token;
      }

      const chunk = batches.slice(chunkStart, Math.min(chunkStart + concurrency, batches.length));
      setBatchProgress({ current: chunkStart + 1, total: batches.length });
      setUploadProgress(Math.round((chunkStart / batches.length) * 100));

      await Promise.all(chunk.map(async (batch) => {
        if (abortReason) { allFailed.push(...batch); return; }

        const buildForm = () => {
          const form = new FormData();
          form.append("project_id", id);
          batch.forEach((f) => form.append("files", f));
          return form;
        };

        try {
          let res = await postPhotosUpload(buildForm, currentToken, useProxyRef);
          if (res.status === 401) {
            await supabase.auth.refreshSession();
            const { data: { session: after401 } } = await supabase.auth.getSession();
            if (after401?.access_token) {
              currentToken = after401.access_token;
              res = await postPhotosUpload(buildForm, currentToken, useProxyRef);
            }
          }

          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            totalUploaded += data.uploaded ?? batch.length;
          } else {
            try {
              const b = await res.json();
              const betaErr = parseBetaLimitError(b);
              if (betaErr) { abortReason = "betaLimit"; abortMessage = betaErr.message; return; }
            } catch {}
            allFailed.push(...batch);
          }
        } catch (e) {
          if (isUploadNetworkFailure(e)) { abortReason = "network"; return; }
          allFailed.push(...batch);
        }

        completedBatches++;
        setUploadProgress(Math.round((completedBatches / batches.length) * 100));
        setBatchProgress({ current: completedBatches, total: batches.length });
        setProcessedCount(Math.min(completedBatches * effectiveBatchSize, filesToUpload.length));
      }));
    }

    if (abortReason === "betaLimit") {
      setError(abortMessage);
      setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
      return;
    }
    if (abortReason === "network") {
      setError(uploadConnectionErrorMessage());
      setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
      return;
    }

    if (wasStopped) {
      setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
      setToast("업로드가 중지됐습니다. 언제든 이어서 업로드할 수 있어요.");
      loadProject(); loadPhotos(); router.refresh();
    } else {
      setUploadSummary({ total: filesToUpload.length, succeeded: totalUploaded, failedFiles: allFailed });
      setUploadPhase("done");
      fetch("/api/photographer/project-logs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "uploaded" }),
      }).catch(() => {});
      setTimeout(() => {
        setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
        if (allFailed.length === 0) setToast("업로드 완료!");
        loadProject(); loadPhotos(); router.refresh();
      }, 800);
    }
  }, [id, loadProject, loadPhotos, router]);

  const handleStopUpload = useCallback(() => {
    stopRequestedRef.current = true;
    setStopRequested(true);
  }, []);

  // ── 드래그&드롭 ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const list = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("image/") || f.type === ""
    );
    setError(null);
    if (list.length) setPendingFiles(list);
  }, []);

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    const list = Array.from(chosen).filter((f) => f.type.startsWith("image/") || f.type === "");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (list.length) setPendingFiles(list);
  };

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingId(photoId);
    try {
      const res  = await fetch(`/api/photographer/photos/${photoId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setProject((prev) => prev ? { ...prev, photoCount: Math.max(0, prev.photoCount - 1) } : null);
      setToast("삭제되었습니다.");
    } catch (e) { setToast(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setDeletingId(null); }
  };

  const handleDeleteAll = async () => {
    setDeleteAllSubmitting(true);
    try {
      const res  = await fetch(`/api/photographer/projects/${id}/photos`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "전체 삭제 실패");
      setShowDeleteAllModal(false); setPhotos([]);
      setProject((prev) => prev ? { ...prev, photoCount: 0 } : null);
      setToast("전체 삭제되었습니다.");
    } catch (e) { setToast(e instanceof Error ? e.message : "전체 삭제 실패"); }
    finally { setDeleteAllSubmitting(false); }
  };

  const handleInviteActivate = async () => {
    setInviteSubmitting(true);
    try {
      const res  = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selecting" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "상태 변경 실패");
      setShowInviteModal(false); router.push(`/photographer/projects/${id}`);
    } catch (e) { setToast(e instanceof Error ? e.message : "상태 변경 실패"); }
    finally { setInviteSubmitting(false); }
  };

  // ── 로딩/에러 ──
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 8 }}>
        <Loader2 size={20} color={C.muted} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13, color: C.muted }}>로딩 중...</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
      </div>
    );
  }
  if (!project) {
    return (
      <div style={{ padding: 28, color: C.muted, fontSize: 13 }}>
        {error ?? "프로젝트를 찾을 수 없습니다."}
      </div>
    );
  }

  // ── 계산값 ──
  const M = project.photoCount;
  const N = project.requiredCount;
  const photoCountExpected: number | null = (project as unknown as Record<string, unknown>).photoCountExpected as number ?? null;
  const remaining    = photoCountExpected !== null ? Math.max(0, photoCountExpected - M) : null;
  const isReady      = M >= N;
  const isReadOnly   = project.status !== "preparing";
  const isUploading  = uploadPhase === "sending" || uploadPhase === "processing";
  const isAtPhotoLimit = M >= BETA_MAX_PHOTOS_PER_PROJECT;
  const isPhotoLimitNear = !isAtPhotoLimit && M >= Math.floor(BETA_MAX_PHOTOS_PER_PROJECT * 0.9);

  const deadlineDays   = differenceInCalendarDays(new Date(project.deadline), new Date());
  const deadlineText   = `${project.deadline} (D+${deadlineDays})`;
  const deadlineUrgent = deadlineDays >= 0 && deadlineDays <= 3;

  const progressPct = photoCountExpected && photoCountExpected > 0
    ? Math.min(100, Math.round((M / photoCountExpected) * 100))
    : N > 0 ? Math.min(100, Math.round((M / N) * 100)) : 0;

  const infoRows = [
    { key: "프로젝트",  val: project.name,          color: "" },
    { key: "고객",      val: project.customerName,  color: "" },
    { key: "촬영일",    val: project.shootDate,      color: "" },
    { key: "셀렉 기한", val: deadlineText,           color: deadlineUrgent ? C.orange : "" },
    { key: "셀렉 갯수", val: `${N}장`,               color: C.steel },
  ];

  return (
    <div className="up-upload-root" style={{
      display: "flex", flexDirection: "column", height: "100vh",
      fontFamily: PS_FONT,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(5px);} to{opacity:1;transform:translateY(0);} }
        .up-section-stack { display: flex; flex-direction: column; }
        @media (min-width: 769px) {
          .up-o-readonly { order: 10; }
          .up-o-info { order: 20; }
          .up-o-stats { order: 30; }
          .up-o-upload { order: 40; }
          .up-o-progress { order: 50; }
          .up-o-done { order: 60; }
          .up-o-error { order: 70; }
          .up-o-summary { order: 80; }
          .up-o-header { order: 90; }
        }
        @media (max-width: 768px) {
          .up-o-readonly { order: 10; }
          .up-o-stats { order: 20; }
          .up-o-upload { order: 30; }
          .up-o-progress { order: 40; }
          .up-o-done { order: 50; }
          .up-o-error { order: 60; }
          .up-o-summary { order: 70; }
          .up-o-info { order: 80; }
          .up-o-header { order: 90; }
        }
        .up-dropzone:hover { border-color: ${C.steel} !important; background: rgba(79,126,255,0.05) !important; }
        .up-thumb:hover .up-thumb-del { opacity: 1 !important; }
        .up-thumb:hover { border-color: ${C.borderMd} !important; }
        .thumb-scroll::-webkit-scrollbar { width: 4px; }
        .thumb-scroll::-webkit-scrollbar-track { background: transparent; }
        .thumb-scroll::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 2px; }
        .fn-row:hover { background: rgba(79,126,255,0.05); }
        .fn-row:hover span:last-child { opacity: 1 !important; }
        .up-thumb-del-active { opacity: 1 !important; }
        .up-gallery-row { gap: 6px; padding-bottom: 6px; }
        @media (max-width: 768px) {
          .up-stats-num { font-size: 22px !important; }
          .up-stats-label { font-size: 11px !important; }
          .up-gallery-row { gap: 4px; padding-bottom: 4px; }
          .up-mobile-file-list { max-height: 120px; overflow-y: auto; margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: rgba(0,0,0,0.2); }
          .up-mobile-file-list > div { font-size: 11px; color: ${C.muted}; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .up-desktop-only { display: none !important; }
          .up-mobile-only { display: flex !important; }
          .up-action-bar {
            left: 0 !important;
            padding: 12px 16px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .up-action-bar > div:first-child { width: 100%; }
          .up-invite-btn { width: 100% !important; height: 48px !important; justify-content: center !important; flex: none !important; min-height: 48px !important; }
          .up-info-rows { display: none !important; }
          .up-info-rows.expanded { display: flex !important; flex-wrap: wrap !important; }
          .up-info-toggle { display: flex !important; min-height: 44px; }
          .up-mobile-edit-ctrl { display: flex !important; min-height: 44px; padding: 8px 14px !important; }
          .up-section-header { padding: 4px 0 8px; border-top: none !important; margin-top: 8px !important; }
          .up-m-touch { min-height: 44px; }
          .up-view-toggle button { min-height: 44px; padding-left: 12px !important; padding-right: 12px !important; }
          .up-upload-root { overflow-x: hidden; max-width: 100%; box-sizing: border-box; }
          .up-upload-body { min-width: 0; overflow-x: hidden; }
          .up-section-stack { padding-left: 12px !important; padding-right: 12px !important; box-sizing: border-box; }
          .thumb-scroll {
            overflow-x: hidden !important;
            box-sizing: border-box;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .up-gallery-row { width: 100%; min-width: 0; }
          .up-empty-photos { padding-left: 12px !important; padding-right: 12px !important; }
          /* 터치: 주요 버튼 최소 44px (썸네일·파일명줄 삭제는 별도) */
          .up-upload-root button:not(.up-thumb-del):not(.up-fn-del) {
            min-height: 44px;
            box-sizing: border-box;
          }
          .up-fn-del {
            min-height: 44px;
            min-width: 44px;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
          }
          /* 하단 고정 바: CTA 48px + 홈 인디케이터 여백 */
          .up-action-bar {
            padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          }
          /* 확인·업로드 확인 모달: 세로 풀폭 */
          .up-modal-actions,
          .up-pending-actions {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .up-modal-actions button,
          .up-pending-actions button {
            width: 100% !important;
            justify-content: center !important;
            min-height: 44px !important;
          }
        }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, flexShrink: 0, ...photographerDock.bottomEdge,
        display: "flex", alignItems: "center", gap: 12, padding: "0 24px",
        background: "rgba(13,30,40,0.85)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
          type="button"
          className="up-m-touch"
          onClick={() => router.push(`/photographer/projects/${id}`)}
          style={{
            display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
            borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, fontSize: 12, cursor: "pointer",
            fontFamily: PS_FONT,
          }}
        >
          <ChevronLeft size={13} /> 프로젝트 상세로
        </button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>사진 업로드</div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {project.name}{project.customerName ? ` · ${project.customerName}` : ""}
          </div>
        </div>
      </div>

      {/* ── 단일 컬럼 본문 ── */}
      <div className="up-upload-body" style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── 상단 고정 섹션 (순서: 데스크탑=기존 / 모바일=통계→업로드→진행→정보→헤더) ── */}
        <div className="up-section-stack" style={{ flexShrink: 0, padding: "16px 24px 0", boxSizing: "border-box", minWidth: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {isReadOnly && (
            <div className="up-o-readonly" style={{
              marginBottom: 12, padding: "9px 14px", borderRadius: 8,
              background: "rgba(79,126,255,0.06)", border: `1px solid ${C.borderMd}`,
              fontSize: 12, color: C.muted,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Pin size={14} color={C.steel} style={{ flexShrink: 0 }} />
              고객 셀렉이 시작되어 사진 수정이 불가합니다.
            </div>
          )}

          <div className="up-o-info">
            <button
              type="button"
              className="up-info-toggle"
              onClick={() => setIsInfoExpanded((v) => !v)}
              style={{
                display: "none", width: "100%", alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px", marginBottom: 6,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, cursor: "pointer",
                color: C.muted, fontSize: 12,
                fontFamily: PS_FONT,
              }}
            >
              <span>프로젝트 정보</span>
              {isInfoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <div
              className={`up-info-rows${isInfoExpanded ? " expanded" : ""}`}
              style={{
                display: "flex", gap: 0, alignItems: "center", flexWrap: "wrap",
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, marginBottom: 12, overflow: "hidden",
              }}
            >
              {infoRows.map(({ key, val, color }, i) => (
                <div key={key} style={{
                  display: "flex", gap: 6, alignItems: "center",
                  padding: "8px 16px",
                  borderRight: i < infoRows.length - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <span style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap" }}>{key}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: color || C.text, whiteSpace: "nowrap" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 통계 3분할 */}
          <div className="up-o-stats" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 12,
            animation: "fadeUp 0.3s ease 0.05s both",
          }}>
            {[
              { num: M,                                    label: "업로드됨", color: C.steel  },
              { num: photoCountExpected ?? "-",            label: "예정 수",  color: C.orange },
              { num: remaining !== null ? remaining : "-", label: "남은 수",  color: C.muted  },
            ].map((s, i) => (
              <div key={i} style={{
                background: C.surface, padding: "12px 16px", textAlign: "center",
                borderRadius: 10, border: `1px solid ${C.hairline}`,
              }}>
                <div className="up-stats-num" style={{
                  fontFamily: PS_DISPLAY,
                  fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3, color: s.color,
                }}>{s.num}</div>
                <div className="up-stats-label" style={{ fontSize: 10, color: C.dim }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 드롭존 / 모바일 큰 버튼 */}
          {!isReadOnly && (
            <div className="up-o-upload">
              {isAtPhotoLimit ? (
                <div style={{
                  padding: "14px 18px", borderRadius: 10, marginBottom: 12,
                  background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.2)",
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 12, color: C.red,
                }}>
                  <AlertCircle size={15} />
                  베타 기간 최대 업로드 수({BETA_MAX_PHOTOS_PER_PROJECT}장)에 도달했습니다.
                  <span style={{ marginLeft: "auto", color: C.muted, fontWeight: 500 }}>
                    {M} / {BETA_MAX_PHOTOS_PER_PROJECT}
                  </span>
                </div>
              ) : (
                <>
                  <div
                    className="up-dropzone up-desktop-only"
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    onDrop={isUploading ? undefined : onDrop}
                    onDragOver={isUploading ? undefined : onDragOver}
                    onDragLeave={onDragLeave}
                    style={{
                      border: `2px dashed ${dragOver ? C.steel : C.borderMd}`,
                      borderRadius: 10, padding: "18px 20px",
                      cursor: isUploading ? "default" : "pointer",
                      background: dragOver ? "rgba(79,126,255,0.05)" : "rgba(79,126,255,0.02)",
                      marginBottom: 12, transition: "all 0.2s",
                      opacity: isUploading ? 0.5 : 1,
                      animation: "fadeUp 0.3s ease 0.1s both",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                      <FolderOpen size={20} color={C.dim} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>
                          사진을 드래그하거나 클릭해서 선택
                        </div>
                        <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                          JPEG · PNG · WebP · HEIC · 최대 20MB/장
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (!isUploading) fileInputRef.current?.click(); }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "7px 14px", background: C.steel, color: "white",
                          border: "none", borderRadius: 7, fontSize: 12, fontWeight: 500,
                          cursor: "pointer", flexShrink: 0,
                          fontFamily: PS_FONT,
                        }}
                      >
                        <Upload size={12} /> 파일 선택
                      </button>
                    </div>
                    <div style={{
                      marginTop: 10, textAlign: "right",
                      fontSize: 11,
                      color: isPhotoLimitNear ? C.orange : C.dim,
                    }}>
                      {M} / {BETA_MAX_PHOTOS_PER_PROJECT}장 (베타 한도)
                    </div>
                  </div>

                  <div className="up-mobile-only" style={{
                    display: "none", flexDirection: "column", gap: 6, marginBottom: 12,
                  }}>
                    <button
                      type="button"
                      className="up-m-touch"
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      disabled={isUploading}
                      style={{
                        height: 56, width: "100%", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 10,
                        background: isUploading ? C.surface3 : C.steel,
                        border: "none", borderRadius: 10,
                        color: isUploading ? C.dim : "white",
                        fontSize: 15, fontWeight: 600,
                        cursor: isUploading ? "default" : "pointer",
                        fontFamily: PS_FONT,
                      }}
                    >
                      <Upload size={18} />
                      사진 선택하기
                    </button>
                    <div style={{ fontSize: 11, color: C.dim, textAlign: "center" }}>
                      카메라롤에서 여러 장 선택 가능
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 업로드 진행 표시 */}
          {isUploading && files.length > 0 && (
            <div className="up-o-progress" style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "12px 16px", marginBottom: 12,
              animation: "fadeUp 0.25s ease both",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={13} color={C.steel} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>
                    {uploadPhase === "processing"
                      ? `이미지 최적화 중 ${processedCount} / ${files.length}장`
                      : `업로드 중 ${processedCount} / ${files.length}장`}
                  </span>
                  {uploadPhase === "sending" && batchProgress.total > 0 && (
                    <span style={{ fontSize: 11, color: C.dim }}>
                      (배치 {batchProgress.current}/{batchProgress.total})
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{uploadProgress}%</span>
                  {(uploadPhase === "sending" || uploadPhase === "processing") && (
                    stopRequested ? (
                      <span style={{ fontSize: 11, color: C.orange }}>중지 요청됨...</span>
                    ) : (
                      <button
                        type="button"
                        className="up-m-touch"
                        onClick={handleStopUpload}
                        style={{
                          padding: "6px 12px", fontSize: 11, cursor: "pointer",
                          background: "transparent", border: `1px solid ${C.borderMd}`,
                          borderRadius: 5, color: C.muted, fontFamily: PS_FONT,
                        }}
                      >
                        {uploadPhase === "processing" ? "최적화 중지" : "업로드 중지"}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div style={{ height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: C.steel, borderRadius: 2,
                  width: `${uploadProgress}%`,
                  transition: "width 0.3s",
                }} />
              </div>
              {isMobile && (
                <div className="up-mobile-file-list">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} title={f.name}>{f.name}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {uploadPhase === "done" && (
            <div className="up-o-done" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.green, marginBottom: 10 }}>
              <CheckCircle2 size={15} /> 업로드 완료!
            </div>
          )}

          {error && (
            <div className="up-o-error" style={{
              padding: "9px 14px", borderRadius: 8, marginBottom: 10,
              background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)",
              fontSize: 12, color: C.red,
            }}>
              {error}
            </div>
          )}

          {/* 업로드 실패 파일 요약 */}
          {uploadSummary && uploadSummary.failedFiles.length > 0 && uploadPhase === "idle" && (
            <div className="up-o-summary" style={{
              padding: "14px 16px", borderRadius: 10, marginBottom: 12,
              background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.28)",
              fontSize: 12,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={18} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, color: C.orange, marginBottom: 4 }}>
                    {uploadSummary.succeeded > 0
                      ? `일부만 완료 · 성공 ${uploadSummary.succeeded}장 · 실패 ${uploadSummary.failedFiles.length}장`
                      : `업로드 실패 ${uploadSummary.failedFiles.length}장`}
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                    아래 파일만 다시 보냅니다. 네트워크가 불안정하면 Wi‑Fi로 바꾼 뒤 재시도해 주세요.
                  </p>
                </div>
              </div>
              <div style={{
                maxHeight: 120, overflowY: "auto", marginBottom: 12,
                borderRadius: 6, background: "rgba(0,0,0,0.12)", padding: "8px 10px",
              }}>
                {uploadSummary.failedFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${f.size}-${i}`}
                    style={{
                      fontSize: 11, color: C.text, lineHeight: 1.6,
                      display: "flex", justifyContent: "space-between", gap: 8,
                      borderBottom: i < uploadSummary.failedFiles.length - 1 ? `1px solid ${C.border}` : "none",
                      paddingBottom: i < uploadSummary.failedFiles.length - 1 ? 6 : 0,
                      marginBottom: i < uploadSummary.failedFiles.length - 1 ? 6 : 0,
                    }}
                  >
                    <span style={{ wordBreak: "break-all", minWidth: 0 }} title={f.name}>{f.name}</span>
                    <span style={{ flexShrink: 0, color: C.dim, fontVariantNumeric: "tabular-nums" }}>
                      {formatStoredFileSizeBytes(f.size)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    const list = [...uploadSummary.failedFiles];
                    startUpload(list);
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: "rgba(255,165,0,0.2)", border: `1px solid rgba(255,165,0,0.45)`,
                    borderRadius: 8, color: C.orange, fontFamily: PS_FONT,
                  }}
                >
                  <RefreshCw size={14} />
                  실패 {uploadSummary.failedFiles.length}장만 다시 업로드
                </button>
                <button
                  type="button"
                  onClick={() => setUploadSummary(null)}
                  style={{
                    padding: "8px 12px", fontSize: 11, cursor: "pointer",
                    background: "transparent", border: `1px solid ${C.borderMd}`,
                    borderRadius: 8, color: C.muted, fontFamily: PS_FONT,
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* 사진 섹션 헤더 */}
          <div className="up-section-header up-o-header" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 0 10px",
            marginTop: 16,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
              업로드된 사진{" "}
              <span style={{ color: C.steel, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                {photos.length}장
                {visibleCount < photos.length && (
                  <span style={{ color: C.dim }}> / {visibleCount}장 표시</span>
                )}
              </span>
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* 모바일 편집 모드 버튼 */}
              {!isReadOnly && photos.length > 0 && (
                <button
                  className="up-mobile-edit-ctrl"
                  onClick={() => setIsEditMode((v) => !v)}
                  style={{
                    display: "none",
                    padding: "4px 12px", borderRadius: 6, minHeight: 30,
                    border: `1px solid ${isEditMode ? C.steel : C.border}`,
                    background: isEditMode ? "rgba(79,126,255,0.12)" : "transparent",
                    color: isEditMode ? C.steel : C.muted,
                    fontSize: 12, cursor: "pointer",
                    fontFamily: PS_FONT,
                  }}
                >
                  {isEditMode ? "완료" : "편집"}
                </button>
              )}

              {/* 보기 옵션 토글 */}
              <div className="up-view-toggle" style={{
                display: "flex", gap: 1,
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: 2, overflow: "hidden",
              }}>
                {([ ["gallery", "갤러리보기"], ["filename", "파일명보기"] ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key)}
                    style={{
                      padding: "3px 10px", borderRadius: 5, border: "none",
                      background: viewMode === key ? C.steel : "transparent",
                      color: viewMode === key ? "white" : C.dim,
                      fontSize: 11, cursor: "pointer", fontWeight: viewMode === key ? 500 : 400,
                      transition: "background 0.15s, color 0.15s",
                      fontFamily: PS_FONT,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 데스크탑 전체 삭제 / 모바일은 편집 모드에서만 */}
              {!isReadOnly && photos.length > 0 && (
                <button
                  className={isEditMode ? undefined : "up-desktop-only"}
                  onClick={() => setShowDeleteAllModal(true)}
                  style={{
                    background: "transparent", border: "none", fontSize: 11,
                    color: C.red, cursor: "pointer",
                    fontFamily: PS_FONT,
                    minHeight: 30,
                  }}
                >
                  전체 삭제
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 사진 그리드 — 가상 스크롤, flex 1 ── */}
        {photos.length === 0 ? (
          <div className="up-empty-photos" style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px 24px", boxSizing: "border-box", minWidth: 0,
          }}>
            <div style={{
              textAlign: "center", padding: "40px 20px", color: C.dim,
              background: C.surface, border: `1px dashed ${C.border}`,
              borderRadius: 10, width: "100%",
            }}>
              <ImageIcon size={32} color={C.dim} style={{ marginBottom: 10, opacity: 0.3 }} />
              <div style={{ fontSize: 13 }}>아직 업로드된 사진이 없습니다</div>
            </div>
          </div>
        ) : (
          <div
            ref={thumbScrollRef}
            className="thumb-scroll"
            onScroll={handleThumbScroll}
            style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              padding: `0 24px ${isReadOnly ? 16 : 80}px`,
            }}
          >
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const startIdx = virtualRow.index * effectiveCols;

                // ── 파일명 리스트 모드 ──
                if (viewMode === "filename") {
                  const photo = visiblePhotos[startIdx];
                  if (!photo) return null;
                  const filename = photo.originalFilename ?? `${startIdx + 1}`;
                  const fileSize = photo.fileSize ?? null;
                  const fileSizeText =
                    fileSize != null && fileSize >= 0
                      ? formatStoredFileSizeBytes(fileSize)
                      : "-";
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="fn-row"
                      onClick={() => setLightboxIndex(startIdx)}
                      style={{
                        position: "absolute", top: virtualRow.start,
                        left: 0, right: 0,
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "0 4px",
                        height: isMobile ? 44 : 31,
                        borderBottom: `1px solid ${C.hairline}`,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{
                        fontSize: 11, color: C.dim, minWidth: 36,
                        textAlign: "right", flexShrink: 0,
                      }}>
                        {startIdx + 1}
                      </span>
                      <span style={{
                        fontSize: 12, color: C.text, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {filename}
                      </span>
                      <span style={{
                        fontSize: 11, color: C.dim, flexShrink: 0,
                        minWidth: 64, textAlign: "right",
                      }}>
                        {fileSizeText}
                      </span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="up-fn-del"
                          onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                          disabled={deletingId === photo.id}
                          style={{
                            background: "transparent", border: "none", padding: "2px 4px",
                            color: C.dim, cursor: "pointer", flexShrink: 0,
                            display: "flex", alignItems: "center",
                            fontFamily: PS_FONT,
                          }}
                        >
                          {deletingId === photo.id
                            ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                            : <X size={14} />}
                        </button>
                      )}
                    </div>
                  );
                }

                // ── 갤러리 모드 ──
                const gridCols = `repeat(${effectiveCols}, minmax(0, 1fr))`;
                const emptyCellRatio = isMobile ? "1 / 1" : "3 / 2";
                return (
                  <div
                    className="up-gallery-row"
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: virtualRow.start,
                      left: 0, right: 0,
                      display: "grid",
                      gridTemplateColumns: gridCols,
                    }}
                  >
                    {Array.from({ length: effectiveCols }, (_, c) => {
                      const photo = visiblePhotos[startIdx + c];
                      if (!photo) return <div key={c} style={{ aspectRatio: emptyCellRatio, minWidth: 0 }} />;
                      return (
                        <LazyThumb
                          key={photo.id}
                          photo={photo}
                          index={startIdx + c}
                          isReadOnly={isReadOnly}
                          deleting={deletingId === photo.id}
                          onDelete={() => handleDeletePhoto(photo.id)}
                          onClick={() => !isEditMode && setLightboxIndex(startIdx + c)}
                          isEditMode={isEditMode}
                          squareThumb={isMobile}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {visibleCount < photos.length && (
              <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: C.dim }}>
                스크롤해서 더 보기 ({photos.length - visibleCount}장 남음)
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 하단 고정 액션바 ── */}
      {!isReadOnly && (
        <div className="up-action-bar" style={{
          position: "fixed", bottom: 0, left: 220, right: 0,
          background: "rgba(0,48,73,0.95)", backdropFilter: "blur(12px)",
          ...photographerDock.topEdge,
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 12, color: C.muted }}>
                {M} / {photoCountExpected ?? N}장 업로드
              </span>
              <div style={{ width: 120, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: C.steel, borderRadius: 2, width: `${progressPct}%`, transition: "width 0.3s" }} />
              </div>
            </div>
            {isReady ? (
              <div style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12} /> 고객 초대 가능
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.orange, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={12} /> {N}장 이상 업로드 시 고객 초대 가능
              </div>
            )}
          </div>

          <button
            className="up-invite-btn"
            onClick={() => isReady && setShowInviteModal(true)}
            disabled={!isReady}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 20px",
              background: isReady ? C.steel : C.surface3,
              border: "none", borderRadius: 8,
              color: isReady ? "white" : C.dim,
              fontSize: 13, fontWeight: 600,
              cursor: isReady ? "pointer" : "not-allowed",
              fontFamily: PS_FONT,
              opacity: isReady ? 1 : 0.35,
            }}
          >
            고객 초대 활성화 →
          </button>
        </div>
      )}

      {/* ── 라이트박스 ── */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.92)", padding: 16, cursor: "default",
          }}
          role="dialog" aria-modal aria-label="이미지 미리보기"
        >
          <button
            type="button"
            aria-label="이전 사진"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length); }}
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", padding: 12, color: "white", cursor: "pointer", zIndex: 20, fontSize: 18 }}
          >←</button>
          <img
            src={viewerImageUrl(photos[lightboxIndex])} alt="미리보기"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", position: "relative", zIndex: 10 }}
          />
          <button
            type="button"
            aria-label="다음 사진"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) + 1) % photos.length); }}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", padding: 12, color: "white", cursor: "pointer", zIndex: 20, fontSize: 18 }}
          >→</button>
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", padding: "6px 16px", borderRadius: 20, fontSize: 13, color: "white", zIndex: 20 }}>
            {lightboxIndex + 1} / {photos.length}
          </div>
        </div>
      )}

      {/* ── 전체 삭제 모달 ── */}
      {!isReadOnly && showDeleteAllModal && (
        <ConfirmModal
          title="전체 삭제"
          desc={`업로드된 사진 ${photos.length}장을 모두 삭제하시겠습니까?`}
          confirmLabel={deleteAllSubmitting ? "삭제 중..." : "전체 삭제"}
          onConfirm={handleDeleteAll} onCancel={() => setShowDeleteAllModal(false)}
          loading={deleteAllSubmitting} danger
        />
      )}

      {/* ── 고객 초대 모달 ── */}
      {!isReadOnly && showInviteModal && (
        <ConfirmModal
          title="고객 초대 활성화"
          desc={"고객 초대 링크를 활성화합니다.\n활성화 후에는 사진 추가/삭제가 불가능합니다."}
          confirmLabel={inviteSubmitting ? "처리 중..." : "확인"}
          onConfirm={handleInviteActivate} onCancel={() => setShowInviteModal(false)}
          loading={inviteSubmitting}
        />
      )}

      {toast && <Toast message={toast} />}

      {/* ── 업로드 확인 모달 ── */}
      {pendingFiles.length > 0 && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.borderMd}`,
            borderRadius: 14, padding: "28px 28px 24px",
            maxWidth: 380, width: "100%", margin: "0 16px",
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              사진 업로드
            </div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
              총{" "}
              <span style={{ color: C.steel, fontWeight: 600 }}>
                {pendingFiles.length}장
              </span>
              을 업로드하겠습니까?
            </p>
            <div className="up-pending-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPendingFiles([])}
                style={{
                  padding: "8px 16px", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 13, cursor: "pointer",
                  fontFamily: PS_FONT,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { const f = pendingFiles; setPendingFiles([]); startUpload(f); }}
                style={{
                  padding: "8px 20px", background: C.steel, border: "none",
                  borderRadius: 8, color: "white", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  fontFamily: PS_FONT,
                }}
              >
                <Upload size={13} /> 업로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
