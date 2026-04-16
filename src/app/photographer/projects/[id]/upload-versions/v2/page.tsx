"use client";

import { useCallback, useEffect, useMemo, useRef, useState, CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  Upload,
  Image,
  ArrowRight,
  Check,
  ArrowUpDown,
  AlertCircle,
  RefreshCw,
  Pencil,
  Send,
  Copy,
  Download,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Link2,
  Lock,
  Eye,
  EyeOff,
  ListChecks,
  PenLine,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPhotosWithSelections, getProjectById, getVersionReviewsByProjectId } from "@/lib/db";
import { buildVersionMapping, clearSingleFile, remapSingleFile, type MappingResult } from "@/lib/version-mapping";
import type { Photo, Project } from "@/types";
import CompareViewerModal from "@/components/CompareViewerModal";
import { BETA_MAX_REVISION_COUNT } from "@/lib/beta-limits";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import { ProjectPipelineHeader } from "@/components/photographer/ProjectPipelineHeader";
import { getStatusLabel } from "@/lib/project-status";

/** Nexus design tokens — 동일한 오렌지 테마 */
const ACCENT       = "#FF5A1F";
const ACCENT_DIM   = "rgba(255, 90, 31, 0.15)";
const BORDER       = "#1f1f1f";
const BORDER_MID   = "#2a2a2a";
const SURFACE_0    = "#020202";
const SURFACE_1    = "#050505";
const SURFACE_2    = "#0a0a0a";
const MONO         = "'Space Mono', 'JetBrains Mono', monospace";
const DISPLAY      = "'Space Grotesk', 'Pretendard', sans-serif";
const TEXT_MUTED   = "#5c5c5c";
const TEXT_NORMAL  = "#a3a3a3";
const TEXT_BRIGHT  = "#ffffff";

const GREEN        = "#22c55e";
const GREEN_DIM    = "rgba(34,197,94,0.1)";
const AMBER        = "#f59e0b";
const AMBER_DIM    = "rgba(245,158,11,0.1)";
const RED          = "#ef4444";
const RED_DIM      = "rgba(239,68,68,0.1)";

/** results 페이지 좌측 사이드와 동일 폭 */
const ASIDE_W = 360;
/** REVISION_ORIGINALS 한 줄에 보이는 최대 썸네일 수 */
const REVISION_ORIGINALS_ROW_MAX = 5;

/** 모바일/아이폰: 넓은 선택 + HEIC */
const ACCEPT_IMAGE_TYPES = "image/*,image/heic,image/heif";
function isAcceptedImageFile(f: File): boolean {
  return f.type.startsWith("image/") || f.type === "";
}

type VersionRowMeta = { url: string; fileSize: number | null };

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

function buildRevisionExportText(items: Array<{ filename: string; comment: string | null }>) {
  const lines: string[] = [];
  lines.push("=== 재보정 요청 목록 ===");
  items.forEach((it, idx) => {
    lines.push(`${idx + 1}. ${it.filename}`);
    lines.push(`   고객 코멘트: "${it.comment ?? ""}"`);
  });
  return lines.join("\n");
}

type V2Target = { id: string; photo: Photo; filename: string; comment: string | null };

// ---------- main page ----------
export default function UploadVersionsV2Page() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const multiInputRef   = useRef<HTMLInputElement | null>(null);
  const perItemInputRef = useRef<HTMLInputElement | null>(null);

  const [perItemTargetId, setPerItemTargetId] = useState<string | null>(null);
  const [project,         setProject]         = useState<Project | null>(null);
  const [photos,          setPhotos]          = useState<Photo[]>([]);
  const [reviews,         setReviews]         = useState<
    Array<{ photoId: string; status: "approved" | "revision_requested"; customerComment: string | null }>
  >([]);
  const [serverV1Map,          setServerV1Map]          = useState<Map<string, VersionRowMeta>>(new Map());
  const [serverV2Map,          setServerV2Map]          = useState<Map<string, VersionRowMeta>>(new Map());
  const [existingVersionCount, setExistingVersionCount] = useState<number>(0);
  const [loading,         setLoading]         = useState(true);
  const [reviewLoading,   setReviewLoading]   = useState(false);
  const [uploadedFiles,   setUploadedFiles]   = useState<File[]>([]);
  const [mapping,         setMapping]         = useState<MappingResult<V2Target>[]>([]);
  const [dragOver,        setDragOver]        = useState(false);
  const [globalMemo,      setGlobalMemo]      = useState("");
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [compareOpen,     setCompareOpen]     = useState(false);
  const [compareInitIdx,  setCompareInitIdx]  = useState(0);
  const [lightboxItems,   setLightboxItems]   = useState<Array<{ url: string; label: string; sublabel?: string | null }>>([]);
  const [lightboxIndex,   setLightboxIndex]   = useState<number | null>(null);
  const [copied,          setCopied]          = useState(false);
  const [showPinModal,    setShowPinModal]    = useState(false);
  const [pinInput,        setPinInput]        = useState("");
  const [pinVisible,      setPinVisible]      = useState(false);
  const [pinSaving,       setPinSaving]       = useState(false);
  const [pinError,        setPinError]        = useState("");

  // ── load project + selected photos ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectById(id)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
        if (!p) return;
        return getPhotosWithSelections(p.id).then((result) => {
          if (cancelled || !result) return;
          const selected = result.photos.filter((ph) => result.selectedIds.has(ph.id));
          selected.sort((a, b) =>
            getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, { sensitivity: "base" })
          );
          setPhotos(selected);
        });
      })
      .catch((e) => { if (!cancelled) { console.error(e); setError(e instanceof Error ? e.message : "로드 실패"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // ── load version reviews ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setReviewLoading(true);
    getVersionReviewsByProjectId(id)
      .then((list) => {
        if (cancelled) return;
        setReviews(
          (list ?? []).map((r) => ({
            photoId: r.photoId,
            status: r.status,
            customerComment: r.customerComment,
          }))
        );
      })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setReviewLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // ── load server v1 + v2 URLs ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/photographer/projects/${id}/versions`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.versions) ? data.versions : [];
        const v1 = new Map<string, VersionRowMeta>();
        const v2 = new Map<string, VersionRowMeta>();
        list.forEach((it: { version?: number; photo_id?: string; r2_url?: string; file_size?: number | null }) => {
          if (!it.photo_id || !it.r2_url) return;
          const meta: VersionRowMeta = { url: it.r2_url, fileSize: it.file_size ?? null };
          if (it.version === 1) v1.set(it.photo_id, meta);
          if (it.version === 2) v2.set(it.photo_id, meta);
        });
        setServerV1Map(v1);
        setServerV2Map(v2);
        const distinctVersions = new Set(
          list.map((it: { version?: number }) => it.version).filter(Boolean)
        );
        setExistingVersionCount(distinctVersions.size);
      })
      .catch(() => { if (!cancelled) { setServerV1Map(new Map()); setServerV2Map(new Map()); } });
    return () => { cancelled = true; };
  }, [id]);

  // ── route guard ──
  useEffect(() => {
    if (!project || !id) return;
    if (project.status === "editing_v2" || project.status === "reviewing_v2") return;
    router.replace(`/photographer/projects/${id}`);
  }, [project, id, router]);

  const isReadOnly = project?.status === "reviewing_v2";

  const reviewByPhotoId = useMemo(() => {
    const m = new Map<string, { status: "approved" | "revision_requested"; comment: string | null }>();
    reviews.forEach((r) => m.set(r.photoId, { status: r.status, comment: r.customerComment }));
    return m;
  }, [reviews]);

  const approvedPhotos = useMemo(
    () => photos.filter((p) => reviewByPhotoId.get(p.id)?.status === "approved"),
    [photos, reviewByPhotoId]
  );

  const revisionTargets = useMemo<V2Target[]>(() => {
    return photos
      .map((p) => {
        const rev = reviewByPhotoId.get(p.id);
        if (rev?.status !== "revision_requested") return null;
        return { id: p.id, photo: p, filename: getDisplayFilename(p), comment: rev.comment ?? null };
      })
      .filter(Boolean) as V2Target[];
  }, [photos, reviewByPhotoId]);

  const uploadedFilesRef = useRef<File[]>([]);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    if (revisionTargets.length === 0) return;
    setMapping((prev) => {
      const sameStructure =
        prev.length === revisionTargets.length &&
        prev.every((m, i) => m.target.id === revisionTargets[i]?.id);
      if (sameStructure) return prev;
      const files = uploadedFilesRef.current;
      if (files.length === 0) return buildVersionMapping([], revisionTargets);
      return buildVersionMapping(files, revisionTargets);
    });
  }, [revisionTargets]);

  const localV2PreviewMap = useMemo(() => {
    const m = new Map<string, string>();
    mapping.forEach((item) => { if (item.file) m.set(item.target.id, URL.createObjectURL(item.file)); });
    return m;
  }, [mapping]);

  useEffect(() => () => { localV2PreviewMap.forEach((url) => URL.revokeObjectURL(url)); }, [localV2PreviewMap]);

  const comparePhotos = useMemo(() => {
    return revisionTargets
      .map((t) => {
        const v1 = serverV1Map.get(t.id)?.url;
        const v2 = localV2PreviewMap.get(t.id) ?? serverV2Map.get(t.id)?.url;
        if (!v1 && !v2) return null;
        return {
          original: { url: viewerImageUrl(t.photo), filename: t.filename },
          v1: v1 ? { url: v1, filename: t.filename } : undefined,
          v2: v2 ? { url: v2, filename: t.filename } : undefined,
        };
      })
      .filter(Boolean) as Array<{
        original: { url: string; filename: string };
        v1?: { url: string; filename: string };
        v2?: { url: string; filename: string };
      }>;
  }, [revisionTargets, serverV1Map, serverV2Map, localV2PreviewMap]);

  const openLightbox = useCallback((items: Array<{ url: string; label: string; sublabel?: string | null }>, index: number) => {
    setLightboxItems(items);
    setLightboxIndex(index);
  }, []);

  const openCompareByTarget = useCallback((targetId: string) => {
    const idx = comparePhotos.findIndex((item) => {
      const t = revisionTargets.find((r) => r.id === targetId);
      return t ? item.original.filename === t.filename : false;
    });
    if (idx < 0) return;
    setCompareInitIdx(idx);
    setCompareOpen(true);
  }, [comparePhotos, revisionTargets]);

  const mappedCount = useMemo(() => {
    if (isReadOnly) return serverV2Map.size;
    return mapping.filter((m) => m.file != null).length;
  }, [isReadOnly, serverV2Map, mapping]);

  const localMappedFileCount = useMemo(() => mapping.filter((m) => m.file != null).length, [mapping]);

  const stats = useMemo(() => {
    let exact = 0, order = 0;
    mapping.forEach((m) => { if (m.type === "exact") exact++; else if (m.type === "order") order++; });
    return { exact, order };
  }, [mapping]);

  const canDeliver = useMemo(() => {
    if (isReadOnly || project?.status !== "editing_v2") return false;
    if (revisionTargets.length === 0) return false;
    return mapping.length === revisionTargets.length && mapping.every((m) => m.file != null);
  }, [isReadOnly, project?.status, revisionTargets.length, mapping]);

  const handleDropFiles = useCallback((files: File[]) => {
    const filtered = files.filter(isAcceptedImageFile);
    if (revisionTargets.length === 0) return;
    setUploadedFiles(filtered);
    setMapping(buildVersionMapping(filtered, revisionTargets));
  }, [revisionTargets]);

  const handleClearFile = useCallback((targetId: string) => {
    let fileToRemove: File | null = null;
    setMapping((prev) => {
      const row = prev.find((r) => r.target.id === targetId);
      fileToRemove = row?.file ?? null;
      return clearSingleFile(prev, targetId);
    });
    if (fileToRemove) {
      setUploadedFiles((ufs) => ufs.filter((f) => f !== fileToRemove));
    }
  }, []);

  const handleChangeOne = useCallback((targetId: string) => {
    setPerItemTargetId(targetId);
    setTimeout(() => perItemInputRef.current?.click(), 0);
  }, []);

  const handlePerItemSelect = useCallback((fileList: FileList | null) => {
    if (!fileList?.length || !perItemTargetId) return;
    const file = Array.from(fileList).find(isAcceptedImageFile);
    if (!file) return;
    setMapping((prev) => remapSingleFile(prev, perItemTargetId, file));
    setPerItemTargetId(null);
  }, [perItemTargetId]);

  const handleCopy = useCallback(async () => {
    const text = buildRevisionExportText(revisionTargets.map((r) => ({ filename: r.filename, comment: r.comment })));
    await navigator.clipboard.writeText(text);
  }, [revisionTargets]);

  const handleDownloadTxt = useCallback(() => {
    const text = buildRevisionExportText(revisionTargets.map((r) => ({ filename: r.filename, comment: r.comment })));
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision_requests_${id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [revisionTargets, id]);

  const handleDeliver = useCallback(async () => {
    if (!project || !canDeliver) return;
    setSubmitting(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const token = session?.access_token;
      if (userError || !user) throw new Error("로그인 인증을 확인할 수 없습니다. 다시 로그인 후 시도해주세요.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const ordered = mapping.filter((m) => m.file != null) as Array<MappingResult<V2Target> & { file: File }>;
      const form = new FormData();
      form.append("project_id", id);
      form.append("version", "2");
      form.append("photo_ids", ordered.map((m) => m.target.id).join(","));
      ordered.forEach((m) => form.append("files", m.file));
      form.append("global_memo", globalMemo);

      const uploadRes = await fetch("/api/photographer/upload-versions", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        const msg = uploadData.error ?? (typeof uploadData.detail === "string"
          ? uploadData.detail : Array.isArray(uploadData.detail)
            ? uploadData.detail[0]?.msg ?? uploadData.detail[0]?.message : null);
        throw new Error(msg ?? "업로드 실패");
      }

      const patchRes = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewing_v2" }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) throw new Error(patchData.error ?? "상태 변경 실패");
      router.push(`/photographer/projects/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전달 실패");
    } finally {
      setSubmitting(false); setShowConfirm(false);
    }
  }, [project, canDeliver, mapping, id, globalMemo, router]);

  const handleSavePin = useCallback(async (newPin: string | null) => {
    if (!project) return;
    setPinError("");
    setPinSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_pin: newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({ ...project, accessPin: newPin });
      setShowPinModal(false);
      setPinInput("");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setPinSaving(false);
    }
  }, [project, id]);

  // ── derived display ──
  const displayMapping = mapping.length > 0 ? mapping : buildVersionMapping([], revisionTargets);
  const emptyCount = mapping.length > 0 ? mapping.filter((m) => m.file == null).length : 0;

  const readOnlyItems = isReadOnly
    ? revisionTargets.map((t) => {
        const v1m = serverV1Map.get(t.id);
        const v2m = serverV2Map.get(t.id);
        return {
          target: t,
          type: (v2m ? "exact" : "none") as "exact" | "none",
          serverUrl: v2m?.url,
          storedFileSizeBytes: v2m?.fileSize ?? null,
          v1Url: v1m?.url,
        };
      })
    : [];

  const lightboxRevisionItems = useMemo(
    () => revisionTargets.map((t) => ({ url: viewerImageUrl(t.photo), label: t.filename, sublabel: t.comment })),
    [revisionTargets]
  );

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `/c/${project?.accessToken ?? ""}`;
    return `${window.location.origin}/c/${project?.accessToken ?? ""}`;
  }, [project?.accessToken]);

  const handleCopyLink = useCallback(() => {
    const pin = project?.accessPin;
    void navigator.clipboard.writeText(pin ? `링크: ${inviteUrl}\n비밀번호: ${pin}` : inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [project?.accessPin, inviteUrl]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: SURFACE_0,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: "0.63rem", letterSpacing: "0.2em", textTransform: "uppercase", color: TEXT_MUTED }}>
          LOADING_V2_RETOUCH_VIEW…
        </span>
      </div>
    );
  }
  if (!project) return null;

  const scrollBottomPad = isReadOnly ? 48 : 120;

  const revisionShowMore = revisionTargets.length > REVISION_ORIGINALS_ROW_MAX;
  const revisionVisible  = revisionShowMore ? revisionTargets.slice(0, REVISION_ORIGINALS_ROW_MAX) : revisionTargets;
  const revisionMoreCount = Math.max(0, revisionTargets.length - revisionVisible.length);
  const revisionRowCols   = revisionVisible.length + (revisionShowMore ? 1 : 0);

  const N = project.requiredCount || 0;
  const canViewSelections  = project.status !== "preparing";
  const canEditVersions    = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview          = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath   =
    project.status === "editing_v2" || project.status === "reviewing_v2"
      ? `/photographer/projects/${id}/upload-versions/v2`
      : `/photographer/projects/${id}/upload-versions`;
  const isInviteActive = project.status !== "preparing";

  const pinModalLabelStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: "0.6rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: TEXT_MUTED,
    display: "block",
    marginBottom: 6,
  };

  return (
    <div
      className={`ph-uv-root${isReadOnly ? " ph-uv-readonly" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        width: "100%",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        boxSizing: "border-box",
        position: "relative",
        background: SURFACE_0,
        color: TEXT_NORMAL,
      }}
    >
      <style>{`
        @keyframes ph-uv-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes prj-scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        .ph-uv-grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(30,30,30,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,0.2) 1px, transparent 1px); background-size: 30px 30px; z-index: 0; pointer-events: none; }
        .ph-uv-scanlines { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.3)); background-size: 100% 4px; z-index: 1; pointer-events: none; }
        .ph-uv-ambient { position: fixed; top: -20%; left: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, rgba(255,90,31,0.15) 0%, transparent 50%); z-index: 0; pointer-events: none; opacity: 0.15; }
        .prj-scanline-el { width: 100%; height: 100px; position: fixed; bottom: 100%; background: linear-gradient(0deg, rgba(255,90,31,0.04) 0%, rgba(255,90,31,0) 100%); animation: prj-scanline 8s linear infinite; pointer-events: none; z-index: 2; }
        .ph-uv-tech-label { font-family: ${MONO}; font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; }
        .ph-uv-scroll::-webkit-scrollbar { width: 6px; }
        .ph-uv-scroll::-webkit-scrollbar-track { background: ${SURFACE_0}; border-left: 1px solid ${BORDER}; }
        .ph-uv-scroll::-webkit-scrollbar-thumb { background: #333; }
        .ph-uv-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .ph-uv-dashed-dropzone {
          box-sizing: border-box;
          padding: 24px 28px 28px;
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23333' stroke-width='2' stroke-dasharray='8%2c 8' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
          background-origin: border-box;
          background-clip: border-box;
          transition: background-color 0.2s ease, background-image 0.2s ease;
        }
        .ph-uv-dashed-dropzone:hover, .ph-uv-dashed-dropzone.ph-uv-dz-over {
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23FF5A1F' stroke-width='2' stroke-dasharray='8%2c 8' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
          background-color: ${ACCENT_DIM};
        }
        .ph-uv-memo {
          background: #080808; border: 1px solid ${BORDER}; color: ${TEXT_BRIGHT};
          transition: border-color 0.2s; resize: none; outline: none;
        }
        .ph-uv-memo:focus { border-color: ${ACCENT}; box-shadow: inset 0 0 10px rgba(255, 90, 31, 0.1); }
        .ph-uv-thumb-more { transition: border-color 0.2s, background-color 0.2s, color 0.2s; }
        .ph-uv-thumb-more:hover {
          border-color: ${ACCENT} !important;
          background-color: ${ACCENT_DIM} !important;
        }
        .ph-uv-thumb-more:hover .ph-uv-thumb-more-label { color: ${TEXT_BRIGHT} !important; }
        .ph-uv-op-node { transition: all 0.2s; cursor: pointer; }
        .ph-uv-op-node:hover { border-color: rgba(255,90,31,0.4) !important; background: rgba(255,90,31,0.06) !important; }
        .ph-uv-op-node:hover .ph-uv-op-arrow { color: ${ACCENT} !important; }
        .ph-uv-prj-modal-overlay { position: fixed; inset: 0; z-index: 220; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); padding: 16px; }
        .ph-uv-prj-modal-box { background: #080808; border: 1px solid ${BORDER_MID}; width: 100%; position: relative; }
        .ph-uv-prj-modal-box::before { content: ''; position: absolute; top: -1px; left: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .ph-uv-prj-modal-box::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 28px; height: 2px; background: ${ACCENT}; }
        .ph-uv-prj-btn-primary { background: ${ACCENT_DIM}; border: 1px solid rgba(255,90,31,0.5); color: ${ACCENT}; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .ph-uv-prj-btn-primary:hover { background: ${ACCENT}; color: #000; }
        .ph-uv-prj-btn-secondary { background: transparent; border: 1px solid ${BORDER_MID}; color: ${TEXT_MUTED}; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .ph-uv-prj-btn-secondary:hover { border-color: #444; color: ${TEXT_BRIGHT}; }
        .ph-uv-prj-btn-danger { background: transparent; border: 1px solid rgba(255,51,51,0.3); color: #FF3333; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .ph-uv-prj-btn-danger:hover { background: rgba(255,51,51,0.1); }
        @media (max-width: 768px) {
          .ph-uv-root { overflow-x: hidden; max-width: 100%; box-sizing: border-box; }
          .ph-uv-main-split { flex-direction: column !important; }
          .ph-uv-main-col { min-height: 50vh !important; }
          .ph-uv-aside {
            width: 100% !important;
            max-height: 42vh;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            border-right: none !important;
            border-bottom: 1px solid ${BORDER};
          }
          .ph-uv-thumb-row { gap: 6px !important; }
          .ph-uv-action-bar { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; padding: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; height: auto !important; }
          .ph-uv-action-bar > div:last-child { margin-left: 0 !important; flex-direction: column; width: 100%; }
          .ph-uv-modal-actions { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .ph-uv-modal-actions button { width: 100% !important; min-height: 44px !important; }
          .ph-uv-mapping-row { flex-direction: column !important; align-items: stretch !important; min-height: 0 !important; }
          .ph-uv-mapping-mid { width: 100% !important; border-left: none !important; border-right: none !important; border-top: 1px solid ${BORDER}; border-bottom: 1px solid ${BORDER}; padding: 8px !important; }
          .ph-uv-mapping-mid svg { transform: rotate(90deg); }
          .ph-uv-mapping-left, .ph-uv-mapping-right { width: 100% !important; }
        }
      `}</style>

      <div className="ph-uv-grid-bg" aria-hidden />
      <div className="ph-uv-scanlines" aria-hidden />
      <div className="ph-uv-ambient" aria-hidden />
      <div className="prj-scanline-el" aria-hidden />

      <ProjectPipelineHeader projectId={id} project={project} activeStepIndex={2} />

      {isReadOnly && (
        <div
          style={{
            margin: "0 24px",
            marginTop: 12,
            background: ACCENT_DIM,
            border: "1px solid rgba(255,90,31,0.25)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            zIndex: 5,
          }}
        >
          <CheckCircle2 size={18} color={ACCENT} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_BRIGHT }}>고객이 v2 보정본을 검토 중입니다</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>현재는 보기 전용 모드입니다.</div>
          </div>
        </div>
      )}

      <main
        className="ph-uv-main-split"
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden",
          zIndex: 10,
          position: "relative",
        }}
      >
        {/* 좌측 사이드 — v1 페이지와 동일 구획 */}
        <aside
          className="ph-uv-aside"
          style={{
            width: ASIDE_W,
            flexShrink: 0,
            alignSelf: "stretch",
            borderRight: `1px solid ${BORDER}`,
            display: "flex",
            flexDirection: "column",
            overflowX: "hidden",
            overflowY: "auto",
            minHeight: 0,
            background: BORDER,
          }}
        >
          {/* ACTIVE_PROJECT */}
          <section
            style={{
              background: SURFACE_1,
              padding: 20,
              borderBottom: `1px solid ${BORDER}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, background: ACCENT }} />
                <span className="ph-uv-tech-label" style={{ color: "#888" }}>ACTIVE_PROJECT</span>
              </div>
              {project.displayId ? (
                <span style={{ fontFamily: MONO, fontSize: 10, color: "#444" }}>ID: {project.displayId}</span>
              ) : null}
            </div>
            <h1
              style={{
                fontFamily: DISPLAY,
                fontSize: 20,
                fontWeight: 700,
                color: TEXT_BRIGHT,
                lineHeight: 1.3,
                marginBottom: 14,
                marginTop: 0,
                wordBreak: "break-word",
              }}
            >
              {project.name}
            </h1>

            {/* CLIENT_INVITE_URL */}
            <div style={{ background: SURFACE_2, border: `1px solid #222`, padding: "10px 12px", marginBottom: 12 }}>
              <span className="ph-uv-tech-label" style={{ color: "#555", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Link2 size={9} />
                CLIENT_INVITE_URL
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: isInviteActive ? TEXT_NORMAL : "#555",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isInviteActive ? inviteUrl.replace(/^https?:\/\//, "") : "업로드 완료 후 활성화"}
                </span>
                {isInviteActive ? (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      padding: "4px 8px",
                      flexShrink: 0,
                      background: copied ? "rgba(46,213,115,0.15)" : ACCENT,
                      border: "none",
                      color: copied ? "#2ed573" : "#000",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {copied ? "COPIED" : "COPY"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* CLIENT_PIN */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                border: `1px solid ${BORDER}`,
                marginBottom: 12,
                background: SURFACE_2,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Lock size={10} color={TEXT_MUTED} />
                <span className="ph-uv-tech-label" style={{ color: TEXT_MUTED }}>CLIENT_PIN</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {project.accessPin ? (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT_NORMAL, letterSpacing: 4 }}>
                      {pinVisible ? project.accessPin : "●●●●"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPinVisible(!pinVisible)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 2 }}
                    >
                      {pinVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPinInput(project.accessPin ?? ""); setShowPinModal(true); setPinError(""); }}
                      className="ph-uv-prj-btn-secondary"
                      style={{ padding: "3px 8px" }}
                    >
                      EDIT
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#444" }}>NO_PIN_SET</span>
                    <button
                      type="button"
                      onClick={() => { setPinInput(""); setShowPinModal(true); setPinError(""); }}
                      className="ph-uv-prj-btn-secondary"
                      style={{ padding: "3px 8px" }}
                    >
                      SET
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Link active status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                marginBottom: 0,
                background: isInviteActive ? "rgba(46,213,115,0.04)" : "transparent",
                border: `1px solid ${isInviteActive ? "rgba(46,213,115,0.15)" : "#222"}`,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isInviteActive ? "#2ed573" : "#444",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: MONO, fontSize: 10, color: isInviteActive ? "#2ed573" : "#555" }}>
                {isInviteActive ? `LINK_ACTIVE · ${getStatusLabel(project.status)}` : "LINK_INACTIVE · 업로드 전"}
              </span>
            </div>

            {/* Version counter */}
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span className="ph-uv-tech-label" style={{ color: "#555", fontSize: "9px" }}>
                보정 횟수
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: SURFACE_2,
                  border: `1px solid ${existingVersionCount >= BETA_MAX_REVISION_COUNT ? "rgba(239,68,68,0.35)" : "#222"}`,
                  padding: "4px 12px",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT_BRIGHT }}>
                  {existingVersionCount}
                  <span style={{ color: "#444" }}>/</span>
                  {BETA_MAX_REVISION_COUNT}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div style={{ marginTop: 12, background: SURFACE_2, border: `1px solid #222`, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="ph-uv-tech-label" style={{ color: "#555", fontSize: "9px" }}>
                  REVISION_TARGETS
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT_BRIGHT }}>{revisionTargets.length} ASSETS</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                <span className="ph-uv-tech-label" style={{ color: "#555", fontSize: "9px" }}>
                  MAPPED_V2
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT }}>
                  {mappedCount} / {revisionTargets.length}
                </span>
              </div>
            </div>
          </section>

          {/* PHOTOGRAPHER_MEMO */}
          <div
            style={{
              padding: "16px 20px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: SURFACE_1,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={14} color="#666" strokeWidth={2} />
              <span className="ph-uv-tech-label" style={{ color: "#888" }}>
                PHOTOGRAPHER_MEMO
              </span>
            </div>
            <textarea
              className="ph-uv-memo"
              value={globalMemo}
              onChange={(e) => setGlobalMemo(e.target.value)}
              placeholder="고객 검토 화면에 표시될 메모 (선택)"
              disabled={isReadOnly}
              rows={3}
              style={{
                width: "100%",
                height: 72,
                minHeight: 72,
                maxHeight: 72,
                boxSizing: "border-box",
                padding: "8px 10px",
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.45,
                resize: "none",
              }}
            />
          </div>

          {/* Customer review results */}
          <div
            style={{
              padding: "16px 20px",
              flexShrink: 0,
              background: SURFACE_1,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={12} color="#666" />
                <span className="ph-uv-tech-label" style={{ color: "#888" }}>CUSTOMER_REVIEW</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="클립보드 복사"
                  className="ph-uv-prj-btn-secondary"
                  style={{ padding: "3px 7px", display: "flex", alignItems: "center", gap: 3 }}
                >
                  <Copy size={9} />복사
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  title="TXT 다운로드"
                  className="ph-uv-prj-btn-secondary"
                  style={{ padding: "3px 7px", display: "flex", alignItems: "center", gap: 3 }}
                >
                  <Download size={9} />TXT
                </button>
              </div>
            </div>

            {/* Approved */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: GREEN, marginBottom: 5, display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <Check size={9} />확정 ({approvedPhotos.length}장)
              </div>
              {approvedPhotos.length === 0 ? (
                <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: "italic" }}>없음</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {approvedPhotos.map((p) => (
                    <div key={p.id} style={{ fontSize: 11, color: TEXT_NORMAL }}>{getDisplayFilename(p)}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Revision */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: AMBER, marginBottom: 5, display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <AlertCircle size={9} />재보정 요청 ({revisionTargets.length}장)
              </div>
              {revisionTargets.length === 0 ? (
                <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: "italic" }}>없음</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {revisionTargets.map((r) => (
                    <div key={r.id} style={{
                      background: SURFACE_2,
                      border: `1px solid rgba(245,158,11,0.15)`,
                      padding: "5px 8px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: TEXT_BRIGHT, marginBottom: 2 }}>{r.filename}</div>
                      {r.comment && (
                        <div style={{ fontSize: 10, color: AMBER }}>{r.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* OPERATION_NODES */}
          <div
            style={{
              padding: "16px 20px 18px",
              borderBottom: `1px solid ${BORDER}`,
              flexShrink: 0,
              background: SURFACE_1,
              minHeight: 0,
            }}
          >
            <span className="ph-uv-tech-label" style={{ color: TEXT_MUTED, display: "block", marginBottom: 10 }}>
              OPERATION_NODES
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                {
                  icon: <Upload size={14} color={TEXT_MUTED} />,
                  label: "원본업로드",
                  desc: "원본 사진 업로드·삭제·초대 링크",
                  enabled: true,
                  badge: null as string | null,
                  onClick: () => router.push(`/photographer/projects/${id}/upload`),
                },
                {
                  icon: <ListChecks size={14} color={TEXT_MUTED} />,
                  label: "셀렉 결과 보기",
                  desc: canViewSelections ? `${N}장 중 셀렉 진행` : "업로드 완료 후 가능",
                  enabled: canViewSelections,
                  badge: project.status === "selecting" ? "LIVE" : null,
                  onClick: () => { if (!canViewSelections) return; router.push(`/photographer/projects/${id}/results`); },
                },
                {
                  icon: <PenLine size={14} color={TEXT_MUTED} />,
                  label: "보정본 업로드",
                  desc: canEditVersions ? "보정본 업로드/관리" : "셀렉 완료 후 가능",
                  enabled: canEditVersions,
                  badge: null,
                  onClick: () => { if (!canEditVersions) return; router.push(editVersionsPath); },
                },
              ].map((node) => (
                <div
                  key={node.label}
                  role="button"
                  tabIndex={0}
                  className="ph-uv-op-node"
                  onClick={node.onClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); node.onClick(); }
                  }}
                  style={{
                    background: SURFACE_2,
                    border: `1px solid ${BORDER}`,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: node.enabled ? 1 : 0.4,
                  }}
                >
                  {node.icon}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ph-uv-tech-label" style={{ color: TEXT_BRIGHT, marginBottom: 2, fontSize: "0.6rem" }}>
                      {node.label}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>{node.desc}</div>
                  </div>
                  {node.badge ? (
                    <span style={{ padding: "2px 6px", background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.3)", fontFamily: MONO, fontSize: 9, color: "#2ed573" }}>
                      {node.badge}
                    </span>
                  ) : null}
                  <ChevronRight size={12} className="ph-uv-op-arrow" color={TEXT_MUTED} style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Beta warning */}
          <div style={{ padding: 20, background: "rgba(245,158,11,0.05)", borderTop: "1px solid rgba(245,158,11,0.2)", flexShrink: 0, marginTop: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <AlertCircle size={16} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <span className="ph-uv-tech-label" style={{ color: "#f59e0b", fontSize: "10px", display: "block", marginBottom: 4 }}>
                  보정 횟수 상한 주의
                </span>
                <p style={{ fontFamily: MONO, fontSize: 10, color: "#888", lineHeight: 1.45, margin: 0 }}>
                  {existingVersionCount >= BETA_MAX_REVISION_COUNT
                    ? `베타 최대 ${BETA_MAX_REVISION_COUNT}회에 도달했습니다. 추가 업로드가 제한됩니다.`
                    : `현재 ${existingVersionCount + 1}차 보정본(v2) 업로드 단계입니다. 최대 ${BETA_MAX_REVISION_COUNT}회까지 보정본 교환이 가능합니다.`}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* 우측 메인: 스크롤 + 하단 액션 바 */}
        <section
          className="ph-uv-main-col"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minWidth: 0,
            minHeight: 0,
            background: "rgba(3,3,3,0.6)",
          }}
        >
          <div
            className="ph-uv-scroll ph-uv-left"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "32px 32px",
              paddingBottom: scrollBottomPad,
            }}
          >
            {/* REVISION_ORIGINALS */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Image size={14} color="#666" strokeWidth={2} />
                  <h2 className="ph-uv-tech-label" style={{ color: "#888", margin: 0 }}>
                    REVISION_ORIGINALS
                  </h2>
                  {reviewLoading && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>LOADING…</span>
                  )}
                </div>
                <div style={{ background: ACCENT_DIM, border: `1px solid rgba(255,90,31,0.3)`, padding: "2px 8px" }}>
                  <span className="ph-uv-tech-label" style={{ color: ACCENT, fontSize: "9px" }}>
                    {revisionTargets.length} ASSETS
                  </span>
                </div>
              </div>

              <div
                className="ph-uv-thumb-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: revisionRowCols > 0
                    ? `repeat(${revisionRowCols}, minmax(0, 1fr))`
                    : "1fr",
                  gap: 12,
                  width: "100%",
                }}
              >
                {revisionTargets.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "32px 0", fontSize: 13, color: TEXT_MUTED }}>
                    재보정 요청 사진이 없습니다.
                  </div>
                ) : (
                  <>
                    {revisionVisible.map((t, i) => (
                      <SelectedThumbV2
                        key={t.id}
                        target={t}
                        num={i + 1}
                        onClick={viewerImageUrl(t.photo) ? () => openLightbox(lightboxRevisionItems, i) : undefined}
                      />
                    ))}
                    {revisionShowMore ? (
                      <button
                        type="button"
                        className="ph-uv-thumb-more"
                        aria-label={`나머지 ${revisionMoreCount}장 보기`}
                        onClick={() => {/* no-op: show all items in lightbox if needed */}}
                        style={{
                          aspectRatio: "1 / 1",
                          minWidth: 0,
                          width: "100%",
                          background: "#080808",
                          border: `1px solid ${BORDER}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          padding: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        <span className="ph-uv-thumb-more-label ph-uv-tech-label" style={{ color: "#444", fontSize: "9px" }}>
                          +{revisionMoreCount} MORE
                        </span>
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Dropzone */}
            {!isReadOnly && (
              <div style={{ marginBottom: 40 }}>
                {existingVersionCount >= BETA_MAX_REVISION_COUNT ? (
                  <div
                    style={{
                      padding: "24px 20px",
                      textAlign: "center",
                      background: "rgba(239,68,68,0.06)",
                      border: "2px dashed rgba(239,68,68,0.35)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <AlertCircle size={22} color={RED} />
                    <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                      베타 기간 최대 보정 횟수({BETA_MAX_REVISION_COUNT}회)에 도달했습니다.
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
                      현재 {existingVersionCount} / {BETA_MAX_REVISION_COUNT}회 사용 중
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`ph-uv-dashed-dropzone${dragOver ? " ph-uv-dz-over" : ""}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (localMappedFileCount === 0) multiInputRef.current?.click();
                        }
                      }}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleDropFiles(Array.from(e.dataTransfer.files)); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                      onClick={() => localMappedFileCount === 0 && multiInputRef.current?.click()}
                      style={{
                        width: "100%",
                        minHeight: 168,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        cursor: localMappedFileCount === 0 ? "pointer" : "default",
                        backgroundColor: localMappedFileCount > 0 ? "rgba(34,197,94,0.04)" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          border: `1px solid ${localMappedFileCount > 0 ? "rgba(34,197,94,0.5)" : "#333"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: SURFACE_2,
                          marginBottom: 6,
                        }}
                      >
                        {localMappedFileCount > 0 ? (
                          <CheckCircle2 size={18} color="#22c55e" />
                        ) : (
                          <Upload size={18} color="#666" strokeWidth={1.5} />
                        )}
                      </div>
                      <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: localMappedFileCount > 0 ? TEXT_BRIGHT : TEXT_NORMAL, margin: 0 }}>
                        {localMappedFileCount > 0 ? `${localMappedFileCount}장 매핑됨 · 아래에서 확인` : "DROP_V2_RETOUCHED_FILES"}
                      </p>
                      <p className="ph-uv-tech-label" style={{ color: "#555", fontSize: "9px", marginTop: 4, marginBottom: 0 }}>
                        재보정 요청 {revisionTargets.length}장 · JPEG / PNG / WebP 지원
                      </p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); multiInputRef.current?.click(); }}
                        disabled={revisionTargets.length === 0}
                        className="ph-uv-tech-label"
                        style={{
                          marginTop: 16,
                          padding: "8px 16px",
                          background: revisionTargets.length === 0 ? "#111" : ACCENT_DIM,
                          border: `1px solid ${revisionTargets.length === 0 ? BORDER : "rgba(255,90,31,0.4)"}`,
                          color: revisionTargets.length === 0 ? "#555" : ACCENT,
                          cursor: revisionTargets.length === 0 ? "not-allowed" : "pointer",
                          fontSize: "10px",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {localMappedFileCount > 0 ? "RESELECT FILES" : "SELECT FILES"}
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingLeft: 8 }}>
                      <Info size={12} color="#666" strokeWidth={2} />
                      <p className="ph-uv-tech-label" style={{ color: "#666", fontSize: "9px", margin: 0 }}>
                        파일명 일치 시 자동 매핑 · 불일치 시 순서대로 매핑
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mapping section */}
            {(displayMapping.length > 0 || isReadOnly) && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    borderBottom: `1px solid ${BORDER}`,
                    paddingBottom: 12,
                    marginBottom: 16,
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <h2 className="ph-uv-tech-label" style={{ color: TEXT_BRIGHT, margin: 0 }}>
                      MAPPING_RESULT
                    </h2>
                    {mapping.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          background: SURFACE_2,
                          border: `1px solid #222`,
                          padding: "4px 12px",
                        }}
                      >
                        {stats.exact > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                            <span className="ph-uv-tech-label" style={{ color: "#22c55e", fontSize: "9px" }}>
                              NAME_MATCH: {stats.exact}
                            </span>
                          </div>
                        )}
                        {stats.exact > 0 && stats.order > 0 ? <div style={{ width: 1, height: 12, background: "#333" }} /> : null}
                        {stats.order > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                            <span className="ph-uv-tech-label" style={{ color: "#f59e0b", fontSize: "9px" }}>
                              SEQ_MATCH: {stats.order}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {isReadOnly
                    ? readOnlyItems.map((item) => (
                        <MappingCardV2
                          key={item.target.id}
                          target={item.target}
                          file={null}
                          type={item.type}
                          orderIndex={undefined}
                          previewUrl={item.serverUrl}
                          storedFileSizeBytes={item.storedFileSizeBytes}
                          v1Url={item.v1Url}
                          isReadOnly
                          onChangeOne={handleChangeOne}
                          onClearFile={() => {}}
                          onCompare={openCompareByTarget}
                          onOpenLightbox={openLightbox}
                        />
                      ))
                    : displayMapping.map((m) => (
                        <MappingCardV2
                          key={m.target.id}
                          target={m.target}
                          file={m.file}
                          type={m.type}
                          orderIndex={m.orderIndex}
                          previewUrl={localV2PreviewMap.get(m.target.id) ?? serverV2Map.get(m.target.id)?.url}
                          storedFileSizeBytes={serverV2Map.get(m.target.id)?.fileSize ?? null}
                          v1Url={serverV1Map.get(m.target.id)?.url}
                          isReadOnly={false}
                          onChangeOne={handleChangeOne}
                          onClearFile={handleClearFile}
                          onCompare={openCompareByTarget}
                          onOpenLightbox={openLightbox}
                        />
                      ))}
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171",
                  fontFamily: MONO,
                  fontSize: 11,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          {!isReadOnly && (
            <div
              className="ph-uv-action-bar"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 80,
                background: "rgba(5,5,5,0.95)",
                backdropFilter: "blur(12px)",
                borderTop: `1px solid ${BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 32px",
                zIndex: 40,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8, marginRight: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
                  <span className="ph-uv-tech-label" style={{ color: TEXT_BRIGHT }}>
                    V2 RETOUCH UPLOAD STATUS
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT, flexShrink: 0 }}>
                    {emptyCount > 0 ? `${emptyCount}장 미매핑` : "전체 매핑 완료"}
                  </span>
                </div>
                <div style={{ height: 6, width: "100%", minWidth: 0, background: "#111", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: revisionTargets.length > 0
                        ? `${Math.min(100, Math.round((mappedCount / revisionTargets.length) * 100))}%`
                        : "0%",
                      background: ACCENT,
                      position: "relative",
                      transition: "width 0.3s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(255,255,255,0.2)",
                        width: "25%",
                        animation: "ph-uv-bar-scan 2s linear infinite",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 32 }}>
                <span className="ph-uv-tech-label" style={{ color: "#555", fontSize: "9px", textAlign: "right", lineHeight: 1.35 }}>
                  100% 매핑 시
                  <br />
                  전달 활성화
                </span>
                <button
                  type="button"
                  disabled={!canDeliver || submitting}
                  onClick={() => setShowConfirm(true)}
                  className="ph-uv-tech-label"
                  style={{
                    border: `1px solid ${canDeliver ? "rgba(255,90,31,0.45)" : "#333"}`,
                    background: canDeliver ? ACCENT_DIM : "#111",
                    padding: "12px 28px",
                    color: canDeliver ? ACCENT : "#555",
                    fontWeight: 700,
                    fontSize: "11px",
                    letterSpacing: "0.14em",
                    cursor: canDeliver ? "pointer" : "not-allowed",
                  }}
                >
                  DELIVER TO CLIENT
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* PIN modal */}
      {showPinModal && (
        <div
          className="ph-uv-prj-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) { setShowPinModal(false); setPinInput(""); setPinError(""); }
          }}
        >
          <div className="ph-uv-prj-modal-box" style={{ maxWidth: 380 }}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, background: ACCENT }} />
                <span className="ph-uv-tech-label" style={{ color: ACCENT }}>
                  SYS.AUTH :: {project.accessPin ? "MODIFY_PIN" : "SET_PIN"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 4 }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <span style={pinModalLabelStyle}>ACCESS_CODE (4자리)</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: SURFACE_2,
                    border: `1px solid ${BORDER_MID}`,
                    color: TEXT_BRIGHT,
                    fontSize: 22,
                    fontFamily: MONO,
                    outline: "none",
                    letterSpacing: 12,
                    fontWeight: 700,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = BORDER_MID; }}
                />
                <button
                  type="button"
                  onClick={() => setPinInput(Math.floor(1000 + Math.random() * 9000).toString())}
                  className="ph-uv-prj-btn-secondary"
                  style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                >
                  <RefreshCw size={11} />
                  RANDOM
                </button>
              </div>
              <p style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED, marginBottom: 16 }}>
                4자리 숫자를 입력하거나 랜덤 생성 버튼을 누르세요
              </p>
              {pinError ? (
                <div style={{ padding: "6px 10px", background: "rgba(255,51,51,0.08)", border: "1px solid rgba(255,51,51,0.2)", marginBottom: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#FF3333" }}>[ERR] {pinError}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                {project.accessPin ? (
                  <button
                    type="button"
                    onClick={() => handleSavePin(null)}
                    disabled={pinSaving}
                    className="ph-uv-prj-btn-danger"
                    style={{ padding: "10px 14px" }}
                  >
                    DEL_PIN
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }}
                  disabled={pinSaving}
                  className="ph-uv-prj-btn-secondary"
                  style={{ flex: 1, padding: "10px 0" }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePin(pinInput || null)}
                  disabled={pinSaving || (!!pinInput && pinInput.length !== 4)}
                  className="ph-uv-prj-btn-primary"
                  style={{ flex: 1, padding: "10px 0", opacity: pinSaving || (!!pinInput && pinInput.length !== 4) ? 0.4 : 1 }}
                >
                  {pinSaving ? "SAVING..." : "COMMIT"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm deliver modal */}
      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#080808",
              border: `1px solid ${BORDER_MID}`,
              width: "100%",
              maxWidth: 400,
              padding: 28,
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", top: -1, left: -1, width: 28, height: 2, background: ACCENT }} />
            <h3 style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: TEXT_BRIGHT, marginBottom: 10 }}>고객에게 전달</h3>
            <p style={{ fontSize: 13, color: TEXT_NORMAL, lineHeight: 1.65, marginBottom: 24 }}>
              v2 재보정본 {mappedCount}장을 고객에게 전달하시겠습니까?
              <br />
              전달 후 고객이 v2 최종 검토를 진행합니다.
            </p>
            {error && <p style={{ marginBottom: 12, fontSize: 12, color: "#f87171", fontFamily: MONO }}>{error}</p>}
            <div className="ph-uv-modal-actions" style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="ph-uv-tech-label"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: "transparent",
                  border: `1px solid ${BORDER_MID}`,
                  color: TEXT_MUTED,
                  cursor: "pointer",
                  fontSize: "10px",
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleDeliver}
                disabled={submitting || !canDeliver}
                className="ph-uv-tech-label"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: ACCENT_DIM,
                  border: `1px solid rgba(255,90,31,0.45)`,
                  color: ACCENT,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  letterSpacing: "0.12em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {submitting ? "PROCESSING…" : <><Send size={11} />DELIVER</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={multiInputRef} type="file" multiple accept={ACCEPT_IMAGE_TYPES}
        style={{ display: "none" }} onChange={(e) => handleDropFiles(Array.from(e.target.files ?? []))} />
      <input ref={perItemInputRef} type="file" accept={ACCEPT_IMAGE_TYPES}
        style={{ display: "none" }} onChange={(e) => handlePerItemSelect(e.target.files)} />

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => i !== null ? (i - 1 + lightboxItems.length) % lightboxItems.length : null)}
          onNext={() => setLightboxIndex((i) => i !== null ? (i + 1) % lightboxItems.length : null)}
        />
      )}

      <CompareViewerModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        photos={comparePhotos}
        initialIndex={compareInitIdx}
      />
    </div>
  );
}

// ---------- sub-components ----------

function SelectedThumbV2({ target, num, onClick }: { target: V2Target; num: number; onClick?: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        background: SURFACE_1,
        border: `1px solid ${BORDER}`,
        overflow: "hidden",
        cursor: onClick ? "zoom-in" : "default",
      }}
    >
      <div style={{ aspectRatio: "1/1", background: SURFACE_2, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {target.photo.url && !err ? (
          <img src={target.photo.url} alt="" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Image size={16} color={TEXT_MUTED} />
        )}
        <div style={{
          position: "absolute", bottom: 3, left: 4,
          fontSize: 9, color: "rgba(255,255,255,0.6)",
          background: "rgba(0,0,0,0.5)", padding: "1px 4px",
          fontFamily: MONO,
        }}>
          {num}
        </div>
      </div>
      <div style={{ padding: "4px 6px" }}>
        <div style={{ fontSize: 9, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: MONO }}>
          {target.filename}
        </div>
        {target.comment?.trim() ? (
          <div
            style={{
              marginTop: 3,
              fontSize: 9,
              color: AMBER,
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {target.comment}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MappingCardV2({
  target, file, type, orderIndex, previewUrl, storedFileSizeBytes, v1Url, isReadOnly, onChangeOne, onClearFile, onCompare, onOpenLightbox,
}: {
  target: V2Target;
  file: File | null;
  type: "exact" | "order" | "none";
  orderIndex?: number;
  previewUrl?: string;
  storedFileSizeBytes?: number | null;
  v1Url?: string;
  isReadOnly: boolean;
  onChangeOne: (id: string) => void;
  onClearFile: (id: string) => void;
  onCompare: (id: string) => void;
  onOpenLightbox: (items: Array<{ url: string; label: string; sublabel?: string | null }>, index: number) => void;
}) {
  const [origErr,    setOrigErr]    = useState(false);
  const [v1Err,      setV1Err]      = useState(false);
  const [retouchErr, setRetouchErr] = useState(false);
  const state = isReadOnly ? (previewUrl ? "matched" : "empty") : type === "exact" ? "matched" : type === "order" ? "ordered" : "empty";
  const borderColor = state === "matched" ? "rgba(34,197,94,0.2)" : state === "ordered" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)";
  const fileSizeStr =
    storedFileSizeBytes != null && storedFileSizeBytes >= 0
      ? formatStoredFileSizeBytes(storedFileSizeBytes)
      : "";

  return (
    <div style={{ background: SURFACE_2, border: `1px solid ${borderColor}`, overflow: "hidden", marginBottom: 7 }}>
      <div className="ph-uv-mapping-row" style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr auto", alignItems: "center", padding: "10px 14px" }}>

        {/* Left: original + v1 + filename + comment */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {/* original */}
            <div
              onClick={() => target.photo.url && onOpenLightbox([{ url: viewerImageUrl(target.photo), label: target.filename, sublabel: "원본 선택 사진" }], 0)}
              style={{ width: 36, height: 36, background: SURFACE_1, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${BORDER}`, overflow: "hidden", cursor: target.photo.url ? "zoom-in" : "default" }}
            >
              {target.photo.url && !origErr ? (
                <img src={target.photo.url} alt="" onError={() => setOrigErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : <Image size={12} color={TEXT_MUTED} />}
            </div>
            {/* v1 */}
            {v1Url && (
              <div
                onClick={() => onOpenLightbox([{ url: v1Url, label: target.filename, sublabel: "v1 보정본" }], 0)}
                style={{ width: 36, height: 36, background: SURFACE_1, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid rgba(255,90,31,0.25)`, overflow: "hidden", cursor: "zoom-in" }}
              >
                {!v1Err ? (
                  <img src={v1Url} alt="" onError={() => setV1Err(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : <Image size={12} color={TEXT_MUTED} />}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2, color: TEXT_BRIGHT }}>{target.filename}</div>
            {target.comment?.trim() ? (
              <div style={{ fontSize: 10, color: AMBER, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>{target.comment}</div>
            ) : null}
          </div>
        </div>

        {/* Arrow */}
        <div className="ph-uv-mapping-mid" style={{ display: "flex", justifyContent: "center", color: TEXT_MUTED }}><ArrowRight size={13} /></div>

        {/* Right: v2 upload */}
        {state === "empty" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ width: 52, height: 52, background: "transparent", border: `2px dashed ${BORDER}`, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: "italic" }}>v2 없음</div>
          </div>
        ) : (
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: previewUrl ? "zoom-in" : "default" }}
            onClick={() => previewUrl && onCompare(target.id)}
          >
            <div style={{ width: 52, height: 52, background: SURFACE_1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
              {previewUrl && !retouchErr ? (
                <img src={previewUrl} alt="" onError={() => setRetouchErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : <Image size={16} color={TEXT_MUTED} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2, color: TEXT_BRIGHT }}>
                {file?.name ?? (isReadOnly ? "업로드 완료" : "")}
              </div>
              {fileSizeStr && <div style={{ fontSize: 10, color: TEXT_MUTED, fontFamily: MONO }}>{fileSizeStr}</div>}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingLeft: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {state === "matched" && (
            <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: GREEN, background: GREEN_DIM, border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", gap: 3, fontFamily: MONO, letterSpacing: "0.08em" }}>
              <Check size={9} />파일명 일치
            </span>
          )}
          {state === "ordered" && (
            <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: AMBER, background: AMBER_DIM, border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", gap: 3, fontFamily: MONO, letterSpacing: "0.08em" }}>
              <ArrowUpDown size={9} />순서 매핑
            </span>
          )}
          {state === "empty" && (
            <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: RED, background: RED_DIM, border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 3, fontFamily: MONO, letterSpacing: "0.08em" }}>
              <AlertCircle size={9} />미업로드
            </span>
          )}
          {!isReadOnly && file != null && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClearFile(target.id); }}
              className="ph-uv-prj-btn-danger"
              style={{ padding: "3px 8px", display: "flex", alignItems: "center", gap: 3 }}
            >
              <X size={9} />취소
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onChangeOne(target.id)}
              className={state === "empty" ? "ph-uv-prj-btn-primary" : "ph-uv-prj-btn-secondary"}
              style={{ padding: "3px 8px", display: "flex", alignItems: "center", gap: 3 }}
            >
              {state === "empty" ? "선택" : <><Pencil size={9} />변경</>}
            </button>
          )}
        </div>
      </div>

      {/* Ordered warning */}
      {state === "ordered" && !isReadOnly && (
        <div style={{
          padding: "5px 14px",
          borderTop: "1px solid rgba(245,158,11,0.12)",
          background: "rgba(245,158,11,0.04)",
          fontSize: 10, color: AMBER,
          fontFamily: MONO,
        }}>
          파일명 불일치 · 업로드 순서({(orderIndex ?? 0) + 1}번째)로 자동 매핑됐습니다. 다른 사진이면 [변경]을 눌러주세요.
        </div>
      )}
    </div>
  );
}

// ---------- Lightbox ----------

function Lightbox({
  items, index, onClose, onPrev, onNext,
}: {
  items: Array<{ url: string; label: string; sublabel?: string | null }>;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  const multi = items.length > 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && multi) onPrev();
      if (e.key === "ArrowRight" && multi) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, multi]);

  if (!item) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.08)", border: "none",
          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: TEXT_NORMAL,
        }}
      >
        <X size={18} />
      </button>

      {multi && (
        <div style={{
          position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
          fontFamily: MONO, fontSize: 11, color: TEXT_MUTED,
        }}>
          {index + 1} / {items.length}
        </div>
      )}

      {multi && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          style={{
            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.08)", border: "none",
            width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: TEXT_NORMAL,
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "calc(100vw - 120px)", maxHeight: "calc(100vh - 120px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <img
          src={item.url}
          alt={item.label}
          style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain" }}
        />
      </div>

      {multi && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.08)", border: "none",
            width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: TEXT_NORMAL,
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "14px 24px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT, fontFamily: DISPLAY }}>{item.label}</div>
        {item.sublabel && (
          <div style={{
            fontSize: 11, color: AMBER,
            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
            padding: "3px 10px",
          }}>
            {item.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
