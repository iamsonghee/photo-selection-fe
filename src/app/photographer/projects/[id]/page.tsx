"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { differenceInDays } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  Link2,
  MessageCircle,
  Eye,
  EyeOff,
  ChevronRight,
  Trash2,
  Check,
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
import { PHOTOGRAPHER_THEME as C } from "@/lib/photographer-theme";

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

async function xhrPostWithRetry(
  url: string,
  buildForm: () => FormData,
  token: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<XhrResult> {
  const crossOrigin = /^https?:\/\//i.test(url);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await new Promise<XhrResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0) onProgress(ev.loaded, ev.total);
          else if (ev.loaded > 0) onProgress(ev.loaded, 0);
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
): Promise<XhrResult> {
  const primary = uploadPhotosUrl();
  if (useProxyRef.current || primary === UPLOAD_PHOTOS_PATH) {
    return xhrPostWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token, onProgress);
  }
  try {
    return await xhrPostWithRetry(primary, buildForm, token, onProgress);
  } catch (e) {
    if (e instanceof TypeError) {
      useProxyRef.current = true;
      return xhrPostWithRetry(UPLOAD_PHOTOS_PATH, buildForm, token, onProgress);
    }
    throw e;
  }
}

function isNetworkFailure(e: unknown) {
  if (e instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && e instanceof DOMException) return e.name === "NetworkError";
  return false;
}

// ---------- workflow helpers ----------
type WfState = "done" | "current" | "pending";

function getWorkflowStates(status: ProjectStatus): WfState[] {
  switch (status) {
    case "preparing":    return ["current", "pending", "pending", "pending", "pending"];
    case "selecting":    return ["done",    "current", "pending", "pending", "pending"];
    case "confirmed":
    case "editing":
    case "editing_v2":   return ["done",    "done",    "current", "pending", "pending"];
    case "reviewing_v1":
    case "reviewing_v2": return ["done",    "done",    "done",    "current", "pending"];
    case "delivered":    return ["done",    "done",    "done",    "done",    "done"   ];
    default:             return ["pending", "pending", "pending", "pending", "pending"];
  }
}

const WF_STEPS = [
  { key: "UPLOAD_PHASE",  label: "업로드" },
  { key: "CLIENT_SELECT", label: "셀렉" },
  { key: "RETOUCH_PHASE", label: "보정" },
  { key: "REVIEW_PHASE",  label: "검토" },
  { key: "DELIVERY",      label: "납품" },
];

// ---------- thumbnail ----------
function PhotoThumb({ photo, index, onDelete, deletingId, isEditMode }: {
  photo: Photo; index: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditMode: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const deleting = deletingId === photo.id;
  return (
    <div className="prj-data-cell" style={{ aspectRatio: "3/2", background: "#080808", border: `1px solid ${BORDER}`, overflow: "hidden", position: "relative" }}>
      <div className="prj-overlay" />
      <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.8)", padding: "2px 5px", border: `1px solid #222`, zIndex: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: "#666" }}>
          IDX_{String(photo.orderIndex ?? index + 1).padStart(3, "0")}
        </span>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "#111", transition: "opacity 0.25s", opacity: loaded ? 0 : 1, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <ImageIcon size={10} color="#333" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt=""
        loading="lazy"
        onLoad={(e) => { setLoaded(true); (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0, transition: "opacity 0.25s" }}
      />
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

// ---------- main ----------
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showEditGuideModal, setShowEditGuideModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editShootDate, setEditShootDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editRequiredCount, setEditRequiredCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoFilter, setPhotoFilter] = useState<"all" | "recent">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isPhotoEditMode, setIsPhotoEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "sending" | "processing" | "done">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setUploadProgress(Math.min(99, Math.round((sum / totalBytes) * 100)));
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
      await Promise.all(chunk.map(async (batch, chunkOffset) => {
        if (abortReason) { allFailed.push(...batch); return; }
        const globalIdx = chunkStart + chunkOffset;
        const buildForm = () => { const f = new FormData(); f.append("project_id", id); batch.forEach((file) => f.append("files", file)); return f; };
        try {
          let res = await postPhotosUpload(buildForm, currentToken, useProxyRef, (loaded) => applyProgress(globalIdx, loaded));
          if (res.status === 401) {
            await supabase.auth.refreshSession();
            const { data: { session: after } } = await supabase.auth.getSession();
            if (after?.access_token) { currentToken = after.access_token; res = await postPhotosUpload(buildForm, currentToken, useProxyRef, (loaded) => applyProgress(globalIdx, loaded)); }
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
        setUploadProgress(Math.min(99, Math.round((completedBatches / batches.length) * 100)));
      }));
    }

    if (abortReason === "betaLimit") { setUploadError(abortMessage); setUploadPhase("idle"); setUploadProgress(0); return; }
    if (abortReason === "network") { setUploadError("업로드에 실패했습니다. 인터넷 연결을 확인해 주세요."); setUploadPhase("idle"); setUploadProgress(0); return; }

    setUploadProgress(100);
    setUploadPhase("done");
    fetch("/api/photographer/project-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "uploaded" }) }).catch(() => {});
    setTimeout(async () => {
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

  // ── project handlers ──
  const handleSaveEdit = async () => {
    if (!project) return;
    setSaveError("");
    const canEditN = ["preparing", "selecting"].includes(project.status);
    const newN = canEditN ? editRequiredCount : project.requiredCount;
    if (canEditN && newN < 1) { setSaveError("셀렉 갯수는 1 이상이어야 합니다."); return; }
    if (project.status !== "preparing" && canEditN && project.photoCount < newN) { setSaveError(`업로드된 사진 수(${project.photoCount}장) 이하로 설정해주세요.`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, customer_name: editCustomerName, shoot_date: editShootDate, deadline: editDeadline, required_count: newN }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({ ...project, name: editName, customerName: editCustomerName, shootDate: editShootDate, deadline: editDeadline, requiredCount: newN });
      setEditMode(false);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  };

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/c/${project?.accessToken ?? ""}` : `/c/${project?.accessToken ?? ""}`;

  const handleCopyLink = () => {
    const pin = project?.accessPin;
    navigator.clipboard.writeText(pin ? `링크: ${inviteUrl}\n비밀번호: ${pin}` : inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleKakaoShare = () => {
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

  const handleDeleteProject = async () => {
    setDeleteError(""); setDeleting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error((data as { error?: string }).error ?? "삭제에 실패했습니다."); }
      router.push("/photographer/dashboard");
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다."); }
    finally { setDeleting(false); }
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

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>LOADING_PROJECT...</span></div>;
  if (!project) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: SURFACE_0 }}><span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.15em" }}>PROJECT_NOT_FOUND</span></div>;

  const N = project.requiredCount;
  const M = project.photoCount;
  const wfStates = getWorkflowStates(project.status);
  const currentStep = wfStates.filter((s) => s === "done").length + 1;
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isInviteActive = project.status !== "preparing";
  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath = project.status === "editing_v2" || project.status === "reviewing_v2" ? `/photographer/projects/${id}/upload-versions/v2` : `/photographer/projects/${id}/upload-versions`;
  const progressPct = N > 0 ? Math.min(100, Math.round((M / N) * 100)) : 0;
  const filteredPhotos = photoFilter === "recent" ? photos.slice(-20) : photos;
  const isUploading = uploadPhase === "sending" || uploadPhase === "processing";

  const labelStyle: React.CSSProperties = { fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, display: "block", marginBottom: 6 };

  return (
    <div className="prj-root" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative", background: SURFACE_0 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes prj-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(500%); } }
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
        .prj-filter-tab { transition: all 0.15s; cursor: pointer; }
        .prj-filter-tab:hover { border-color: ${ACCENT} !important; color: ${TEXT_BRIGHT} !important; }
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
        .prj-input-field { width: 100%; padding: 8px 0; background: transparent; border: none; border-bottom: 1px solid ${BORDER_MID}; color: ${TEXT_BRIGHT}; font-size: 13px; font-family: inherit; outline: none; box-sizing: border-box; transition: border-color 0.2s; }
        .prj-input-field:focus { border-bottom-color: ${ACCENT}; }
        .prj-input-field:disabled { color: ${TEXT_MUTED}; cursor: not-allowed; }
        .prj-dropzone { border: 1px dashed #333; transition: all 0.2s; }
        .prj-dropzone-over { border-color: rgba(255,77,0,0.5) !important; background: ${ACCENT_DIM} !important; }
      `}</style>

      <div className="prj-grid-bg" />
      <div className="prj-scanline-el" />

      <input ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES} style={{ display: "none" }} onChange={handleFileChange} />

      {/* pipeline nav */}
      <nav style={{ height: 48, borderBottom: `1px solid ${BORDER}`, background: SURFACE_0, display: "flex", alignItems: "center", paddingLeft: 16, paddingRight: 20, zIndex: 40, flexShrink: 0, position: "relative" }}>
        <button type="button" onClick={() => router.push("/photographer/projects")} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: "4px 12px 4px 0", borderRight: `1px solid ${BORDER}`, marginRight: 16, flexShrink: 0 }}>
          <ArrowLeft size={12} color={TEXT_MUTED} />
          <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>RETURN_ROOT</span>
        </button>
        <span className="prj-tech-label" style={{ color: TEXT_MUTED, paddingRight: 16, borderRight: `1px solid ${BORDER}`, marginRight: 16, flexShrink: 0 }}>PIPELINE_STATUS</span>
        <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
          {WF_STEPS.map((step, i) => {
            const state = wfStates[i];
            const isActive = state === "current";
            const isDone = state === "done";
            return (
              <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: i === 0 ? 0 : 16, paddingRight: 16, borderLeft: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ width: 22, height: 22, border: isActive ? `1px solid ${ACCENT}` : isDone ? `1px solid #3f3f46` : `1px solid #222`, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? ACCENT_DIM : isDone ? "#0f0f0f" : "#050505", boxShadow: isActive ? `0 0 8px ${ACCENT_GLOW}` : "none", flexShrink: 0 }}>
                  {isDone ? <Check size={10} color="#71717a" /> : <span style={{ fontFamily: MONO, fontSize: 9, color: isActive ? ACCENT : "#444" }}>{String(i + 1).padStart(2, "0")}</span>}
                </div>
                <span className="prj-tech-label" style={{ color: isActive ? TEXT_BRIGHT : isDone ? "#555" : "#444", fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap", fontSize: "0.6rem" }}>{step.key}</span>
              </div>
            );
          })}
        </div>
        <span className="prj-tech-label" style={{ color: TEXT_BRIGHT, flexShrink: 0 }}>STEP <span style={{ color: ACCENT }}>{String(Math.min(currentStep, 5)).padStart(2, "0")}/05</span></span>
      </nav>

      {/* main */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden", zIndex: 10, position: "relative" }}>

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

            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginBottom: 12, background: isInviteActive ? "rgba(46,213,115,0.04)" : "transparent", border: `1px solid ${isInviteActive ? "rgba(46,213,115,0.15)" : "#222"}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isInviteActive ? "#2ed573" : "#444", flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 10, color: isInviteActive ? "#2ed573" : "#555" }}>
                {isInviteActive ? `LINK_ACTIVE · ${getStatusLabel(project.status)}` : "LINK_INACTIVE · 업로드 전"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => { setEditName(project.name); setEditCustomerName(project.customerName); setEditShootDate(project.shootDate); setEditDeadline(project.deadline); setEditRequiredCount(project.requiredCount); setSaveError(""); setEditMode(true); }} className="prj-btn-secondary" style={{ flex: 1, padding: "8px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Pencil size={10} />EDIT_META
              </button>
              <button type="button" onClick={() => { if (canViewSelections) router.push(`/photographer/projects/${id}/results`); }} className="prj-btn-primary" style={{ flex: 1, padding: "8px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: canViewSelections ? 1 : 0.4, cursor: canViewSelections ? "pointer" : "not-allowed" }}>
                <ListChecks size={10} />SELECT_MODE
              </button>
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
                  {isUploading ? (uploadPhase === "processing" ? "COMPRESSING..." : "UPLOADING...") : "INITIALIZE_TRANSFER"}
                </p>
                <p className="prj-tech-label" style={{ color: "#444", fontSize: "0.55rem" }}>
                  {isUploading ? `${uploadProgress}% COMPLETE` : "DRAG & DROP OR CLICK TO SELECT"}
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
                  {isUploading ? `${uploadProgress}%` : `${progressPct}%`}
                </span>
              </div>
              <div style={{ height: 3, background: "#111", position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${isUploading ? uploadProgress : progressPct}%`, background: ACCENT, height: "100%", position: "relative", overflow: "hidden", transition: "width 0.3s" }}>
                  {(isUploading || progressPct > 0) && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.25)", width: "20%", animation: "prj-bar-scan 2s linear infinite" }} />
                  )}
                </div>
              </div>
              {uploadError && <p style={{ fontFamily: MONO, fontSize: 9, color: "#FF3333", marginTop: 8 }}>[ERR] {uploadError}</p>}
            </div>

            {/* PIN */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: `1px solid ${BORDER}`, marginBottom: 14, background: SURFACE_2 }}>
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

            {/* kakao */}
            <div style={{ marginBottom: 14 }}>
              <button type="button" onClick={handleKakaoShare} style={{ width: "100%", padding: "8px 0", background: "#FEE500", border: "none", color: "#191919", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <MessageCircle size={12} />카카오톡 공유
              </button>
            </div>

            <button type="button" onClick={() => setShowPinModal(true)} className="prj-btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 11, letterSpacing: "0.15em", opacity: (!isInviteActive && M < N) ? 0.4 : 1 }}>
              ENABLE_CLIENT_ACCESS
            </button>
          </section>

          {/* OPERATION_NODES */}
          <section style={{ background: SURFACE_1, padding: 20, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
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

          {/* DANGER */}
          <section style={{ background: SURFACE_1, padding: 20, marginTop: "auto" }}>
            <span className="prj-tech-label" style={{ color: "#FF3333", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>⚠ SYS.SEC :: DANGER_ZONE</span>
            <button type="button" onClick={() => { setDeleteError(""); setShowDeleteModal(true); }} className="prj-btn-danger" style={{ width: "100%", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Trash2 size={12} />TERMINATE_PROJECT
            </button>
          </section>
        </aside>

        {/* ── Right Panel ── */}
        <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
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
              <div style={{ display: "flex", gap: 2 }}>
                {(["all", "recent"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setPhotoFilter(tab)} className="prj-filter-tab prj-tech-label" style={{ padding: "4px 10px", background: photoFilter === tab ? ACCENT_DIM : "transparent", border: `1px solid ${photoFilter === tab ? "rgba(255,77,0,0.5)" : BORDER}`, color: photoFilter === tab ? ACCENT : TEXT_MUTED, fontSize: "0.58rem" }}>
                    {tab === "all" ? "ALL" : "RECENT_20"}
                  </button>
                ))}
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

          {/* photo grid */}
          <div className="prj-scroll" style={{ flex: 1, overflowY: "auto", background: "rgba(3,3,3,0.4)" }}>
            {photosLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>LOADING_DATABANK...</span>
              </div>
            ) : filteredPhotos.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                <div style={{ width: 48, height: 48, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Upload size={18} color={TEXT_MUTED} /></div>
                <span className="prj-tech-label" style={{ color: "#333" }}>NO_DATA_LOADED</span>
                <p style={{ fontFamily: MONO, fontSize: 10, color: "#2a2a2a", textAlign: "center" }}>왼쪽 드롭존에서 사진을 업로드하면 여기에 표시됩니다</p>
              </div>
            ) : viewMode === "grid" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 3, padding: 16 }}>
                {filteredPhotos.map((photo, i) => (
                  <PhotoThumb key={photo.id} photo={photo} index={i} onDelete={handleDeletePhoto} deletingId={deletingId} isEditMode={isPhotoEditMode} />
                ))}
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                {filteredPhotos.map((photo, i) => (
                  <div key={photo.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", border: `1px solid ${BORDER}`, marginBottom: 2, background: SURFACE_2, transition: "border-color 0.2s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,77,0,0.3)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, width: 50, flexShrink: 0 }}>IDX_{String(photo.orderIndex ?? i + 1).padStart(3, "0")}</span>
                    <div style={{ width: 48, height: 32, background: "#111", flexShrink: 0, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_NORMAL, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.originalFilename ?? `FRAME_${String(i + 1).padStart(4, "0")}`}</span>
                    {photo.fileSize && <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, flexShrink: 0 }}>{(photo.fileSize / 1024).toFixed(0)}KB</span>}
                    {isPhotoEditMode && (
                      <button onClick={() => handleDeletePhoto(photo.id)} disabled={deletingId === photo.id} style={{ background: "rgba(255,71,87,0.15)", border: "1px solid rgba(255,71,87,0.3)", color: "#FF4757", cursor: "pointer", padding: "3px 8px", flexShrink: 0, display: "flex", alignItems: "center" }}>
                        {deletingId === photo.id ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <X size={10} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
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

      {/* ── EDIT PROJECT MODAL ── */}
      {editMode && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setEditMode(false); setSaveError(""); } }}>
          <div className="prj-modal-box" style={{ maxWidth: 520 }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 6, height: 6, background: ACCENT }} /><span className="prj-tech-label" style={{ color: ACCENT }}>SYS.META :: EDIT_PROJECT</span></div>
              <button type="button" onClick={() => { setEditMode(false); setSaveError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 4 }}><X size={14} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                {[
                  { label: "PROJECT_NAME", value: editName, onChange: setEditName, type: "text" },
                  { label: "CLIENT_NAME", value: editCustomerName, onChange: setEditCustomerName, type: "text" },
                  { label: "SHOOT_DATE", value: editShootDate, onChange: setEditShootDate, type: "date" },
                  { label: "DEADLINE", value: editDeadline, onChange: setEditDeadline, type: "date" },
                ].map((f) => (
                  <label key={f.label} style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
                    <span style={{ ...labelStyle }}>{f.label}</span>
                    <input type={f.type} value={f.value} onChange={(e) => f.onChange(e.target.value)} className="prj-input-field" />
                  </label>
                ))}
              </div>
              <label style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
                <span style={{ ...labelStyle }}>
                  SELECT_COUNT (N) {!["preparing", "selecting"].includes(project.status) && <span style={{ color: C.orange }}>LOCKED</span>}
                </span>
                <input type="number" min={1} value={editRequiredCount} disabled={!["preparing", "selecting"].includes(project.status)} onChange={(e) => setEditRequiredCount(Number(e.target.value))} className="prj-input-field" />
              </label>
              {saveError && <div style={{ padding: "8px 12px", background: "rgba(255,51,51,0.08)", border: "1px solid rgba(255,51,51,0.2)", marginBottom: 16 }}><span style={{ fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>[ERR] {saveError}</span></div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setEditMode(false); setSaveError(""); }} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>CANCEL</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving} className="prj-btn-primary" style={{ flex: 1, padding: "10px 0", opacity: saving ? 0.5 : 1 }}>{saving ? "SAVING..." : "COMMIT_CHANGES"}</button>
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

      {/* ── DELETE MODAL ── */}
      {showDeleteModal && (
        <div className="prj-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowDeleteModal(false); }}>
          <div className="prj-modal-box" style={{ maxWidth: 400, borderColor: "rgba(255,51,51,0.25)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,51,51,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#FF3333" }}>[!]</span>
              <span className="prj-tech-label" style={{ color: "#FF3333" }}>SYS.SEC :: TERMINATE_CONFIRM</span>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: TEXT_NORMAL, lineHeight: 1.7, marginBottom: 8 }}>프로젝트를 영구적으로 삭제합니다.</p>
              <p style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, lineHeight: 1.8, marginBottom: 20 }}>모든 사진, 셀렉 데이터, 보정본이 삭제됩니다.<br />이 작업은 되돌릴 수 없습니다.</p>
              {deleteError && <div style={{ padding: "6px 10px", background: "rgba(255,51,51,0.08)", border: "1px solid rgba(255,51,51,0.2)", marginBottom: 16 }}><span style={{ fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>[ERR] {deleteError}</span></div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowDeleteModal(false)} disabled={deleting} className="prj-btn-secondary" style={{ flex: 1, padding: "10px 0" }}>ABORT</button>
                <button type="button" onClick={handleDeleteProject} disabled={deleting} className="prj-btn-danger" style={{ flex: 1, padding: "10px 0", opacity: deleting ? 0.5 : 1 }}>{deleting ? "TERMINATING..." : "CONFIRM_DELETE"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
