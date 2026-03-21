"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Upload, Loader2, FolderOpen, ImageIcon, CheckCircle2,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { getProjectById, getPhotosByProjectId } from "@/lib/db";
import type { Project, Photo } from "@/types";

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp";
const BACKEND_URL  = process.env.NEXT_PUBLIC_API_URL ?? "";
const THUMB_GAP    = 6;
const INITIAL_VISIBLE = 40;
const LOAD_MORE       = 40;

const VIEW_CONFIG = {
  filename: { cols: 8, rowH: 90  },  // 소형 + 파일명
  gallery:  { cols: 5, rowH: 140 },  // 대형, 파일명 없음
} as const;
type ViewMode = keyof typeof VIEW_CONFIG;

const C = {
  ink: "#0d1e28", surface: "#0f2030", surface2: "#152a3a", surface3: "#1a3347",
  steel: "#669bbc", steelLt: "#8db8d4",
  border: "rgba(102,155,188,0.12)", borderMd: "rgba(102,155,188,0.22)",
  text: "#e8eef2", muted: "#7a9ab0", dim: "#3a5a6e",
  green: "#2ed573", orange: "#f5a623", red: "#ff4757",
};

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
            fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
          }}>취소</button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: "8px 18px",
            background: danger ? "rgba(255,71,87,0.15)" : C.steel,
            border: danger ? "1px solid rgba(255,71,87,0.35)" : "none",
            borderRadius: 8, color: danger ? C.red : "white",
            fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
  photo, index, isReadOnly, deleting, onDelete, onClick, showFilename = true,
}: {
  photo: Photo; index: number; isReadOnly: boolean;
  deleting: boolean; onDelete: () => void; onClick: () => void; showFilename?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const filename = photo.originalFilename ?? `${index + 1}`;
  return (
    <div
      className="up-thumb"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}
      onClick={onClick}
    >
      {/* 이미지 영역 */}
      <div style={{
        aspectRatio: "3/2", background: C.surface2, borderRadius: 5,
        position: "relative", overflow: "hidden",
        border: `1px solid ${C.border}`, transition: "border-color 0.15s",
      }}>
        {/* placeholder */}
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
      {showFilename && (
        <div style={{
          fontSize: 9, color: C.muted, lineHeight: 1.3, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          padding: "0 2px",
        }}>
          {filename}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const thumbScrollRef = useRef<HTMLDivElement>(null);

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
  const [viewMode,            setViewMode]            = useState<ViewMode>("gallery");

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

  // ── 업로드 (파일 리스트를 직접 받아 즉시 시작) ────────────────────────
  const startUpload = useCallback(async (uploadFiles: File[]) => {
    if (!uploadFiles.length) return;
    setFiles(uploadFiles);
    setError(null); setUploadPhase("sending"); setUploadProgress(0);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const token = session?.access_token;
    if (userError || !user) { setError("로그인 인증을 확인할 수 없습니다."); setUploadPhase("idle"); return; }
    logUploadTokenDebug("v1-upload/photos", token);
    if (!token) { setError("로그인이 필요합니다."); setUploadPhase("idle"); return; }

    const form = new FormData();
    form.append("project_id", id);
    uploadFiles.forEach((f) => form.append("files", f));

    const xhr = new XMLHttpRequest();
    const resetState = () => { setUploadPhase("idle"); setUploadProgress(0); setFiles([]); };

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(e.total > 0 ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : 0);
        if (e.loaded >= e.total && e.total > 0) setUploadPhase("processing");
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadPhase("done");
        fetch("/api/photographer/project-logs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id, action: "uploaded" }),
        }).catch(() => {});
        setTimeout(() => {
          resetState();
          setToast("업로드 완료!");
          loadProject(); loadPhotos(); router.refresh();
        }, 800);
      } else {
        let msg = "업로드에 실패했습니다.";
        try {
          const b = JSON.parse(xhr.responseText);
          if (b.detail) msg = typeof b.detail === "string" ? b.detail : b.detail[0]?.msg ?? msg;
        } catch {}
        setError(msg); resetState();
      }
    });
    xhr.addEventListener("error", () => { setError("네트워크 오류가 발생했습니다."); resetState(); });
    xhr.addEventListener("abort", resetState);
    xhr.open("POST", `${BACKEND_URL}/api/upload/photos`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  }, [id, loadProject, loadPhotos, router]);

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
      fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(5px);} to{opacity:1;transform:translateY(0);} }
        .up-dropzone:hover { border-color: ${C.steel} !important; background: rgba(102,155,188,0.05) !important; }
        .up-thumb:hover .up-thumb-del { opacity: 1 !important; }
        .up-thumb:hover { border-color: ${C.borderMd} !important; }
        .thumb-scroll::-webkit-scrollbar { width: 4px; }
        .thumb-scroll::-webkit-scrollbar-track { background: transparent; }
        .thumb-scroll::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 2px; }
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
            fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
              background: "rgba(102,155,188,0.06)", border: `1px solid ${C.borderMd}`,
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
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3, color: s.color,
                }}>{s.num}</div>
                <div style={{ fontSize: 10, color: C.dim }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 드롭존 */}
          {!isReadOnly && (
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
                background: dragOver ? "rgba(102,155,188,0.05)" : "rgba(102,155,188,0.02)",
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
                    fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
                  }}
                >
                  <Upload size={12} /> 파일 선택
                </button>
              </div>
            </div>
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
                    {uploadPhase === "processing" ? "처리 중..." : `전체 ${files.length}장 업로드 중`}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: C.muted }}>
                  {uploadPhase === "processing" ? "거의 완료" : `${uploadProgress}%`}
                </span>
              </div>
              <div style={{ height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: C.steel, borderRadius: 2,
                  width: uploadPhase === "processing" ? "100%" : `${uploadProgress}%`,
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
                      fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
                    fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
                          showFilename={viewMode === "filename"}
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
          borderTop: "1px solid rgba(102,155,188,0.15)",
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
              fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
                  fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
                  fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
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
