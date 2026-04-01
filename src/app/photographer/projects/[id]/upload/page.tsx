"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Upload, Loader2, FolderOpen, ImageIcon, CheckCircle2, AlertCircle,
} from "lucide-react";
import { BETA_MAX_PHOTOS_PER_PROJECT, parseBetaLimitError } from "@/lib/beta-limits";
import { useVirtualizer } from "@tanstack/react-virtual";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import type { Project, Photo } from "@/types";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const BACKEND_URL  = process.env.NEXT_PUBLIC_API_URL ?? "";
const THUMB_GAP    = 6;
const INITIAL_VISIBLE = 40;
const LOAD_MORE       = 40;
const BATCH_SIZE  = 5;
const BATCH_DELAY = 500; // ms

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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: "8px 16px", background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.muted, fontSize: 13, cursor: "pointer",
            fontFamily: PS_FONT,
          }}>취소</button>
          <button onClick={onConfirm} disabled={loading} style={{
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
  photo, index, isReadOnly, deleting, onDelete, onClick,
}: {
  photo: Photo; index: number; isReadOnly: boolean;
  deleting: boolean; onDelete: () => void; onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const filename = photo.originalFilename ?? `${index + 1}`;
  return (
    <div
      className="up-thumb"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}
      onClick={onClick}
    >
      {/* 이미지 영역 */}
      <div style={{
        aspectRatio: "3/2", background: C.surface2, borderRadius: 5,
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
            className="up-thumb-del"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            style={{
              position: "absolute", top: 3, right: 3,
              width: 16, height: 16, borderRadius: "50%",
              background: "rgba(255,71,87,0.85)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "white", opacity: 0, cursor: "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {deleting
              ? <Loader2 size={8} style={{ animation: "spin 1s linear infinite" }} />
              : "✕"}
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
  const { cols, rowH } = VIEW_CONFIG[viewMode];

  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount],
  );
  const rowCount = Math.ceil(visiblePhotos.length / cols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => thumbScrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
  });

  // ── 라이트박스 키보드 ──
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
      else if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length));
      else if (e.key === "Escape") setLightboxIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, photos.length]);

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
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

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

  // ── 업로드 (5장씩 배치 순차 처리) ────────────────────────────────────
  const startUpload = useCallback(async (uploadFiles: File[]) => {
    if (!uploadFiles.length) return;
    setFiles(uploadFiles);
    setError(null);
    setUploadPhase("sending");
    setUploadProgress(0);
    setProcessedCount(0);
    setUploadSummary(null);
    setStopRequested(false);
    stopRequestedRef.current = false;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const token = session?.access_token;
    logUploadTokenDebug("v1-upload/photos", token);
    if (userError || !user) { setError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); return; }
    if (!token) { setError("로그인이 필요합니다."); setUploadPhase("idle"); return; }

    // 배치 분할
    const batches: File[][] = [];
    for (let i = 0; i < uploadFiles.length; i += BATCH_SIZE) {
      batches.push(uploadFiles.slice(i, i + BATCH_SIZE));
    }
    setBatchProgress({ current: 0, total: batches.length });

    let totalUploaded = 0;
    const allFailed: File[] = [];
    let wasStopped = false;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      if (stopRequestedRef.current) { wasStopped = true; break; }

      const batch = batches[batchIdx];
      setBatchProgress({ current: batchIdx + 1, total: batches.length });
      setUploadProgress(Math.round((batchIdx / batches.length) * 100));
      setProcessedCount(Math.min((batchIdx + 1) * BATCH_SIZE, uploadFiles.length));

      try {
        const form = new FormData();
        form.append("project_id", id);
        batch.forEach((f) => form.append("files", f));

        const res = await fetch(`${BACKEND_URL}/api/upload/photos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          totalUploaded += data.uploaded ?? batch.length;
        } else {
          try {
            const b = await res.json();
            const betaErr = parseBetaLimitError(b);
            if (betaErr) {
              setError(betaErr.message);
              setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
              return;
            }
          } catch {}
          allFailed.push(...batch);
        }
      } catch {
        allFailed.push(...batch);
      }

      setUploadProgress(Math.round(((batchIdx + 1) / batches.length) * 100));

      if (batchIdx < batches.length - 1 && !stopRequestedRef.current) {
        await new Promise<void>((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (wasStopped) {
      setUploadPhase("idle"); setUploadProgress(0); setFiles([]);
      setToast("업로드가 중지됐습니다. 언제든 이어서 업로드할 수 있어요.");
      loadProject(); loadPhotos(); router.refresh();
    } else {
      setUploadSummary({ total: uploadFiles.length, succeeded: totalUploaded, failedFiles: allFailed });
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
      (f) => ["image/jpeg","image/png","image/webp"].includes(f.type)
    );
    setError(null);
    if (list.length) setPendingFiles(list);
  }, []);

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    const list = Array.from(chosen).filter((f) => ["image/jpeg","image/png","image/webp"].includes(f.type));
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
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      fontFamily: PS_FONT,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(5px);} to{opacity:1;transform:translateY(0);} }
        .up-dropzone:hover { border-color: ${C.steel} !important; background: rgba(79,126,255,0.05) !important; }
        .up-thumb:hover .up-thumb-del { opacity: 1 !important; }
        .up-thumb:hover { border-color: ${C.borderMd} !important; }
        .thumb-scroll::-webkit-scrollbar { width: 4px; }
        .thumb-scroll::-webkit-scrollbar-track { background: transparent; }
        .thumb-scroll::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 2px; }
        .fn-row:hover { background: rgba(79,126,255,0.05); }
        .fn-row:hover span:last-child { opacity: 1 !important; }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, flexShrink: 0, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 12, padding: "0 24px",
        background: "rgba(13,30,40,0.85)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
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
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── 상단 고정 섹션 (프로젝트 정보 + 통계 + 드롭존) ── */}
        <div style={{ flexShrink: 0, padding: "16px 24px 0" }}>

          {isReadOnly && (
            <div style={{
              marginBottom: 12, padding: "9px 14px", borderRadius: 8,
              background: "rgba(79,126,255,0.06)", border: `1px solid ${C.borderMd}`,
              fontSize: 12, color: C.muted,
            }}>
              📌 고객 셀렉이 시작되어 사진 수정이 불가합니다.
            </div>
          )}

          {/* 프로젝트 정보 — 컴팩트 가로 바 */}
          <div style={{
            display: "flex", gap: 0, alignItems: "center", flexWrap: "wrap",
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, marginBottom: 12, overflow: "hidden",
          }}>
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

          {/* 통계 3분할 */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1, background: C.border, borderRadius: 10,
            marginBottom: 12, overflow: "hidden",
            animation: "fadeUp 0.3s ease 0.05s both",
          }}>
            {[
              { num: M,                                    label: "업로드됨", color: C.steel  },
              { num: photoCountExpected ?? "-",            label: "예정 수",  color: C.orange },
              { num: remaining !== null ? remaining : "-", label: "남은 수",  color: C.muted  },
            ].map((s, i) => (
              <div key={i} style={{
                background: C.surface, padding: "12px 16px", textAlign: "center",
                borderRadius: i === 0 ? "10px 0 0 10px" : i === 2 ? "0 10px 10px 0" : 0,
              }}>
                <div style={{
                  fontFamily: PS_DISPLAY,
                  fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3, color: s.color,
                }}>{s.num}</div>
                <div style={{ fontSize: 10, color: C.dim }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 드롭존 */}
          {!isReadOnly && (
            <>
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
                <div
                  className="up-dropzone"
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
                  <input
                    ref={fileInputRef} type="file" accept={ACCEPT_TYPES} multiple
                    style={{ display: "none" }} onChange={handleFileChange}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <FolderOpen size={20} color={C.dim} />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>
                        사진을 드래그하거나 클릭해서 선택
                      </div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                        JPEG · PNG · WebP · 최대 20MB/장
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
                  {/* 베타 업로드 카운터 */}
                  <div style={{
                    marginTop: 10, textAlign: "right",
                    fontSize: 11,
                    color: isPhotoLimitNear ? C.orange : C.dim,
                  }}>
                    {M} / {BETA_MAX_PHOTOS_PER_PROJECT}장 (베타 한도)
                  </div>
                </div>
              )}
            </>
          )}

          {/* 업로드 진행 표시 */}
          {isUploading && files.length > 0 && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "12px 16px", marginBottom: 12,
              animation: "fadeUp 0.25s ease both",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={13} color={C.steel} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>
                    업로드 중 {processedCount} / {files.length}장
                  </span>
                  {batchProgress.total > 0 && (
                    <span style={{ fontSize: 11, color: C.dim }}>
                      (배치 {batchProgress.current}/{batchProgress.total})
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{uploadProgress}%</span>
                  {uploadPhase === "sending" && (
                    stopRequested ? (
                      <span style={{ fontSize: 11, color: C.orange }}>중지 요청됨...</span>
                    ) : (
                      <button
                        onClick={handleStopUpload}
                        style={{
                          padding: "3px 10px", fontSize: 11, cursor: "pointer",
                          background: "transparent", border: `1px solid ${C.borderMd}`,
                          borderRadius: 5, color: C.muted, fontFamily: PS_FONT,
                        }}
                      >
                        업로드 중지
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
            </div>
          )}

          {uploadPhase === "done" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.green, marginBottom: 10 }}>
              <CheckCircle2 size={15} /> 업로드 완료!
            </div>
          )}

          {error && (
            <div style={{
              padding: "9px 14px", borderRadius: 8, marginBottom: 10,
              background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)",
              fontSize: 12, color: C.red,
            }}>
              {error}
            </div>
          )}

          {/* 업로드 실패 파일 요약 */}
          {uploadSummary && uploadSummary.failedFiles.length > 0 && uploadPhase === "idle" && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 10,
              background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.25)",
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 600, color: C.orange, marginBottom: 6 }}>
                {uploadSummary.total}장 중 {uploadSummary.succeeded}장 성공,{" "}
                {uploadSummary.failedFiles.length}장 실패
              </div>
              <div style={{
                maxHeight: 72, overflowY: "auto", marginBottom: 10,
                borderRadius: 4, background: "rgba(0,0,0,0.1)", padding: "6px 8px",
              }}>
                {uploadSummary.failedFiles.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
                    {f.name}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const f = uploadSummary.failedFiles;
                  setUploadSummary(null);
                  startUpload(f);
                }}
                style={{
                  padding: "5px 12px", fontSize: 11, cursor: "pointer",
                  background: "rgba(255,165,0,0.15)", border: "1px solid rgba(255,165,0,0.3)",
                  borderRadius: 5, color: C.orange, fontFamily: PS_FONT,
                }}
              >
                실패 파일 재시도
              </button>
            </div>
          )}

          {/* 사진 섹션 헤더 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 0 10px",
            borderTop: `1px solid ${C.border}`,
            marginTop: 4,
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
              {/* 보기 옵션 토글 */}
              <div style={{
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

              {!isReadOnly && photos.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllModal(true)}
                  style={{
                    background: "transparent", border: "none", fontSize: 11,
                    color: C.red, cursor: "pointer",
                    fontFamily: PS_FONT,
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
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px 24px",
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
                const startIdx = virtualRow.index * cols;

                // ── 파일명 리스트 모드 ──
                if (viewMode === "filename") {
                  const photo = visiblePhotos[startIdx];
                  if (!photo) return null;
                  const filename = photo.originalFilename ?? `${startIdx + 1}`;
                  const fileSize = photo.fileSize ?? null;
                  const fileSizeText = fileSize != null
                    ? fileSize >= 1024 * 1024
                      ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.round(fileSize / 1024)} KB`
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
                        height: 31,
                        borderBottom: `1px solid ${C.border}`,
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
                            : <span style={{ fontSize: 13 }}>✕</span>}
                        </button>
                      )}
                    </div>
                  );
                }

                // ── 갤러리 모드 ──
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: virtualRow.start,
                      left: 0, right: 0,
                      display: "grid",
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
                      gap: THUMB_GAP,
                      paddingBottom: THUMB_GAP,
                    }}
                  >
                    {Array.from({ length: cols }, (_, c) => {
                      const photo = visiblePhotos[startIdx + c];
                      if (!photo) return <div key={c} style={{ aspectRatio: "3/2" }} />;
                      return (
                        <LazyThumb
                          key={photo.id}
                          photo={photo}
                          index={startIdx + c}
                          isReadOnly={isReadOnly}
                          deleting={deletingId === photo.id}
                          onDelete={() => handleDeletePhoto(photo.id)}
                          onClick={() => setLightboxIndex(startIdx + c)}
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
        <div style={{
          position: "fixed", bottom: 0, left: 220, right: 0,
          background: "rgba(0,48,73,0.95)", backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(79,126,255,0.15)",
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
                ⚠ {N}장 이상 업로드 시 고객 초대 가능
              </div>
            )}
          </div>

          <button
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
          onClick={() => setLightboxIndex(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.92)", padding: 16, cursor: "default",
          }}
          role="dialog" aria-modal aria-label="이미지 미리보기"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length); }}
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", padding: 12, color: "white", cursor: "pointer", zIndex: 20, fontSize: 18 }}
          >←</button>
          <img
            src={photos[lightboxIndex].url} alt="미리보기"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", position: "relative", zIndex: 10 }}
          />
          <button
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
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
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
