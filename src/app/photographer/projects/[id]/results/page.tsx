"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, differenceInDays, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CheckCircle2,
  LayoutGrid,
  List,
  ListChecks,
  PenLine,
  Eye,
  MessageSquare,
  Clipboard,
  Download,
  Upload,
  ChevronRight,
  ChevronLeft,
  X,
  Image,
  AlertTriangle,
} from "lucide-react";
import { getProjectById, getPhotosWithSelections } from "@/lib/db";
import type { Project, Photo, ColorTag } from "@/types";
import { PHOTOGRAPHER_THEME as C } from "@/lib/photographer-theme";
import { ProjectPipelineHeader } from "@/components/photographer/ProjectPipelineHeader";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { galleryThumbPriorityProps } from "@/lib/gallery-filter";

/** 업로드 페이지(`upload/page.tsx`)와 동일 토큰 — 상단·좌측 레이아웃 정렬 */
const ACCENT = "#FF5A1F";
const ACCENT_DIM = "rgba(255, 90, 31, 0.15)";
const ACCENT_GLOW = "rgba(255, 90, 31, 0.4)";
const BORDER = "#1f1f1f";
const BORDER_MID = "#2a2a2a";
const SURFACE_0 = "#020202";
const SURFACE_1 = "#050505";
const SURFACE_2 = "#0a0a0a";
const MONO = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif";
const TEXT_MUTED = "#5c5c5c";
const TEXT_NORMAL = "#a3a3a3";
const TEXT_BRIGHT = "#ffffff";
const ASIDE_W = 360;

// ---------- utils (preserved) ----------
function sanitizeFilenamePart(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function csvEscape(value: string) {
  const v = value ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

function formatFileSizeBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ViewMode = "gallery" | "list";

// ---------- main page ----------
export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStates, setPhotoStates] = useState<
    Record<string, { rating?: number; color?: ColorTag[]; comment?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditStartModal, setShowEditStartModal] = useState(false);
  const [showEditGuideModal, setShowEditGuideModal] = useState(false);
  const [editStartSubmitting, setEditStartSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [galleryThumbFocusIndex, setGalleryThumbFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    getProjectById(id)
      .then((p) => {
        if (!p) return;
        setProject(p);
        return getPhotosWithSelections(p.id);
      })
      .then((result) => {
        if (!result) return;
        const selected = result.photos.filter((p) => result.selectedIds.has(p.id));
        selected.sort((a, b) =>
          getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, { sensitivity: "base" })
        );
        setPhotos(selected);
        setPhotoStates(result.photoStates ?? {});
      })
      .catch((e) => {
        console.error(e);
        setError(e instanceof Error ? e.message : "로드 실패");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (galleryThumbFocusIndex == null || photos.length === 0) return;
    const anchor = galleryThumbFocusIndex;
    const ordered: string[] = [];
    const push = (i: number) => {
      const u = photos[i]?.url;
      if (u) ordered.push(u);
    };
    push(anchor);
    for (let d = 1; d < photos.length; d++) {
      if (anchor - d >= 0) push(anchor - d);
      if (anchor + d < photos.length) push(anchor + d);
    }
    const seen = new Set<string>();
    ordered.forEach((url, i) => {
      if (seen.has(url)) return;
      seen.add(url);
      const img = document.createElement("img");
      img.decoding = "async";
      img.fetchPriority = i < 24 ? "high" : "low";
      img.src = url;
    });
  }, [galleryThumbFocusIndex, photos]);

  const confirmedText = useMemo(() => {
    if (!project?.confirmedAt) return null;
    return format(new Date(project.confirmedAt), "yyyy-MM-dd HH:mm", { locale: ko });
  }, [project?.confirmedAt]);

  const exportBaseName = useMemo(() => {
    if (!project) return "selections";
    const p = sanitizeFilenamePart(project.name || "프로젝트");
    const c = sanitizeFilenamePart(project.customerName || "고객");
    return `${p}_${c}_selections`;
  }, [project]);

  const fileNames = useMemo(() => photos.map(getDisplayFilename), [photos]);

  const commentCount = useMemo(
    () => photos.filter((p) => (photoStates[p.id]?.comment ?? "").trim()).length,
    [photos, photoStates]
  );

  const remarksSummary = useMemo(() => {
    const parts = photos
      .map((p) => (photoStates[p.id]?.comment ?? "").trim())
      .filter(Boolean);
    const uniq = [...new Set(parts)];
    if (uniq.length === 0) return "고객 코멘트가 없습니다.";
    const joined = uniq.join(" ");
    return joined.length > 220 ? `${joined.slice(0, 220)}…` : joined;
  }, [photos, photoStates]);

  const deadlineLabel = useMemo(() => {
    if (!project?.deadline) return "—";
    try {
      const d = differenceInDays(parseISO(project.deadline), new Date());
      if (d < 0) return `D+${Math.abs(d)} (기한 경과)`;
      if (d === 0) return "D-Day";
      return `D-${d}`;
    } catch {
      return "—";
    }
  }, [project?.deadline]);

  const createdLabel = useMemo(() => {
    if (!project?.createdAt) return "—";
    try {
      return format(parseISO(project.createdAt), "yyyy.MM.dd", { locale: ko });
    } catch {
      return "—";
    }
  }, [project?.createdAt]);

  const handleCopyClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fileNames.join("\n"));
      setToast("클립보드에 복사했습니다");
    } catch {
      setToast("복사 실패");
    }
  };

  const handleDownloadCsv = () => {
    const header = ["파일명", "코멘트"].join(",");
    const rows = photos.map((p) => {
      const filename = getDisplayFilename(p);
      const comment = (photoStates[p.id]?.comment ?? "").trim();
      return [csvEscape(filename), csvEscape(comment)].join(",");
    });
    downloadTextFile(`${exportBaseName}.csv`, [header, ...rows].join("\n"), "text/csv;charset=utf-8");
  };

  const handleDownloadTxt = () => {
    downloadTextFile(`${exportBaseName}.txt`, fileNames.join("\n"), "text/plain;charset=utf-8");
  };

  const handleEditStartConfirm = async () => {
    setEditStartSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      setShowEditStartModal(false);
      router.push(`/photographer/projects/${id}/upload-versions`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setEditStartSubmitting(false);
    }
  };

  const isConfirmedOrBeyond =
    project &&
    ["confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2", "delivered"].includes(
      project.status
    );
  const isSelecting = project?.status === "selecting";
  const showActionBar = project && ["confirmed", "editing"].includes(project.status);

  if (loading) {
    return (
      <div
        className="prj-root"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: SURFACE_0,
        }}
      >
        <span className="prj-tech-label" style={{ color: TEXT_MUTED, letterSpacing: "0.2em" }}>
          LOADING_SELECTION_VIEW…
        </span>
        <style>{`.prj-tech-label { font-family: ${MONO}; font-size: 0.63rem; letter-spacing: 0.15em; text-transform: uppercase; }`}</style>
      </div>
    );
  }
  if (!project) return null;

  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath =
    project.status === "editing_v2" || project.status === "reviewing_v2"
      ? `/photographer/projects/${id}/upload-versions/v2`
      : `/photographer/projects/${id}/upload-versions`;

  const N = project.requiredCount || 0;
  const selectionPct = N > 0 ? Math.min(100, Math.round((photos.length / N) * 100)) : photos.length > 0 ? 100 : 0;
  const idShort = (project.displayId ?? id).replace(/^PRJ-/i, "").slice(0, 12);

  return (
    <div
      className="ph-results-root prj-root"
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
      }}
    >
      <style>{`
        @keyframes prj-scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        @keyframes ph-approval-pulse {
          0% { border-color: ${ACCENT_DIM}; }
          50% { border-color: ${ACCENT}; }
          100% { border-color: ${ACCENT_DIM}; }
        }
        .ph-ambient { position: fixed; bottom: -20%; left: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, ${ACCENT_DIM} 0%, transparent 50%); z-index: 0; pointer-events: none; opacity: 0.12; }
        .prj-grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(30,30,30,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,0.18) 1px, transparent 1px); background-size: 30px 30px; z-index: 0; pointer-events: none; }
        .prj-scanline-el { width: 100%; height: 100px; position: fixed; bottom: 100%; background: linear-gradient(0deg, rgba(255,90,31,0.03) 0%, rgba(255,90,31,0) 100%); animation: prj-scanline 8s linear infinite; pointer-events: none; z-index: 1; }
        .prj-tech-label { font-family: ${MONO}; font-size: 0.63rem; letter-spacing: 0.15em; text-transform: uppercase; }
        .ph-results-gallery { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
        @media (min-width: 1400px) { .ph-results-gallery { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
        .ph-results-inner-scroll::-webkit-scrollbar { width: 6px; }
        .ph-results-inner-scroll::-webkit-scrollbar-track { background: ${SURFACE_2}; border-left: 1px solid ${BORDER}; }
        .ph-results-inner-scroll::-webkit-scrollbar-thumb { background: #333; }
        .ph-results-inner-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .ph-results-confirm-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid ${BORDER}; }
        .ph-results-confirm-card:hover { border-color: ${ACCENT_GLOW}; transform: translateY(-2px); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); }
        .prj-op-node { transition: all 0.2s; cursor: pointer; }
        .prj-op-node:hover { border-color: rgba(255,90,31,0.4) !important; background: rgba(255,90,31,0.06) !important; }
        .prj-op-node:hover .prj-op-arrow { color: ${ACCENT} !important; }
        .ph-results-edit-guide-overlay { position: fixed; inset: 0; z-index: 220; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); padding: 16px; }
        .ph-results-edit-guide-box { background: #080808; border: 1px solid ${BORDER_MID}; width: 100%; max-width: 420px; position: relative; }
        @media (max-width: 768px) {
          .ph-results-main-split { flex-direction: column !important; }
          .ph-results-aside { width: 100% !important; max-height: 42vh; border-right: none !important; border-bottom: 1px solid ${BORDER}; }
          .ph-results-inner-scroll { padding: 0 12px 16px !important; }
          .ph-results-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
          .ph-results-list-head { display: none !important; }
          .ph-results-list-row { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; padding: 12px !important; }
          .ph-results-action-bar { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; padding: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; }
          .ph-results-modal-actions { flex-direction: column !important; }
          .ph-results-modal-actions button { width: 100% !important; min-height: 44px !important; }
        }
      `}</style>
      <div className="ph-ambient" aria-hidden />
      <div className="prj-grid-bg" />
      <div className="prj-scanline-el" />

      <ProjectPipelineHeader projectId={id} project={project} activeStepIndex={1} />

      <main className="ph-results-main-split" style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", zIndex: 10, position: "relative" }}>
        <aside className="ph-results-aside prj-scroll" style={{ width: ASIDE_W, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", overflowY: "auto", background: BORDER }}>
          <section style={{ background: SURFACE_1, padding: 24, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, background: ACCENT }} />
              <span className="prj-tech-label" style={{ color: TEXT_MUTED }}>PROJECT_OVERVIEW</span>
            </div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, color: TEXT_BRIGHT, margin: 0, lineHeight: 1.25 }}>{project.name}</h1>
            <p style={{ fontFamily: MONO, fontSize: 10, color: "#444", marginTop: 6 }}>ID: {idShort} // CREATED: {createdLabel}</p>
            <div style={{ marginTop: 20, paddingTop: 20, paddingBottom: 20, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span className="prj-tech-label" style={{ color: "#555", fontSize: "0.55rem" }}>CUSTOMER_CHOICE</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT_BRIGHT }}>{photos.length} / {N || "—"} PHOTOS</span>
              </div>
              <div style={{ height: 6, width: "100%", background: "#111" }}>
                <div style={{ width: `${selectionPct}%`, height: "100%", background: ACCENT, transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span className="prj-tech-label" style={{ color: "#555", fontSize: "0.55rem" }}>TIME_REMAINING</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: deadlineLabel.includes("경과") ? "#ff4757" : TEXT_NORMAL }}>{deadlineLabel}</span>
              </div>
            </div>
            <div>
              <span className="prj-tech-label" style={{ color: "#555", fontSize: "0.55rem", display: "block", marginBottom: 8 }}>CLIENT_REMARKS</span>
              <div style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, padding: 12, fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.5, fontStyle: "italic" }}>{remarksSummary}</div>
            </div>
          </section>

          <section style={{ flex: 1, background: SURFACE_1, padding: 24, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {isSelecting && (
              <div style={{ marginBottom: 16, padding: 12, background: ACCENT_DIM, border: `1px solid rgba(255,90,31,0.25)`, borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 4 }}>고객이 셀렉 진행 중입니다</div>
                <div style={{ fontSize: 11, color: TEXT_MUTED }}>현재까지 {photos.length}장 선택됨</div>
              </div>
            )}
            {isConfirmedOrBeyond && (
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(46,213,115,0.08)", border: "1px solid rgba(46,213,115,0.2)", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <CheckCircle2 size={16} color="#2ed573" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2ed573", marginBottom: 4 }}>고객이 최종 확정했습니다</div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED }}>확정: {confirmedText ?? "—"} · {photos.length}장</div>
                </div>
              </div>
            )}
            <div style={{ margin: "0 -24px", padding: "20px 24px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: SURFACE_1 }}>
              <span className="prj-tech-label" style={{ color: TEXT_MUTED, display: "block", marginBottom: 12 }}>OPERATION_NODES</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  {
                    icon: <Upload size={14} color={TEXT_MUTED} />,
                    label: "원본업로드",
                    desc: "원본 사진 업로드·삭제·초대 링크",
                    enabled: true,
                    badge: null,
                    onClick: () => {
                      router.push(`/photographer/projects/${id}/upload`);
                    },
                  },
                  {
                    icon: <ListChecks size={14} color={TEXT_MUTED} />,
                    label: "셀렉 결과 보기",
                    desc: canViewSelections ? `${N}장 중 셀렉 진행` : "업로드 완료 후 가능",
                    enabled: canViewSelections,
                    badge: project.status === "selecting" ? "LIVE" : null,
                    onClick: () => {
                      if (!canViewSelections) return;
                      router.push(`/photographer/projects/${id}/results`);
                    },
                  },
                  {
                    icon: <PenLine size={14} color={TEXT_MUTED} />,
                    label: "보정본 업로드",
                    desc: canEditVersions ? "보정본 업로드/관리" : "셀렉 완료 후 가능",
                    enabled: canEditVersions,
                    badge: null,
                    onClick: () => {
                      if (!canEditVersions) return;
                      if (project.status === "confirmed") setShowEditGuideModal(true);
                      else router.push(editVersionsPath);
                    },
                  },
                  {
                    icon: <Eye size={14} color={TEXT_MUTED} />,
                    label: "보정본 검토",
                    desc: canReview ? "고객 검토 현황" : "보정 완료 후 가능",
                    enabled: canReview,
                    badge: null,
                    onClick: () => canReview && router.push(editVersionsPath),
                  },
                ].map((node) => (
                  <div
                    key={node.label}
                    role="button"
                    tabIndex={0}
                    className="prj-op-node"
                    onClick={node.onClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        node.onClick();
                      }
                    }}
                    style={{
                      background: SURFACE_2,
                      border: `1px solid ${BORDER}`,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      opacity: node.enabled ? 1 : 0.4,
                    }}
                  >
                    {node.icon}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="prj-tech-label" style={{ color: TEXT_BRIGHT, marginBottom: 3 }}>{node.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>{node.desc}</div>
                    </div>
                    {node.badge ? (
                      <span style={{ padding: "2px 6px", background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.3)", fontFamily: MONO, fontSize: 9, color: "#2ed573" }}>{node.badge}</span>
                    ) : null}
                    <ChevronRight size={12} className="prj-op-arrow" color={TEXT_MUTED} style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>

        <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
          <div style={{ height: 56, borderBottom: `1px solid ${BORDER}`, background: "rgba(5,5,5,0.95)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0, zIndex: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div>
                <h2 className="prj-tech-label" style={{ color: TEXT_BRIGHT, fontSize: "0.68rem", margin: 0 }}>SELECTION_VIEWER</h2>
                <span className="prj-tech-label" style={{ color: "#555", fontSize: "0.55rem" }}>FILTERED: CUSTOMER_SELECTED</span>
              </div>
              <div style={{ width: 1, height: 24, background: BORDER }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: SURFACE_2, border: `1px solid ${BORDER}`, padding: "6px 12px" }}>
                <span className="prj-tech-label" style={{ color: "#444", fontSize: "0.55rem" }}>SELECTION:</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT }}>{photos.length} ASSETS</span>
              </div>
              {commentCount > 0 && (
                <span style={{ fontSize: 11, color: "#f5a623", display: "flex", alignItems: "center", gap: 4 }}>
                  <MessageSquare size={11} />
                  {commentCount}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <ExportBtn icon={<Clipboard size={13} />} label="CLIPBOARD" onClick={handleCopyClipboard} />
              <ExportBtn icon={<Download size={13} />} label="CSV" onClick={handleDownloadCsv} />
              <ExportBtn icon={<Download size={13} />} label="TXT" onClick={handleDownloadTxt} />
              <div style={{ width: 1, height: 24, background: BORDER }} />
              <div style={{ display: "flex", background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: "hidden", padding: 2 }}>
                <ViewBtn icon={<LayoutGrid size={13} />} label="GRID" active={viewMode === "gallery"} onClick={() => setViewMode("gallery")} />
                <ViewBtn icon={<List size={13} />} label="LIST" active={viewMode === "list"} onClick={() => setViewMode("list")} />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)", borderRadius: 8, fontSize: 13, color: C.red }}>
              {error}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div className="ph-results-inner-scroll" style={{ flex: 1, overflowY: "auto", padding: 24, background: "rgba(3,3,3,0.4)" }}>
              {photos.length === 0 && (
                <div style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: TEXT_MUTED }}>선택된 사진이 없습니다.</div>
              )}
              {viewMode === "gallery" && photos.length > 0 && (
                <div className="ph-results-gallery">
                  {photos.map((p, i) => (
                    <GalleryItem
                      key={p.id}
                      num={i + 1}
                      photoIndex={i}
                      focusIndex={galleryThumbFocusIndex}
                      url={p.url}
                      filename={getDisplayFilename(p)}
                      comment={(photoStates[p.id]?.comment ?? "").trim()}
                      fileSize={p.fileSize}
                      onOpen={() => setLightboxIndex(i)}
                    />
                  ))}
                </div>
              )}
              {viewMode === "list" && photos.length > 0 && (
                <div>
                  <div className="ph-results-list-head" style={{ display: "grid", gridTemplateColumns: "48px 60px 1fr 2fr", gap: 12, padding: "8px 14px", fontSize: 10, color: "#71717a", fontWeight: 600, letterSpacing: "0.5px", borderBottom: `1px solid ${BORDER}`, marginBottom: 8 }}>
                    <div>썸네일</div>
                    <div>번호</div>
                    <div>파일명</div>
                    <div>코멘트</div>
                  </div>
                  {photos.map((p, i) => (
                    <ListItem
                      key={p.id}
                      num={i + 1}
                      photoIndex={i}
                      focusIndex={galleryThumbFocusIndex}
                      url={p.url}
                      filename={getDisplayFilename(p)}
                      comment={(photoStates[p.id]?.comment ?? "").trim()}
                      onOpen={() => setLightboxIndex(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            {showActionBar && (
              <div className="ph-results-action-bar" style={{
                flexShrink: 0,
                background: "rgba(8, 4, 2, 0.96)",
                borderTop: `1px solid rgba(255, 90, 31, 0.2)`,
                backdropFilter: "blur(12px)",
                padding: "12px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 16,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT }}>
                    {project.status === "confirmed" ? "보정 준비 완료" : "보정 중"}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED }}>
                    {project.status === "confirmed"
                      ? `${photos.length}장 확정${commentCount > 0 ? ` · 코멘트 ${commentCount}건 확인 후 보정을 시작해주세요` : " · 보정을 시작해주세요"}`
                      : `${photos.length}장 보정 진행 중`}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {project.status === "confirmed" && (
                    <button
                      type="button"
                      onClick={() => setShowEditStartModal(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "9px 20px", background: ACCENT,
                        border: "none", borderRadius: 8, color: "#000",
                        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: MONO,
                        boxShadow: `0 0 16px ${ACCENT_GLOW}`,
                      }}
                    >
                      보정 시작하기
                      <ChevronRight size={14} />
                    </button>
                  )}
                  {project.status === "editing" && (
                    <button
                      type="button"
                      onClick={() => router.push(editVersionsPath)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "9px 20px", background: ACCENT,
                        border: "none", borderRadius: 8, color: "#000",
                        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: MONO,
                        boxShadow: `0 0 16px ${ACCENT_GLOW}`,
                      }}
                    >
                      보정본 업로드
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Edit start modal ── */}
      {showEditStartModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", padding: 16,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.borderMd}`,
            borderRadius: 14, padding: 24, width: "100%", maxWidth: 440,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderRadius: 8, border: "1px solid rgba(255,71,87,0.5)",
              background: "rgba(255,71,87,0.1)", padding: "10px 14px",
              marginBottom: 20, color: C.red,
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>보정 시작 전 반드시 확인하세요</span>
            </div>
            <ol style={{
              paddingLeft: 20, margin: "0 0 24px",
              display: "flex", flexDirection: "column", gap: 12,
              fontSize: 13, color: C.muted,
            }}>
              <li>보정 시작 후 고객은 &quot;최종확정&quot;을 취소할 수 없습니다</li>
              <li>선택된 사진이 고정됩니다 (추가/삭제 불가)</li>
              <li>고객은 읽기 전용 모드로 전환됩니다</li>
            </ol>
            {error && (
              <p style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{error}</p>
            )}
            <div className="ph-results-modal-actions" style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowEditStartModal(false)}
                disabled={editStartSubmitting}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleEditStartConfirm}
                disabled={editStartSubmitting}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "rgba(255,71,87,0.15)",
                  border: "1px solid rgba(255,71,87,0.3)", borderRadius: 8,
                  color: C.red, fontSize: 13, fontWeight: 500,
                  cursor: editStartSubmitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                {editStartSubmitting ? "처리 중..." : "보정 시작 확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit guide (보정본 업로드 전 안내, upload 페이지와 동일) ── */}
      {showEditGuideModal && (
        <div
          className="ph-results-edit-guide-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditGuideModal(false);
          }}
        >
          <div className="ph-results-edit-guide-box">
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, background: "#2ed573" }} />
              <span className="prj-tech-label" style={{ color: "#2ed573" }}>SYS.INFO :: ACTION_REQUIRED</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <CheckCircle2 size={18} color="#2ed573" />
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: TEXT_BRIGHT }}>보정을 시작하지 않았습니다</span>
              </div>
              <p style={{ fontSize: 13, color: TEXT_NORMAL, lineHeight: 1.7, marginBottom: 24 }}>
                보정본을 업로드하려면 먼저 셀렉 결과를 확인하고<strong style={{ color: TEXT_BRIGHT }}> [보정 시작하기]</strong>를 눌러주세요.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowEditGuideModal(false)}
                  style={{
                    flex: 1, padding: "10px 0", background: "transparent",
                    border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT_MUTED, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  CLOSE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditGuideModal(false);
                    router.push(`/photographer/projects/${id}/results`);
                  }}
                  style={{
                    flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: ACCENT, border: "none", borderRadius: 8, color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: MONO,
                  }}
                >
                  VIEW_SELECT_RESULTS
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          photoStates={photoStates}
          index={lightboxIndex}
          onClose={() => {
            setLightboxIndex((i) => {
              if (i !== null) setGalleryThumbFocusIndex(i);
              return null;
            });
          }}
          onPrev={() => setLightboxIndex((i) => (i! > 0 ? i! - 1 : photos.length - 1))}
          onNext={() => setLightboxIndex((i) => (i! < photos.length - 1 ? i! + 1 : 0))}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: showActionBar ? 120 : 24,
          left: "50%", transform: "translateX(-50%)",
          zIndex: 300,
          background: C.surface3, borderRadius: 8,
          padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.text,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          border: `1px solid ${C.border}`,
          whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- sub-components ----------

function ExportBtn({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 6,
        border: `1px solid ${h ? BORDER_MID : BORDER}`,
        background: "transparent",
        color: h ? TEXT_BRIGHT : TEXT_MUTED,
        fontSize: 11, cursor: "pointer", fontFamily: MONO,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ViewBtn({
  icon, label, active, onClick,
}: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px", border: "none",
        background: active ? ACCENT_DIM : "transparent",
        color: active ? ACCENT : TEXT_MUTED,
        fontSize: 11, cursor: "pointer", fontFamily: MONO,
        letterSpacing: "0.08em",
        display: "flex", alignItems: "center", gap: 4,
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function GalleryItem({
  num, photoIndex, focusIndex, url, filename, comment, fileSize, onOpen,
}: {
  num: number;
  photoIndex: number;
  focusIndex: number | null;
  url: string;
  filename: string;
  comment: string;
  fileSize?: number | null;
  onOpen: () => void;
}) {
  const [h, setH] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      className="ph-results-confirm-card"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onOpen}
      style={{
        borderRadius: 4,
        overflow: "hidden",
        cursor: "pointer",
        backgroundColor: "#080808",
      }}
    >
      <div style={{
        aspectRatio: "3/4", background: "#111",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {url && !imgErr ? (
          <img
            src={url}
            alt=""
            {...galleryThumbPriorityProps(photoIndex, focusIndex)}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Image size={40} color="#222" />
        )}
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "rgba(0,0,0,0.8)", color: "#666",
          fontFamily: MONO, fontSize: 9, fontWeight: 600, padding: "3px 8px", borderRadius: 2, border: `1px solid ${BORDER}`, zIndex: 2,
        }}>
          IDX_{String(num).padStart(3, "0")}
        </div>
        {comment ? (
          <div style={{
            position: "absolute", top: 10, right: 10,
            width: 22, height: 22,
            background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)", zIndex: 2,
          }}>
            <MessageSquare size={12} color="#000" strokeWidth={2} />
          </div>
        ) : null}
        <div
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)",
            opacity: h ? 1 : 0,
            transition: "opacity 0.2s",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: 14, zIndex: 3, pointerEvents: h ? "auto" : "none",
          }}
        >
          <button
            type="button"
            className="prj-tech-label"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            style={{
              width: "100%", padding: "8px 0",
              background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)", color: TEXT_BRIGHT,
              fontSize: "0.55rem", letterSpacing: "0.15em", cursor: "pointer",
            }}
          >
            VIEW_FULL_RES
          </button>
        </div>
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, background: SURFACE_2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span className="prj-tech-label" style={{ fontSize: "0.5rem", color: "#444" }}>ASSET</span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: "#666" }}>{formatFileSizeBytes(fileSize)}</span>
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9,
          color: comment ? ACCENT : "#444",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {comment || "NO_NOTES_ATTACHED"}
        </div>
      </div>
    </div>
  );
}

function ListItem({
  num, photoIndex, focusIndex, url, filename, comment, onOpen,
}: {
  num: number;
  photoIndex: number;
  focusIndex: number | null;
  url: string;
  filename: string;
  comment: string;
  onOpen: () => void;
}) {
  const [h, setH] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      className="ph-results-list-row"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onOpen}
      style={{
        display: "grid", gridTemplateColumns: "48px 60px 1fr 2fr",
        gap: 12, alignItems: "center",
        padding: "10px 14px",
        background: h ? SURFACE_2 : SURFACE_1,
        border: `1px solid ${h ? BORDER_MID : BORDER}`,
        borderRadius: 8, marginBottom: 6,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 48, height: 36, background: SURFACE_2, borderRadius: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${BORDER}`, overflow: "hidden", flexShrink: 0,
      }}>
        {url && !imgErr ? (
          <img
            src={url}
            alt=""
            {...galleryThumbPriorityProps(photoIndex, focusIndex)}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Image size={16} color="#71717a" />
        )}
      </div>
      <div style={{ fontSize: 11, color: "#71717a" }}>{num}</div>
      <div style={{
        fontSize: 12, fontWeight: 500, color: TEXT_BRIGHT,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {filename}
      </div>
      <div style={{
        fontSize: 12, color: comment ? ACCENT : "#71717a",
        display: "flex", alignItems: "center", gap: 5,
        overflow: "hidden",
      }}>
        {comment ? (
          <>
            <MessageSquare size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {comment}
            </span>
          </>
        ) : "—"}
      </div>
    </div>
  );
}

// ---------- Lightbox ----------
function Lightbox({
  photos, photoStates, index, onClose, onPrev, onNext,
}: {
  photos: Photo[];
  photoStates: Record<string, { rating?: number; color?: ColorTag[]; comment?: string }>;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];
  const filename = getDisplayFilename(photo);
  const comment = (photoStates[photo.id]?.comment ?? "").trim();
  const total = photos.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div style={{
        position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
        fontSize: 12, color: "rgba(255,255,255,0.5)",
      }}>
        {index + 1} / {total}
      </div>

      {/* Prev */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        style={{
          position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
      >
        <ChevronLeft size={22} />
      </button>

      {/* Image */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          maxWidth: "90vw", width: "100%",
        }}
      >
        <img
          key={photo.id}
          src={viewerImageUrl(photo)}
          alt={filename}
          style={{
            maxHeight: "75vh", maxWidth: "90vw",
            objectFit: "contain", borderRadius: 6,
            display: "block",
          }}
        />

        {/* Info bar */}
        <div style={{
          marginTop: 14,
          background: "rgba(9,9,11,0.94)", border: `1px solid rgba(255,90,31,0.2)`,
          borderRadius: 10, padding: "12px 18px",
          width: "100%", maxWidth: 560,
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT, marginBottom: comment ? 8 : 0 }}>
            {filename}
          </div>
          {comment && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 6,
              padding: "8px 10px", borderRadius: 7,
              background: ACCENT_DIM, border: `1px solid rgba(255,90,31,0.35)`,
            }}>
              <MessageSquare size={13} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: ACCENT, lineHeight: 1.5 }}>{comment}</span>
            </div>
          )}
        </div>
      </div>

      {/* Next */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        style={{
          position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
}
