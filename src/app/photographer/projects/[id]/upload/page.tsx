"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
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
  ListChecks,
  PenLine,
  X,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import { createClient } from "@/lib/supabase/client";
import { parseBetaLimitError } from "@/lib/beta-limits";
import { compressImageFileForMobileIfNeeded } from "@/lib/upload-client-compress";
import type { Project, ProjectStatus, Photo } from "@/types";
import { ProjectPipelineHeader } from "@/components/photographer/ProjectPipelineHeader";

// ---------- constants ----------
const ACCENT = "#FF4D00";
const ACCENT_DIM = "rgba(255,77,0,0.12)";
const ACCENT_GLOW = "rgba(255,77,0,0.4)";
const BORDER = "#1f1f1f";
const BORDER_MID = "#2a2a2a";
const SURFACE_0 = "#020202";
const SURFACE_1 = "#050505";
const SURFACE_2 = "#0a0a0a";
const MONO = "'Space Mono', 'JetBrains Mono', monospace";
const TEXT_MUTED = "#5c5c5c";
const TEXT_NORMAL = "#a3a3a3";
const TEXT_BRIGHT = "#ffffff";

// ---------- upload constants ----------
const UPLOAD_PHOTOS_PATH = "/api/photographer/upload/photos";
const UPLOAD_MAX_ATTEMPTS = 3;
const BATCH_SIZE = 8;
const PC_CONCURRENCY = 5;
const MOBILE_BATCH_SIZE = 3;
const MOBILE_CONCURRENCY = 2;
const ACCEPT_TYPES = "image/*,image/heic,image/heif";

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

// ---------- thumbnail (스크롤 루트 기준: 보이는 영역 근처에서만 src 로드) ----------
function PhotoThumb({
  photo,
  index,
  onDelete,
  deletingId,
  isEditMode,
  scrollRootRef,
}: {
  photo: Photo;
  index: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
  /** DATABANK 스크롤 박스 — 없으면 즉시 로드 */
  scrollRootRef?: React.RefObject<HTMLElement | null>;
}) {
  const [loaded, setLoaded] = useState(false);
  const [shouldLoadSrc, setShouldLoadSrc] = useState(() => !scrollRootRef);
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
    <div ref={cellRef} className="prj-data-cell" style={{ aspectRatio: "3/2", background: "#080808", border: `1px solid ${BORDER}`, overflow: "hidden", position: "relative" }}>
      <div className="prj-overlay" />
      <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.8)", padding: "2px 5px", border: `1px solid #222`, zIndex: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: "#666" }}>
          IDX_{String(photo.orderIndex ?? index + 1).padStart(3, "0")}
        </span>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "#111", transition: "opacity 0.25s", opacity: loaded ? 0 : 1, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <ImageIcon size={10} color="#333" />
      </div>
      {shouldLoadSrc && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={(e) => { setLoaded(true); (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0, transition: "opacity 0.25s" }}
        />
      )}
      {isEditMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
          disabled={deleting}
          style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, background: "rgba(255,71,87,0.9)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
        >
          {deleting ? <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} /> : <X size={11} strokeWidth={2.5} color="#fff" />}
        </button>
      )}
    </div>
  );
}

/** 그리드 최소 셀 너비 — `repeat(auto-fill, minmax(...))` 대체 시 가상 행 계산에 사용 */
const GRID_MIN_CELL = 148;
const GRID_GAP = 4;
const GRID_PAD = 16;

function VirtualizedPhotoGrid({
  scrollRef,
  photos,
  onDelete,
  deletingId,
  isEditMode,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
}) {
  const [layout, setLayout] = useState(() => {
    const cw = GRID_MIN_CELL;
    return { cols: 4, cellWidth: cw, rowHeight: Math.ceil(cw * (2 / 3)) + GRID_GAP };
  });

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const update = () => {
      const w = root.clientWidth - GRID_PAD * 2;
      if (w <= 0) return;
      const cols = Math.max(1, Math.floor((w + GRID_GAP) / (GRID_MIN_CELL + GRID_GAP)));
      const cellWidth = (w - GRID_GAP * (cols - 1)) / cols;
      const rowHeight = Math.ceil(cellWidth * (2 / 3)) + GRID_GAP;
      setLayout((prev) =>
        prev.cols !== cols || prev.rowHeight !== rowHeight ? { cols, cellWidth, rowHeight } : prev,
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, [scrollRef]);

  const rowCount = Math.ceil(photos.length / layout.cols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: 2,
  });

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
          const slice = photos.slice(start, start + layout.cols);
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
              }}
            >
              {slice.map((photo, j) => (
                <PhotoThumb
                  key={photo.id}
                  photo={photo}
                  index={start + j}
                  onDelete={onDelete}
                  deletingId={deletingId}
                  isEditMode={isEditMode}
                  scrollRootRef={scrollRef}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LIST_ROW_H = 54;
const LIST_THUMB_W = 56;
const LIST_THUMB_H = 38;

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
    <div ref={wrapRef} style={{ width: "100%", height: "100%", background: "#111" }}>
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
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
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
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,77,0,0.3)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}
              >
                <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, width: 50, flexShrink: 0 }}>
                  IDX_{String(photo.orderIndex ?? i + 1).padStart(3, "0")}
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
                <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_NORMAL, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {photo.originalFilename ?? `FRAME_${String(i + 1).padStart(4, "0")}`}
                </span>
                {photo.fileSize && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, flexShrink: 0 }}>
                    {(photo.fileSize / 1024).toFixed(0)}KB
                  </span>
                )}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => onDelete(photo.id)}
                    disabled={deleting}
                    style={{
                      background: "rgba(255,71,87,0.15)",
                      border: "1px solid rgba(255,71,87,0.3)",
                      color: "#FF4757",
                      cursor: "pointer",
                      padding: "3px 8px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {deleting ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <X size={10} />}
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

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isPhotoEditMode, setIsPhotoEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  /** 네트워크 전송은 끝났고 서버(썸네일·저장) 응답 대기 중 — 99% 정지로 오해하지 않도록 별도 표시 */
  const [awaitingServerFinalize, setAwaitingServerFinalize] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoScrollRef = useRef<HTMLDivElement>(null);
  const stopRequestedRef = useRef(false);
  const useProxyRef = useRef(false);

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
    setUploadPhase(isPhoneLikeClient() ? "processing" : "sending");
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

    if (isPhoneLikeClient()) {
      const compressed: File[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        if (stopRequestedRef.current) { setUploadPhase("idle"); setUploadProgress(0); await loadPhotos(); return; }
        compressed.push(await compressImageFileForMobileIfNeeded(uploadFiles[i]));
        setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
      }
      filesToUpload = compressed;
    }

    setUploadPhase("sending");
    setUploadProgress(3);

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
    let completedBatches = 0;
    let abortReason: "betaLimit" | "network" | null = null;
    let abortMessage = "";
    const concurrency = isPhoneLikeClient() ? MOBILE_CONCURRENCY : PC_CONCURRENCY;

    for (let chunkStart = 0; chunkStart < batches.length; chunkStart += concurrency) {
      if (stopRequestedRef.current || abortReason) break;
      if (isPhoneLikeClient() && chunkStart > 0 && chunkStart % 20 === 0) {
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
        try {
          if (abortReason) { allFailed.push(...batch); return; }
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
            if (!res.ok) {
              try { const b = (await res.json().catch(() => ({}))) as unknown; const betaErr = parseBetaLimitError(b); if (betaErr) { abortReason = "betaLimit"; abortMessage = betaErr.message; return; } } catch {}
              allFailed.push(...batch);
            }
          } catch (e) {
            if (isNetworkFailure(e)) { abortReason = "network"; return; }
            allFailed.push(...batch);
          }
          completedBatches++;
          setUploadProgress(Math.min(90, Math.round((completedBatches / batches.length) * 100)));
        } finally {
          reqDone[chunkOffset] = true;
          syncAwaitingServer();
        }
      }));
    }

    if (stopRequestedRef.current) {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle");
      setUploadProgress(0);
      await loadPhotos();
      return;
    }

    if (abortReason === "betaLimit") { setAwaitingServerFinalize(false); setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); return; }
    if (abortReason === "network") { setAwaitingServerFinalize(false); setUploadError("업로드에 실패했습니다. 인터넷 연결을 확인해 주세요."); setUploadPhase("idle"); setUploadProgress(0); return; }

    setAwaitingServerFinalize(false);
    setUploadProgress(100);
    setUploadPhase("done");
    fetch("/api/photographer/project-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "uploaded" }) }).catch(() => {});
    setTimeout(async () => {
      setAwaitingServerFinalize(false);
      setUploadPhase("idle"); setUploadProgress(0);
      setToast(allFailed.length === 0 ? "업로드 완료!" : `${allFailed.length}장 실패`);
      await loadProject(); await loadPhotos(); router.refresh();
    }, 600);
  }, [id, loadProject, loadPhotos, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    const list = Array.from(chosen).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (list.length) startUpload(list);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const list = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (list.length) startUpload(list);
  }, [startUpload]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

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
    setDeletingId("__all__");
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos`, { method: "DELETE" });
      if (res.ok) { setPhotos([]); setProject({ ...project, photoCount: 0 }); setToast("전체 삭제됨"); }
    } finally { setDeletingId(null); }
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
      setToast("고객 초대 링크가 활성화되었습니다.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "초대 링크 활성화에 실패했습니다.");
    } finally {
      setInviteActivating(false);
    }
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>LOADING_PROJECT...</span></div>;
  if (!project) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>PROJECT_NOT_FOUND</span></div>;

  const N = project.requiredCount;
  const M = project.photoCount;
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isInviteActive = project.status !== "preparing";
  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath = project.status === "editing_v2" || project.status === "reviewing_v2" ? `/photographer/projects/${id}/upload-versions/v2` : `/photographer/projects/${id}/upload-versions`;
  const progressPct = N > 0 ? Math.min(100, Math.round((M / N) * 100)) : 0;
  const isUploading = uploadPhase === "sending" || uploadPhase === "processing";
  const showServerWorking = uploadPhase === "sending" && awaitingServerFinalize;

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
        @keyframes prj-scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        .prj-grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(30,30,30,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,0.18) 1px, transparent 1px); background-size: 30px 30px; z-index: 0; pointer-events: none; }
        .prj-scanline-el { width: 100%; height: 100px; position: fixed; bottom: 100%; background: linear-gradient(0deg, rgba(255,77,0,0.02) 0%, rgba(255,77,0,0) 100%); animation: prj-scanline 8s linear infinite; pointer-events: none; z-index: 1; }
        .prj-tech-label { font-family: 'Space Mono', 'JetBrains Mono', monospace; font-size: 0.63rem; letter-spacing: 0.15em; text-transform: uppercase; }
        .prj-scroll::-webkit-scrollbar { width: 4px; }
        .prj-scroll::-webkit-scrollbar-track { background: ${SURFACE_2}; }
        .prj-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; }
        .prj-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .prj-data-cell { position: relative; cursor: pointer; transition: border-color 0.2s; }
        .prj-data-cell .prj-overlay { position: absolute; inset: 4px; border: 1px solid transparent; transition: all 0.3s; pointer-events: none; }
        .prj-data-cell:hover .prj-overlay { border-color: rgba(255,77,0,0.3); inset: 0px; }
        .prj-data-cell:hover { border-color: rgba(255,77,0,0.4) !important; }
        .prj-op-node { transition: all 0.2s; cursor: pointer; }
        .prj-op-node:hover { border-color: rgba(255,77,0,0.4) !important; background: rgba(255,77,0,0.04) !important; }
        .prj-op-node:hover .prj-op-arrow { color: ${ACCENT} !important; }
        .prj-modal-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); padding: 16px; }
        .prj-modal-box { background: #080808; border: 1px solid ${BORDER_MID}; width: 100%; position: relative; }
        .prj-modal-box::before { content: ''; position: absolute; top: -1px; left: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .prj-modal-box::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .prj-btn-primary { background: ${ACCENT_DIM}; border: 1px solid rgba(255,77,0,0.5); color: ${ACCENT}; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-primary:hover { background: ${ACCENT}; color: #000; }
        .prj-btn-secondary { background: transparent; border: 1px solid ${BORDER_MID}; color: ${TEXT_MUTED}; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-secondary:hover { border-color: #444; color: ${TEXT_BRIGHT}; }
        .prj-btn-danger { background: transparent; border: 1px solid rgba(255,51,51,0.3); color: #FF3333; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .prj-btn-danger:hover { background: rgba(255,51,51,0.1); }
        .prj-dropzone { border: 1px dashed #333; transition: all 0.2s; }
        .prj-dropzone-over { border-color: rgba(255,77,0,0.5) !important; background: ${ACCENT_DIM} !important; }
        @media (max-width: 768px) {
          .prj-aside { display: none !important; }
          .prj-main-col { width: 100% !important; }
          .prj-file-table th:nth-child(3),
          .prj-file-table td:nth-child(3),
          .prj-file-table th:nth-child(4),
          .prj-file-table td:nth-child(4) { display: none !important; }
          .prj-modal-box { max-width: 100% !important; margin: 0 8px !important; }
          .prj-btn-primary, .prj-btn-secondary, .prj-btn-danger { min-height: 44px !important; padding: 0 16px !important; }
        }
      `}</style>

      <div className="prj-grid-bg" />
      <div className="prj-scanline-el" />

      <input ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES} style={{ display: "none" }} onChange={handleFileChange} />

      <ProjectPipelineHeader projectId={id} project={project} activeStepIndex={0} />

      {/* main */}
      <main style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", zIndex: 10, position: "relative" }}>

        {/* ── Left Panel ── */}
        <aside className="prj-scroll" style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>

          {/* ACTIVE_PROJECT */}
          <section style={{ background: SURFACE_1, padding: 20, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, background: ACCENT }} />
                <span className="prj-tech-label" style={{ color: "#888" }}>ACTIVE_PROJECT</span>
              </div>
              {project.displayId && <span style={{ fontFamily: MONO, fontSize: 10, color: "#444" }}>ID: {project.displayId}</span>}
            </div>
            <h1 style={{ fontFamily: "'Space Grotesk', 'Pretendard Variable', sans-serif", fontSize: 20, fontWeight: 700, color: TEXT_BRIGHT, lineHeight: 1.3, marginBottom: 14, wordBreak: "break-word" }}>{project.name}</h1>

            <div style={{ background: SURFACE_2, border: `1px solid #222`, padding: "10px 12px", marginBottom: 12 }}>
              <span className="prj-tech-label" style={{ color: "#555", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><Link2 size={9} />CLIENT_INVITE_URL</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: isInviteActive ? TEXT_NORMAL : "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isInviteActive ? inviteUrl.replace(/^https?:\/\//, "") : "업로드 완료 후 활성화"}
                </span>
                {isInviteActive && (
                  <button type="button" onClick={handleCopyLink} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", padding: "4px 8px", flexShrink: 0, background: copied ? "rgba(46,213,115,0.15)" : ACCENT, border: "none", color: copied ? "#2ed573" : "#000", cursor: "pointer", fontWeight: 700 }}>
                    {copied ? "COPIED" : "COPY"}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: `1px solid ${BORDER}`, marginBottom: 12, background: SURFACE_2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Lock size={10} color={TEXT_MUTED} /><span className="prj-tech-label" style={{ color: TEXT_MUTED }}>CLIENT_PIN</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {project.accessPin ? (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT_NORMAL, letterSpacing: 4 }}>{pinVisible ? project.accessPin : "●●●●"}</span>
                    <button type="button" onClick={() => setPinVisible(!pinVisible)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 2 }}>{pinVisible ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                    <button type="button" onClick={() => { setPinInput(project.accessPin ?? ""); setShowPinModal(true); setPinError(""); }} className="prj-btn-secondary" style={{ padding: "3px 8px" }}>EDIT</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#444" }}>NO_PIN_SET</span>
                    <button type="button" onClick={() => { setPinInput(""); setShowPinModal(true); setPinError(""); }} className="prj-btn-secondary" style={{ padding: "3px 8px" }}>SET</button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginBottom: 12, background: isInviteActive ? "rgba(46,213,115,0.04)" : "transparent", border: `1px solid ${isInviteActive ? "rgba(46,213,115,0.15)" : "#222"}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isInviteActive ? "#2ed573" : "#444", flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 10, color: isInviteActive ? "#2ed573" : "#555" }}>
                {isInviteActive ? `LINK_ACTIVE · ${getStatusLabel(project.status)}` : "LINK_INACTIVE · 업로드 전"}
              </span>
            </div>

          </section>

          {/* UPLINK_CONSOLE */}
          <section style={{ background: SURFACE_1, padding: 20, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span className="prj-tech-label" style={{ color: TEXT_BRIGHT }}>UPLINK_CONSOLE</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isUploading && <Loader2 size={10} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />}
                <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT }}>{M} FRAMES</span>
              </div>
            </div>

            {/* dropzone */}
            <div
              className={`prj-dropzone${dragOver ? " prj-dropzone-over" : ""}`}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              style={{ background: dragOver ? ACCENT_DIM : "rgba(2,2,2,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 16px", cursor: isUploading ? "not-allowed" : "pointer", marginBottom: 14, opacity: isUploading ? 0.7 : 1 }}
            >
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid #222`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isUploading ? <Loader2 size={16} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={16} color="#444" />}
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 13, color: isUploading ? TEXT_NORMAL : "#888", marginBottom: 4 }}>
                  {isUploading
                    ? uploadPhase === "processing"
                      ? "COMPRESSING..."
                      : showServerWorking
                        ? "SERVER_PROCESSING..."
                        : "UPLOADING..."
                    : "INITIALIZE_TRANSFER"}
                </p>
                <p className="prj-tech-label" style={{ color: "#444", fontSize: "0.55rem" }}>
                  {isUploading
                    ? showServerWorking
                      ? "썸네일·저장 처리 중 · 완료될 때까지 창을 닫지 마세요"
                      : `${uploadProgress}% COMPLETE`
                    : "DRAG & DROP OR CLICK TO SELECT"}
                </p>
              </div>
            </div>

            {/* progress bar */}
            <div style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, padding: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                <div>
                  <span className="prj-tech-label" style={{ color: "#555", fontSize: "0.55rem", display: "block", marginBottom: 4 }}>BATCH_PROGRESS</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_BRIGHT }}>{M} / {N > 0 ? N : "—"} 장</span>
                </div>
                <span className="prj-tech-label" style={{ color: isUploading ? ACCENT : TEXT_MUTED }}>
                  {isUploading ? (showServerWorking ? "···" : `${uploadProgress}%`) : `${progressPct}%`}
                </span>
              </div>
              <div style={{ height: 3, background: "#111", position: "relative", overflow: "hidden" }}>
                <div
                  style={
                    showServerWorking
                      ? {
                          width: "100%",
                          background: ACCENT,
                          height: "100%",
                          position: "relative",
                          overflow: "hidden",
                          animation: "prj-bar-indeterminate-pulse 1.4s ease-in-out infinite",
                        }
                      : {
                          width: `${isUploading ? uploadProgress : progressPct}%`,
                          background: ACCENT,
                          height: "100%",
                          position: "relative",
                          overflow: "hidden",
                          transition: "width 0.3s",
                        }
                  }
                >
                  {showServerWorking ? (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.35)", width: "35%", animation: "prj-bar-indet-sweep 1.1s linear infinite" }} />
                  ) : (isUploading || progressPct > 0) ? (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.25)", width: "20%", animation: "prj-bar-scan 2s linear infinite" }} />
                  ) : null}
                </div>
              </div>
              {uploadError && <p style={{ fontFamily: MONO, fontSize: 9, color: "#FF3333", marginTop: 8 }}>[ERR] {uploadError}</p>}
            </div>

            {!isInviteActive && (
              <button
                type="button"
                onClick={handleEnableClientAccess}
                disabled={inviteActivating || (project.status === "preparing" && M < N)}
                className="prj-btn-primary"
                style={{
                  width: "100%",
                  padding: "12px 0",
                  fontSize: 11,
                  letterSpacing: "0.15em",
                  opacity: project.status === "preparing" && M < N ? 0.4 : inviteActivating ? 0.75 : 1,
                  cursor: inviteActivating || (project.status === "preparing" && M < N) ? "default" : "pointer",
                }}
              >
                {inviteActivating ? "활성화 중…" : "고객초대 링크 활성화"}
              </button>
            )}
          </section>

          {/* OPERATION_NODES */}
          <section style={{ background: SURFACE_1, padding: 20, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, marginTop: "auto" }}>
            <span className="prj-tech-label" style={{ color: TEXT_MUTED, display: "block", marginBottom: 12 }}>OPERATION_NODES</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { icon: <ListChecks size={14} color={TEXT_MUTED} />, label: "셀렉 결과 보기", desc: canViewSelections ? `${N}장 중 셀렉 진행` : "업로드 완료 후 가능", enabled: canViewSelections, badge: project.status === "selecting" ? "LIVE" : null, onClick: () => canViewSelections && router.push(`/photographer/projects/${id}/results`) },
                { icon: <PenLine size={14} color={TEXT_MUTED} />, label: "보정본 업로드", desc: canEditVersions ? "보정본 업로드/관리" : "셀렉 완료 후 가능", enabled: canEditVersions, badge: null, onClick: () => { if (!canEditVersions) return; if (project.status === "confirmed") setShowEditGuideModal(true); else router.push(editVersionsPath); } },
                { icon: <Eye size={14} color={TEXT_MUTED} />, label: "보정본 검토", desc: canReview ? "고객 검토 현황" : "보정 완료 후 가능", enabled: canReview, badge: null, onClick: () => canReview && router.push(editVersionsPath) },
              ].map((node) => (
                <div key={node.label} className="prj-op-node" onClick={node.onClick} style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, opacity: node.enabled ? 1 : 0.4 }}>
                  {node.icon}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="prj-tech-label" style={{ color: TEXT_BRIGHT, marginBottom: 3 }}>{node.label}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>{node.desc}</div>
                  </div>
                  {node.badge && <span style={{ padding: "2px 6px", background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.3)", fontFamily: MONO, fontSize: 9, color: "#2ed573" }}>{node.badge}</span>}
                  <ChevronRight size={12} className="prj-op-arrow" color={TEXT_MUTED} style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* ── Right Panel ── */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {/* toolbar */}
          <div style={{ height: 52, borderBottom: `1px solid ${BORDER}`, background: SURFACE_1, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 20, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div>
                <span className="prj-tech-label" style={{ color: TEXT_BRIGHT, fontSize: "0.65rem" }}>DATABANK_VIEW</span>
                <br />
                <span className="prj-tech-label" style={{ color: TEXT_MUTED, fontSize: "0.55rem" }}>PHOTO_GRID_ARRAY</span>
              </div>
              <div style={{ width: 1, height: 24, background: BORDER }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: SURFACE_2, border: `1px solid ${BORDER}`, padding: "4px 10px" }}>
                <span className="prj-tech-label" style={{ color: TEXT_MUTED, fontSize: "0.55rem" }}>TOTAL:</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_BRIGHT }}>{photos.length.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {project.status === "preparing" && photos.length > 0 && (
                <>
                  <button type="button" onClick={() => setIsPhotoEditMode((v) => !v)} className={isPhotoEditMode ? "prj-btn-primary" : "prj-btn-secondary"} style={{ padding: "4px 10px" }}>
                    {isPhotoEditMode ? "EDIT_ON" : "EDIT_OFF"}
                  </button>
                  {isPhotoEditMode && (
                    <button type="button" onClick={handleFlushAll} disabled={deletingId === "__all__"} style={{ fontFamily: MONO, fontSize: 10, background: "transparent", border: "none", color: "#ff4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, letterSpacing: "0.1em" }}>
                      <Trash2 size={11} />FLUSH_ALL
                    </button>
                  )}
                  <div style={{ width: 1, height: 20, background: BORDER }} />
                </>
              )}
              <div style={{ display: "flex", background: SURFACE_2, border: `1px solid ${BORDER}`, padding: 2, gap: 1 }}>
                {([["grid", <LayoutGrid key="g" size={13} />], ["list", <List key="l" size={13} />]] as [string, React.ReactNode][]).map(([mode, icon]) => (
                  <button key={mode} type="button" onClick={() => setViewMode(mode as "grid" | "list")} style={{ padding: "4px 8px", background: viewMode === mode ? ACCENT_DIM : "transparent", border: "none", cursor: "pointer", color: viewMode === mode ? ACCENT : TEXT_MUTED, display: "flex", alignItems: "center", transition: "all 0.15s" }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* photo grid — 가상 스크롤로 보이는 행만 마운트·이미지 로드 */}
          <div ref={photoScrollRef} className="prj-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "rgba(3,3,3,0.4)" }}>
            {photosLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>LOADING_DATABANK...</span>
              </div>
            ) : photos.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                <div style={{ width: 48, height: 48, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Upload size={18} color={TEXT_MUTED} /></div>
                <span className="prj-tech-label" style={{ color: "#333" }}>NO_DATA_LOADED</span>
                <p style={{ fontFamily: MONO, fontSize: 10, color: "#2a2a2a", textAlign: "center" }}>왼쪽 드롭존에서 사진을 업로드하면 여기에 표시됩니다</p>
              </div>
            ) : viewMode === "grid" ? (
              <VirtualizedPhotoGrid
                scrollRef={photoScrollRef}
                photos={photos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={isPhotoEditMode}
              />
            ) : (
              <VirtualizedPhotoList
                scrollRef={photoScrollRef}
                photos={photos}
                onDelete={handleDeletePhoto}
                deletingId={deletingId}
                isEditMode={isPhotoEditMode}
              />
            )}
          </div>
        </section>
      </main>

      {/* toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#080808", border: `1px solid ${BORDER_MID}`, padding: "10px 20px", zIndex: 200, fontFamily: MONO, fontSize: 11, color: TEXT_BRIGHT, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ── PIN MODAL ── */}
      {showPinModal && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowPinModal(false); setPinInput(""); setPinError(""); } }}>
          <div className="prj-modal-box" style={{ maxWidth: 380 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 6, height: 6, background: ACCENT }} /><span className="prj-tech-label" style={{ color: ACCENT }}>SYS.AUTH :: {project.accessPin ? "MODIFY_PIN" : "SET_PIN"}</span></div>
              <button type="button" onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 4 }}><X size={14} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <span style={{ ...labelStyle }}>ACCESS_CODE (4자리)</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="text" inputMode="numeric" maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" style={{ flex: 1, padding: "10px 14px", background: SURFACE_2, border: `1px solid ${BORDER_MID}`, color: TEXT_BRIGHT, fontSize: 22, fontFamily: MONO, outline: "none", letterSpacing: 12, fontWeight: 700 }} onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }} onBlur={(e) => { e.currentTarget.style.borderColor = BORDER_MID; }} />
                <button type="button" onClick={() => setPinInput(Math.floor(1000 + Math.random() * 9000).toString())} className="prj-btn-secondary" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><RefreshCw size={11} />RANDOM</button>
              </div>
              <p style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, marginBottom: 16 }}>4자리 숫자를 입력하거나 랜덤 생성 버튼을 누르세요</p>
              {pinError && <div style={{ padding: "6px 10px", background: "rgba(255,51,51,0.08)", border: "1px solid rgba(255,51,51,0.2)", marginBottom: 12 }}><span style={{ fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>[ERR] {pinError}</span></div>}
              <div style={{ display: "flex", gap: 8 }}>
                {project.accessPin && <button type="button" onClick={() => handleSavePin(null)} disabled={pinSaving} className="prj-btn-danger" style={{ padding: "10px 14px" }}>DEL_PIN</button>}
                <button type="button" onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }} disabled={pinSaving} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>CANCEL</button>
                <button type="button" onClick={() => handleSavePin(pinInput || null)} disabled={pinSaving || (!!pinInput && pinInput.length !== 4)} className="prj-btn-primary" style={{ flex: 1, padding: "10px 0", opacity: (pinSaving || (!!pinInput && pinInput.length !== 4)) ? 0.4 : 1 }}>{pinSaving ? "SAVING..." : "COMMIT"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT GUIDE MODAL ── */}
      {showEditGuideModal && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEditGuideModal(false); }}>
          <div className="prj-modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, background: "#2ed573" }} />
              <span className="prj-tech-label" style={{ color: "#2ed573" }}>SYS.INFO :: ACTION_REQUIRED</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><CheckCircle2 size={18} color="#2ed573" /><span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: TEXT_BRIGHT }}>보정을 시작하지 않았습니다</span></div>
              <p style={{ fontSize: 13, color: TEXT_NORMAL, lineHeight: 1.7, marginBottom: 24 }}>보정본을 업로드하려면 먼저 셀렉 결과를 확인하고<strong style={{ color: TEXT_BRIGHT }}> [보정 시작하기]</strong>를 눌러주세요.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowEditGuideModal(false)} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>CLOSE</button>
                <button type="button" onClick={() => { setShowEditGuideModal(false); router.push(`/photographer/projects/${id}/results`); }} className="prj-btn-primary" style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>VIEW_SELECT_RESULTS<ChevronRight size={12} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
