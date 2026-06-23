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
  EyeOff,
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
} from "lucide-react";
import { PrevNextButton } from "@/components/PrevNextButton";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import { createClient } from "@/lib/supabase/client";
import { parseBetaLimitError } from "@/lib/beta-limits";
import { compressImageForUpload } from "@/lib/upload-client-compress";
import type { Project, ProjectStatus, Photo } from "@/types";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";
import { CustomerInviteShareModal } from "@/components/photographer/CustomerInviteShareModal";

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
const MOBILE_BATCH_SIZE = 3;
const MOBILE_CONCURRENCY = 1;
const ACCEPT_TYPES = "image/*,image/heic,image/heif";

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

function isPhoneLikeClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  return false;
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
  onPhotoClick,
}: {
  photo: Photo;
  index: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  /** DATABANK 스크롤 박스 — 없으면 즉시 로드 */
  scrollRootRef?: React.RefObject<HTMLElement | null>;
  onPhotoClick?: (index: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  // blob URL(isPending)은 레이지 로드 불필요 — 로컬 메모리에 있어 즉시 로드
  const [shouldLoadSrc, setShouldLoadSrc] = useState(() => !scrollRootRef || !!photo.isPending);
  const cellRef = useRef<HTMLDivElement>(null);
  const deleting = deletingId === photo.id;

  useEffect(() => {
    if (shouldLoadSrc) return;
    const el = cellRef.current;
    const root = scrollRootRef?.current ?? null;
    if (!el) return;
    if (!root) {
      setShouldLoadSrc(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShouldLoadSrc(true);
      },
      { root, rootMargin: "100px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRootRef, shouldLoadSrc]);

  return (
    <div
      ref={cellRef}
      className="prj-data-cell"
      onClick={() => !photo.isPending && onPhotoClick?.(index)}
      style={{
        background: "var(--background)",
        border: photo.isPending ? "1px solid rgba(var(--accent-rgb), 0.55)" : `1px solid ${BORDER}`,
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
            opacity: loaded ? 0 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <ImageIcon size={10} color="var(--subtle-foreground)" />
        </div>
        {shouldLoadSrc && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.url}
            alt=""
            loading={photo.isPending ? "eager" : "lazy"}
            decoding="async"
            onLoad={(e) => {
              setLoaded(true);
              (e.currentTarget as HTMLImageElement).style.opacity = "1";
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: 0,
              transition: "opacity 0.25s",
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
  showServerWorking,
  hasPhotos,
  isPreparing,
  onClick,
}: {
  isUploading: boolean;
  uploadProgress: number;
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
        : `${uploadProgress}%`
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
  onPhotoClick,
  leadingUploadCell,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  minCols?: number;
  onPhotoClick?: (index: number) => void;
  /** 모바일 전용: 그리드 첫 셀(인덱스 0) 자리에 노출되는 업로드 CTA */
  leadingUploadCell?: React.ReactNode;
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
            cells.push(
              <PhotoThumb
                key={photo.id}
                photo={photo}
                index={photoIndex}
                onDelete={onDelete}
                deletingId={deletingId}
                isEditMode={isEditMode}
                scrollRootRef={scrollRef}
                onPhotoClick={onPhotoClick}
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
}: {
  url: string;
  scrollRootRef: React.RefObject<HTMLElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (load) return;
    const el = wrapRef.current;
    const root = scrollRootRef.current;
    if (!el) return;
    if (!root) {
      setLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLoad(true);
      },
      { root, rootMargin: "100px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRootRef, load]);
  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", background: "var(--background)" }}>
      {load && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
  onPhotoClick,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  onPhotoClick?: (index: number) => void;
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
                  border: `1px solid ${BORDER}`,
                  background: SURFACE_2,
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
                onClick={() => onPhotoClick?.(i)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(var(--accent-rgb), 0.3)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}
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
                  <ListRowThumb url={photo.url} scrollRootRef={scrollRef} />
                </div>
                <span style={{ fontSize: 13, color: TEXT_BRIGHT, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Pretendard Variable', sans-serif" }}>
                  {photo.originalFilename ?? `FRAME_${String(i + 1).padStart(4, "0")}`}
                </span>
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

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [inviteActivating, setInviteActivating] = useState(false);
  const [inviteShareModalOpen, setInviteShareModalOpen] = useState(false);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isMobile, setIsMobile] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 배치 업로드 완료 직후 blob URL로 즉시 표시되는 낙관적 사진 */
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ tempId: string; blobUrl: string; filename: string }>>([]);
  const pendingBlobsRef = useRef<string[]>([]);
  /** XHR 전송 중인 사진 (스피너 표시) */
  const [uploadingPhotos, setUploadingPhotos] = useState<Array<{ tempId: string; blobUrl: string; filename: string }>>([]);
  const uploadingBlobsRef = useRef<string[]>([]);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  /** 네트워크 전송은 끝났고 서버(썸네일·저장) 응답 대기 중 — 99% 정지로 오해하지 않도록 별도 표시 */
  const [awaitingServerFinalize, setAwaitingServerFinalize] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** selecting 상태에서 추가 업로드 시도 시 1회 안내 모달 */
  const [showSelectingWarn, setShowSelectingWarn] = useState(false);
  const [showFlushAllConfirm, setShowFlushAllConfirm] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerPendingRef = useRef(false);
  const photoScrollRef = useRef<HTMLDivElement>(null);
  const stopRequestedRef = useRef(false);
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

  useEffect(() => { loadProject().then((p) => { if (p) loadPhotos(); }); }, [id, loadProject, loadPhotos]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);


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
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i! > 0 ? i! - 1 : photos.length - 1));
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i! < photos.length - 1 ? i! + 1 : 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length]);

  useEffect(() => {
    const uploading = uploadPhase === "sending" || uploadPhase === "processing";
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadPhase]);

  // ── upload ──
  const startUpload = useCallback(async (uploadFiles: File[]) => {
    if (!uploadFiles.length) return;
    setUploadError(null);
    setAwaitingServerFinalize(false);
    setUploadPhase("processing");
    setUploadProgress(0);
    stopRequestedRef.current = false;
    useProxyRef.current = false;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const token = session?.access_token;
    if (userError || !user) { setUploadError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); return; }
    if (!token) { setUploadError("로그인이 필요합니다."); setUploadPhase("idle"); return; }

    let currentToken = token;
    let filesToUpload = uploadFiles;

    const compressed: File[] = [];
    for (let i = 0; i < uploadFiles.length; i++) {
      if (stopRequestedRef.current) { setUploadPhase("idle"); setUploadProgress(0); await loadPhotos(); return; }
      compressed.push(await compressImageForUpload(uploadFiles[i]));
      setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
    }
    filesToUpload = compressed;

    setUploadPhase("sending");
    setUploadProgress(3);
    if (photoScrollRef.current) photoScrollRef.current.scrollTop = 0;

    const effectiveBatch = isPhoneLikeClient() ? MOBILE_BATCH_SIZE : BATCH_SIZE;
    const batches: File[][] = [];
    for (let i = 0; i < filesToUpload.length; i += effectiveBatch) batches.push(filesToUpload.slice(i, i + effectiveBatch));

    const batchSizes = batches.map((b) => b.reduce((s, f) => s + f.size, 0));
    const totalBytes = Math.max(1, batchSizes.reduce((a, b) => a + b, 0));
    const loadedPerBatch = new Array<number>(batches.length).fill(0);

    const applyProgress = (idx: number, loaded: number) => {
      const cap = batchSizes[idx] ?? 0;
      loadedPerBatch[idx] = cap > 0 ? Math.min(cap, loaded) : loaded;
      let sum = 0; for (let i = 0; i < batches.length; i++) sum += loadedPerBatch[i];
      // 상한 90%: 전송 완료 후 서버 처리 구간은 awaitingServerFinalize UI로 표시 (99% 장시간 정지 방지)
      setUploadProgress(Math.min(90, Math.round((sum / totalBytes) * 100)));
    };

    const allFailed: File[] = [];
    const backendRejected: string[] = []; // BUG-01: 서버에서 거부된 파일명 (CR3 등 미지원 형식)
    let completedBatches = 0;
    let abortReason: "betaLimit" | "network" | "auth" | null = null;
    let abortMessage = "";
    let firstFailDetail: string | null = null;
    const concurrency = isPhoneLikeClient() ? MOBILE_CONCURRENCY : PC_CONCURRENCY;

    for (let chunkStart = 0; chunkStart < batches.length; chunkStart += concurrency) {
      if (stopRequestedRef.current || abortReason) break;
      // BUG-04: PC도 30배치(약 240장)마다 토큰 갱신 (대용량 업로드 중 만료 방지)
      const refreshInterval = isPhoneLikeClient() ? 20 : 30;
      if (chunkStart > 0 && chunkStart % refreshInterval === 0) {
        await supabase.auth.refreshSession();
        const { data: { session: fresh } } = await supabase.auth.getSession();
        if (fresh?.access_token) currentToken = fresh.access_token;
      }
      const chunk = batches.slice(chunkStart, Math.min(chunkStart + concurrency, batches.length));
      const bodySent: boolean[] = chunk.map(() => false);
      const reqDone: boolean[] = chunk.map(() => false);
      const syncAwaitingServer = () => {
        setAwaitingServerFinalize(chunk.some((_, j) => bodySent[j] && !reqDone[j]));
      };
      await Promise.all(chunk.map(async (batch, chunkOffset) => {
        // XHR 전 blob URL 생성 → uploadingPhotos(스피너)에 추가
        const inFlightNow = Date.now();
        const inFlight = batch.map((file, fi) => {
          const blobUrl = URL.createObjectURL(file);
          uploadingBlobsRef.current.push(blobUrl);
          return { tempId: `uploading-${inFlightNow}-${chunkStart}-${chunkOffset}-${fi}`, blobUrl, filename: file.name };
        });
        const inFlightIds = new Set(inFlight.map((p) => p.tempId));
        // XHR 시작 전 스피너 강제 렌더 (iOS WKWebView scheduler 우회)
        flushSync(() => setUploadingPhotos((prev) => [...prev, ...inFlight]));
        // WKWebView가 실제로 paint할 시간 확보 (concurrency=1이므로 여기서 대기해도 안전)
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        try {
          if (abortReason) {
            allFailed.push(...batch);
            setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
            inFlight.forEach((p) => URL.revokeObjectURL(p.blobUrl));
            uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
            return;
          }
          const globalIdx = chunkStart + chunkOffset;
          const buildForm = () => { const f = new FormData(); f.append("project_id", id); batch.forEach((file) => f.append("files", file)); return f; };
          try {
            let res = await postPhotosUpload(
              buildForm,
              currentToken,
              useProxyRef,
              (loaded) => applyProgress(globalIdx, loaded),
              { onRequestBodySent: () => { bodySent[chunkOffset] = true; syncAwaitingServer(); } },
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
                  { onRequestBodySent: () => { bodySent[chunkOffset] = true; syncAwaitingServer(); } },
                );
              }
            }
            if (batchSizes[globalIdx] > 0) applyProgress(globalIdx, batchSizes[globalIdx]);
            // BUG-01: 성공 응답에서 서버 거부 파일 목록 수집
            if (res.ok) {
              try {
                const okBody = await res.json().catch(() => ({})) as { rejected?: string[] };
                if (okBody.rejected?.length) backendRejected.push(...okBody.rejected);
              } catch {}
              // 배치 성공: blob URL 프리뷰로 즉시 갱신 (추가 네트워크 요청 없음)
              // iOS에서 업로드 XHR과 동시에 DB 조회하면 연결 한도 초과 → blob URL 사용
              flushSync(() => {
                setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
                setPendingPhotos((prev) => [...prev, ...inFlight]);
              });
              // WKWebView paint 기회 확보 (concurrency=1이므로 다음 batch 시작 전 실제로 화면 갱신됨)
              await new Promise<void>((r) => requestAnimationFrame(() => r()));
              uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
              pendingBlobsRef.current.push(...inFlight.map((p) => p.blobUrl));
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
          setUploadProgress(Math.min(90, Math.round((completedBatches / batches.length) * 100)));
        } finally {
          // 실패·중단 케이스에서 uploading 상태 잔류 방지
          setUploadingPhotos((prev) => prev.filter((p) => !inFlightIds.has(p.tempId)));
          uploadingBlobsRef.current = uploadingBlobsRef.current.filter((u) => !inFlight.some((p) => p.blobUrl === u));
          reqDone[chunkOffset] = true;
          syncAwaitingServer();
        }
      }));
      // batch 간 macrotask 경계 생성: iOS WKWebView는 macrotask 사이에서만 paint
      // 이 시점에 이전 batch blob preview가 DOM에 있고 다음 XHR이 아직 시작 안 됨 → paint 보장
      if (isPhoneLikeClient()) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    if (stopRequestedRef.current) {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle");
      setUploadProgress(0);
      await loadPhotos();
      setPendingPhotos([]);
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
      setUploadingPhotos([]);
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
      return;
    }

    if (abortReason === "betaLimit") { setAwaitingServerFinalize(false); setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); return; }
    if (abortReason === "network") { setAwaitingServerFinalize(false); setUploadError("업로드에 실패했습니다. 인터넷 연결을 확인해 주세요."); setUploadPhase("idle"); setUploadProgress(0); return; }
    if (abortReason === "auth") { setAwaitingServerFinalize(false); setUploadError(`업로드에 실패했습니다. (${abortMessage})`); setUploadPhase("idle"); setUploadProgress(0); return; }

    setAwaitingServerFinalize(false);
    setUploadProgress(100);
    setUploadPhase("done");
    fetch("/api/photographer/project-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "uploaded" }) }).catch(() => {});
    setTimeout(async () => {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle"); setUploadProgress(0);
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
      setToast(totalFail === 0 ? "업로드 완료!" : `${totalFail}개 파일 처리 실패`);
      await loadProject(); await loadPhotos(); router.refresh();
      // 낙관적 프리뷰 정리 (DB에서 실제 R2 URL로 교체됨)
      setPendingPhotos([]);
      pendingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      pendingBlobsRef.current = [];
      setUploadingPhotos([]);
      uploadingBlobsRef.current.forEach((u) => URL.revokeObjectURL(u));
      uploadingBlobsRef.current = [];
    }, 600);
  }, [id, loadProject, loadPhotos, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickerPendingRef.current = false;
    setIsPreparingFiles(false);
    const chosen = e.target.files;
    if (!chosen?.length) return;
    const list = Array.from(chosen).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (list.length) setPendingFiles(list);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (!project || !canUploadOriginals(project.status)) return;
    const list = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (!list.length) return;
    if (project.status === "selecting") {
      // 셀렉 중에는 안내 모달 → 확인 시 pending으로 넘어가게 임시 보관
      setPendingFiles([]);
      setShowSelectingWarn(true);
      pendingDropFilesRef.current = list;
      return;
    }
    setPendingFiles(list);
  }, [project]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  /** 파일 picker 진입 단일 통로: preparing → 즉시, selecting → 안내 모달 후, 그 외 → noop */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
    pickerPendingRef.current = true;
    const onFocus = () => {
      if (pickerPendingRef.current) setIsPreparingFiles(true);
    };
    window.addEventListener("focus", onFocus, { once: true });
  }, []);

  const requestOpenFilePicker = useCallback(() => {
    if (!project) return;
    if (uploadPhase === "sending" || uploadPhase === "processing") return;
    if (project.status === "preparing") {
      pendingDropFilesRef.current = null;
      openFilePicker();
      return;
    }
    if (project.status === "selecting") {
      pendingDropFilesRef.current = null;
      setShowSelectingWarn(true);
      return;
    }
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
      setToast("삭제되었습니다.");
    } catch (e) { setToast(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setDeletingId(null); }
  };

  const handleFlushAll = async () => {
    if (!project || project.status !== "preparing") return;
    setShowFlushAllConfirm(false);
    setDeletingId("__all__");
    stopRequestedRef.current = true;
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
    setInviteActivating(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selecting" satisfies ProjectStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast((data as { error?: string }).error ?? "초대 링크 활성화에 실패했습니다.");
        return;
      }
      fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "selecting" }),
      }).catch(() => {});
      setProject({ ...project, status: "selecting" });
      setInviteShareModalOpen(true);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "초대 링크 활성화에 실패했습니다.");
    } finally {
      setInviteActivating(false);
    }
  };

  /** 기존 photos + 배치 완료(pending) + 전송 중(uploading) 합산 — early return 이전에 선언해야 Rules of Hooks 준수 */
  const displayPhotos = useMemo(() => {
    const confirmedNames = new Set(photos.map((p) => p.originalFilename));
    const pendingAsPhotos: Photo[] = pendingPhotos
      .filter((p) => !confirmedNames.has(p.filename))
      .map((p) => ({ id: p.tempId, projectId: id, orderIndex: 99999, url: p.blobUrl, originalFilename: p.filename, isPending: true, isUploading: false }));
    const uploadingAsPhotos: Photo[] = uploadingPhotos
      .filter((p) => !confirmedNames.has(p.filename))
      .map((p) => ({ id: p.tempId, projectId: id, orderIndex: 99999, url: p.blobUrl, originalFilename: p.filename, isPending: true, isUploading: true }));
    if (pendingAsPhotos.length === 0 && uploadingAsPhotos.length === 0) return photos;
    return [...uploadingAsPhotos, ...pendingAsPhotos, ...photos];
  }, [photos, pendingPhotos, uploadingPhotos, id]);

  if (loading) return <PageLoader variant="full" />;
  if (!project) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>PROJECT_NOT_FOUND</span></div>;

  const N = project.requiredCount;
  const M = project.photoCount;
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isInviteActive = project.status !== "preparing";
  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath = project.status === "editing_v2" || project.status === "reviewing_v2" ? `/photographer/projects/${id}/upload-versions/v2` : `/photographer/projects/${id}/upload-versions`;
  const progressPct = N > 0 ? Math.min(100, Math.round((displayPhotos.length / N) * 100)) : 0;
  const isUploading = uploadPhase === "sending" || uploadPhase === "processing";
  const showServerWorking = uploadPhase === "sending" && awaitingServerFinalize;
  const uploadAllowed = canUploadOriginals(project.status);
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
              <div style={{ width: `${uploadProgress}%`, height: "100%", background: ACCENT, transition: "width 0.3s" }} />
            ) : null}
          </div>
          {uploadError && (
            <p style={{ margin: 0, padding: "6px 16px", fontFamily: MONO, fontSize: 10, color: "#FF3333", borderBottom: `1px solid ${BORDER}` }}>
              {uploadError}
            </p>
          )}
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

          {/* ── 모바일 툴바 (장수 + 전체삭제) ── */}
          {displayPhotos.length > 0 && (
            <div
              className="prj-mobile-toolbar"
              style={{
                height: 40,
                borderBottom: `1px solid ${BORDER}`,
                background: SURFACE_1,
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: 14,
                paddingRight: 14,
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED }}>{displayPhotos.length.toLocaleString()}장</span>
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
            </div>
          )}

          {/* photo grid — 가상 스크롤로 보이는 행만 마운트·이미지 로드 */}
          <div
            ref={photoScrollRef}
            className="prj-scroll prj-photo-scroll-mobile-pad"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "rgba(3,3,3,0.4)" }}
          >
            {photosLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>불러오는 중...</span>
              </div>
            ) : displayPhotos.length === 0 && !uploadAllowed ? (
              <div
                onClick={() => !isUploading && uploadAllowed && requestOpenFilePicker()}
                onDrop={uploadAllowed ? onDrop : undefined}
                onDragOver={uploadAllowed ? onDragOver : undefined}
                onDragLeave={uploadAllowed ? onDragLeave : undefined}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  height: "100%", gap: 16,
                  cursor: isUploading ? "not-allowed" : uploadAllowed ? "pointer" : "not-allowed",
                  background: dragOver ? ACCENT_DIM : "transparent",
                  border: `2px dashed ${dragOver ? ACCENT : BORDER_MID}`,
                  margin: 24,
                  transition: "all 0.2s",
                  opacity: uploadAllowed ? 1 : 0.5,
                }}
              >
                <div style={{ width: 64, height: 64, borderRadius: "50%", border: `1px solid ${dragOver ? ACCENT : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.2s" }}>
                  {isUploading
                    ? <Loader2 size={24} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
                    : <Upload size={24} color={dragOver ? ACCENT : "var(--subtle-foreground)"} />
                  }
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: dragOver ? ACCENT : "var(--muted-foreground)", marginBottom: 6 }}>
                    {isUploading ? "업로드 중..." : "사진을 드래그하거나 클릭해서 업로드"}
                  </p>
                  <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--subtle-foreground)" }}>
                    JPG · PNG · HEIC 지원
                  </p>
                </div>
              </div>
            ) : viewMode === "grid" || (displayPhotos.length === 0 && uploadAllowed) ? (
              <VirtualizedPhotoGrid
                scrollRef={photoScrollRef}
                photos={displayPhotos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={project.status === "preparing"}
                minCols={isMobile ? 3 : 1}
                onPhotoClick={setLightboxIndex}
                leadingUploadCell={
                  uploadAllowed ? (
                    <UploadTile
                      isUploading={isUploading}
                      uploadProgress={uploadProgress}
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
                photos={displayPhotos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={project.status === "preparing"}
                onPhotoClick={setLightboxIndex}
              />
            )}
          </div>
        </section>
      </main>

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
                  ? (N > 0
                      ? (displayPhotos.length >= N ? `${displayPhotos.length}/${N}장 · 활성화 가능` : `${displayPhotos.length}/${N}장`)
                      : `${displayPhotos.length}장 · 셀렉 미정`)
                  : "고객 초대 준비"}
              </div>
              <div className="prj-invite-sub" style={{ fontSize: 11, color: TEXT_MUTED }}>
                {displayPhotos.length >= N && N > 0
                  ? `${displayPhotos.length}장 업로드 완료 · 초대 링크를 활성화할 수 있습니다`
                  : `${displayPhotos.length}장 업로드됨 · ${N}장 이상 업로드 후 활성화 가능합니다`}
              </div>
            </div>
            <button
              type="button"
              className="prj-invite-btn"
              onClick={handleEnableClientAccess}
              disabled={inviteActivating || M < N}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "9px 20px",
                background: displayPhotos.length >= N ? ACCENT : "rgba(var(--accent-rgb), 0.15)",
                border: "none", borderRadius: 8,
                color: displayPhotos.length >= N ? "#000" : ACCENT,
                fontSize: 13, fontWeight: 600,
                cursor: displayPhotos.length >= N && !inviteActivating ? "pointer" : "not-allowed",
                fontFamily: MONO,
                opacity: inviteActivating ? 0.75 : 1,
                boxShadow: displayPhotos.length >= N ? `0 0 16px ${ACCENT_GLOW}` : "none",
                transition: "all 0.2s",
              }}
            >
              {inviteActivating ? "활성화 중…" : isMobile ? "초대링크 활성화" : "고객 초대 링크 활성화"}
              {!inviteActivating && M >= N && !isMobile && <ChevronRight size={14} />}
            </button>
          </>
        )}
      </div>

      {/* ── 라이트박스 (body 포털: main z-10 < 사이드바 z-20 스택 때문에, 고정 오버레이가 사이드바에 가려지지 않게) ── */}
      {lightboxIndex !== null && photos[lightboxIndex] && typeof document !== "undefined" && document.body
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
                {lightboxIndex + 1} / {photos.length}
              </div>
              <PrevNextButton
                direction="prev"
                size="lg"
                align="edge"
                style={{ zIndex: 2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i! > 0 ? i! - 1 : photos.length - 1));
                }}
              />
              {/* 이미지 */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "90vw", zIndex: 1 }}
              >
                <img
                  key={photos[lightboxIndex].id}
                  src={photos[lightboxIndex].previewUrl ?? photos[lightboxIndex].url}
                  alt={photos[lightboxIndex].originalFilename ?? ""}
                  style={{ maxHeight: "80vh", maxWidth: "90vw", objectFit: "contain", borderRadius: 6, display: "block" }}
                />
                {photos[lightboxIndex].originalFilename && (
                  <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {photos[lightboxIndex].originalFilename}
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
                  setLightboxIndex((i) => (i! < photos.length - 1 ? i! + 1 : 0));
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
      {pendingFiles.length > 0 && (
        <div className="prj-modal-overlay">
          <div className="prj-modal-box" style={{ maxWidth: 380 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, background: ACCENT }} />
              <span className="prj-tech-label" style={{ color: ACCENT }}>업로드 확인</span>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: TEXT_BRIGHT, marginBottom: 8 }}>
                {pendingFiles.length.toLocaleString()}장을 업로드할까요?
              </p>
              <p style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.7, marginBottom: 24 }}>
                업로드 후에도 삭제·추가 업로드 가능합니다.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPendingFiles([])}
                  className="prj-btn-secondary"
                  style={{ flex: 1, padding: "10px 0" }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => { const f = pendingFiles; setPendingFiles([]); startUpload(f); }}
                  className="prj-btn-primary"
                  style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Upload size={12} />
                  업로드
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
