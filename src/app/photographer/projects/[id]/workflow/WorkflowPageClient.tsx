"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPhotosWithSelections, getProjectById } from "@/lib/db";
import type { Photo, Project, ProjectStatus } from "@/types";
import CompareViewerModal from "@/components/CompareViewerModal";
import { ProjectPipelineHeader } from "@/components/photographer/ProjectPipelineHeader";
import styles from "./Workflow.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

type VersionInfo = {
  id: string;
  url: string;
  reviewStatus: "approved" | "revision_requested" | null;
  comment: string | null;
};

type WorkflowRow = {
  photo: Photo;
  v1: VersionInfo | null;
  v2: VersionInfo | null;
};

type FilterTab = "all" | "approved" | "revision" | "missing";

// ── Helpers ────────────────────────────────────────────────────────────────

function getEffectiveStatus(row: WorkflowRow): "approved" | "revision_requested" | "pending" | "missing" {
  const latest = row.v2?.reviewStatus ?? row.v1?.reviewStatus;
  if (latest === "approved") return "approved";
  if (latest === "revision_requested") return "revision_requested";
  if (row.v1 !== null || row.v2 !== null) return "pending";
  return "missing";
}

function getCTA(status: ProjectStatus, projectId: string) {
  const base = `/photographer/projects/${projectId}`;
  switch (status) {
    case "confirmed":    return { text: "보정본 업로드 시작",  href: `${base}/upload-versions`, note: null };
    case "editing":      return { text: "보정본 업로드 계속",  href: `${base}/upload-versions`, note: null };
    case "reviewing_v1": return { text: "보정본 업로드",        href: null,                      note: "고객이 v1 검토 중입니다" };
    case "editing_v2":   return { text: "재보정본 업로드",      href: `${base}/upload-versions/v2`, note: null };
    case "reviewing_v2": return { text: "재보정본 업로드",      href: null,                      note: "고객이 v2 재검토 중입니다" };
    case "delivered":    return { text: "납품 완료 ✓",         href: null,                      note: null };
    // selecting / preparing — 아직 고객 확정 전
    default:             return { text: "보정본 업로드",        href: null,                      note: "고객 셀렉 완료 후 업로드 가능합니다" };
  }
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CornerBrackets() {
  return (
    <>
      <div className={`${styles.cornerBracket} ${styles.bracketTL}`} />
      <div className={`${styles.cornerBracket} ${styles.bracketTR}`} />
      <div className={`${styles.cornerBracket} ${styles.bracketBL}`} />
      <div className={`${styles.cornerBracket} ${styles.bracketBR}`} />
    </>
  );
}

function TechCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className={`${styles.techCheckbox} cursor-pointer flex items-center`}>
      <input type="checkbox" checked={checked} onChange={onChange} readOnly={false} />
      <div className={styles.box}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </label>
  );
}

function StatusBadge({ status }: { status: "approved" | "revision_requested" | "pending" | "reviewing" }) {
  if (status === "reviewing") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusReviewing}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        검토 중
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusConfirmed}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        확정
      </span>
    );
  }
  if (status === "revision_requested") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusRequest}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 2v6h6" />
        </svg>
        재보정 요청
      </span>
    );
  }
  return (
    <span className={`${styles.statusBadge} ${styles.statusPending}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      검토 대기
    </span>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function UploadPlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-[60px] border border-dashed border-[#333] bg-[#0a0a0a] flex items-center justify-center cursor-pointer hover:border-[#FF4D00] hover:bg-[#FF4D00]/5 transition-colors group/upload">
      <div className="flex items-center gap-2 text-[#666] group-hover/upload:text-[#FF4D00]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[11px] font-mono uppercase tracking-wide">{label}</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function WorkflowPageClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject]             = useState<Project | null>(null);
  const [rows, setRows]                   = useState<WorkflowRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [filter, setFilter]               = useState<FilterTab>("all");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [viewerOpen, setViewerOpen]       = useState(false);
  const [viewerIdx, setViewerIdx]         = useState(0);
  const [viewerTab, setViewerTab]         = useState<"original" | "v1" | "v2">("original");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [projectData, photosResult, versionsRes] = await Promise.all([
          getProjectById(id),
          getPhotosWithSelections(id),
          fetch(`/api/photographer/projects/${id}/versions`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        setProject(projectData);

        const selectedPhotos = photosResult.photos.filter((p) =>
          photosResult.selectedIds.has(p.id)
        );

        const v1Map = new Map<string, VersionInfo>();
        const v2Map = new Map<string, VersionInfo>();
        for (const v of versionsRes.versions ?? []) {
          const info: VersionInfo = {
            id: v.id,
            url: v.r2_url,
            reviewStatus: v.review_status ?? null,
            comment: v.customer_comment ?? null,
          };
          if (v.version === 1) v1Map.set(v.photo_id, info);
          else if (v.version === 2) v2Map.set(v.photo_id, info);
        }

        setRows(
          selectedPhotos.map((photo) => ({
            photo,
            v1: v1Map.get(photo.id) ?? null,
            v2: v2Map.get(photo.id) ?? null,
          }))
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "approved":  return rows.filter((r) => getEffectiveStatus(r) === "approved");
      case "revision":  return rows.filter((r) => getEffectiveStatus(r) === "revision_requested");
      case "missing":   return rows.filter((r) => r.v1 === null);
      default:          return rows;
    }
  }, [rows, filter]);

  const viewerItems = useMemo(() =>
    filteredRows.map((row) => ({
      original: {
        url: row.photo.previewUrl ?? row.photo.url,
        filename: row.photo.originalFilename ?? `#${row.photo.orderIndex}`,
      },
      v1: row.v1 ? { url: row.v1.url, filename: "보정본 v1" } : undefined,
      v2: row.v2 ? { url: row.v2.url, filename: "보정본 v2" } : undefined,
    })),
  [filteredRows]);

  function openViewer(idx: number, tab: "original" | "v1" | "v2") {
    setViewerIdx(idx);
    setViewerTab(tab);
    setViewerOpen(true);
  }

  const counts = useMemo(() => ({
    total:      rows.length,
    v1Uploaded: rows.filter((r) => r.v1 !== null).length,
    approved:   rows.filter((r) => getEffectiveStatus(r) === "approved").length,
    revision:   rows.filter((r) => getEffectiveStatus(r) === "revision_requested").length,
    v2Uploaded: rows.filter((r) => r.v2 !== null).length,
  }), [rows]);

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedPhotoIds.has(r.photo.id));

  function toggleSelectAll() {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredRows.forEach((r) => next.delete(r.photo.id));
      else             filteredRows.forEach((r) => next.add(r.photo.id));
      return next;
    });
  }

  function toggleSelect(photoId: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.has(photoId) ? next.delete(photoId) : next.add(photoId);
      return next;
    });
  }

  async function handleDelete(versionId: string, photoId: string, version: 1 | 2) {
    if (!confirm(`v${version} 보정본을 삭제하시겠습니까?`)) return;
    setDeletingId(versionId);
    try {
      const res = await fetch(
        `/api/photographer/projects/${id}/versions/${versionId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제 실패");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.photo.id !== photoId ? r : { ...r, [version === 1 ? "v1" : "v2"]: null }
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  function getExportTargets() {
    return selectedPhotoIds.size > 0
      ? filteredRows.filter((r) => selectedPhotoIds.has(r.photo.id))
      : filteredRows;
  }

  function handleDownloadCSV() {
    const targets = getExportTargets();
    const bom = "\uFEFF";
    const header = "번호,파일명,셀렉 코멘트,v1 검토 상태,v1 검토 코멘트,v2 검토 상태,v2 검토 코멘트\n";
    const body = targets
      .map((r, i) =>
        [
          i + 1,
          `"${(r.photo.originalFilename ?? "").replace(/"/g, '""')}"`,
          `"${(r.photo.comment ?? "").replace(/"/g, '""')}"`,
          r.v1?.reviewStatus ?? "",
          `"${(r.v1?.comment ?? "").replace(/"/g, '""')}"`,
          r.v2?.reviewStatus ?? "",
          `"${(r.v2?.comment ?? "").replace(/"/g, '""')}"`,
        ].join(",")
      )
      .join("\n");
    downloadBlob(bom + header + body, `workflow-${id.slice(0, 8)}.csv`, "text/csv;charset=utf-8;");
  }

  function handleDownloadTXT() {
    const targets = getExportTargets();
    const lines: string[] = [];
    lines.push(`=== ${project?.name ?? "프로젝트"} 워크플로우 현황 ===`);
    lines.push(`총 ${targets.length}장`);
    lines.push("");
    targets.forEach((r, i) => {
      const filename = r.photo.originalFilename || String(r.photo.orderIndex);
      lines.push(`${i + 1}. ${filename}`);
      if (r.photo.comment) lines.push(`   셀렉 코멘트: "${r.photo.comment}"`);
      if (r.v1) {
        const s = r.v1.reviewStatus === "approved" ? "확정" : r.v1.reviewStatus === "revision_requested" ? "재보정 요청" : "검토 대기";
        lines.push(`   v1 상태: ${s}`);
        if (r.v1.comment) lines.push(`   v1 코멘트: "${r.v1.comment}"`);
      } else {
        lines.push(`   v1: 미업로드`);
      }
      if (r.v2) {
        const s = r.v2.reviewStatus === "approved" ? "확정" : r.v2.reviewStatus === "revision_requested" ? "재보정 요청" : "검토 대기";
        lines.push(`   v2 상태: ${s}`);
        if (r.v2.comment) lines.push(`   v2 코멘트: "${r.v2.comment}"`);
      }
      lines.push("");
    });
    downloadBlob(lines.join("\n"), `workflow-${id.slice(0, 8)}.txt`, "text/plain;charset=utf-8;");
  }

  // ── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <span className="font-mono text-[#444] text-sm uppercase tracking-widest">Loading…</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-4">
        <span className="text-[#FF4D00] font-mono text-sm">{error ?? "프로젝트를 찾을 수 없습니다."}</span>
        <button
          onClick={() => router.push(`/photographer/projects/${id}`)}
          className="font-mono text-[11px] uppercase tracking-widest text-[#888] border border-[#333] px-4 py-2 hover:text-white hover:border-[#555] transition-colors"
        >
          돌아가기
        </button>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────

  const inV2Phase    = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const showV2Col    = project.allowRevision;
  const v2Dimmed     = project.allowRevision && !inV2Phase;
  const canDeleteV1  = project.status === "editing";
  const canDeleteV2  = project.status === "editing_v2";
  const cta          = getCTA(project.status, id);
  const isSelecting   = project.status === "selecting";
  const isReviewingV1 = project.status === "reviewing_v1";
  const isReviewingV2 = project.status === "reviewing_v2";

  const colsClass = showV2Col
    ? "grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
    : "grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)]";

  const statsColsClass = showV2Col ? "grid-cols-5" : "grid-cols-4";

  const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",      label: "전체",    count: counts.total    },
    ...(!isReviewingV1 ? [
      { key: "approved" as FilterTab, label: "확정",   count: counts.approved },
      { key: "revision" as FilterTab, label: "재보정", count: counts.revision },
    ] : []),
    { key: "missing",  label: "미업로드", count: counts.total - counts.v1Uploaded },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative bg-black text-white"
      style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
    >
      {/* Decorative */}
      <div className={styles.gridBg} />
      <div className={styles.scanline} />

      {/* ── Header ── */}
      <ProjectPipelineHeader projectId={id} project={project} />

      {/* ── Selecting: waiting screen ── */}
      {isSelecting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 relative z-20">
          <div className="w-14 h-14 rounded-full border border-[#333] flex items-center justify-center text-[#444]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="text-center flex flex-col gap-2">
            <p className="text-white font-semibold text-sm">고객이 셀렉 중입니다</p>
            <p className="text-[#666] text-[12px] font-mono">고객 셀렉 완료 후 보정 업로드가 가능합니다</p>
          </div>
        </div>
      )}

      {/* ── Stats / Filter / List (hidden while selecting) ── */}
      {!isSelecting && (<>
      <div className={`border-b border-[#222] bg-[#050505]/80 backdrop-blur-sm shrink-0 z-40 relative grid ${statsColsClass} divide-x divide-[#222]`}>
        <div className="px-6 py-4 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-[#666] tracking-widest uppercase">셀렉된 사진</span>
          <span className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{counts.total}</span>
        </div>
        <div className="px-6 py-4 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-[#666] tracking-widest uppercase">v1 보정본 업로드</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{counts.v1Uploaded}</span>
            <span className="font-mono text-[11px] text-[#555]">/ {counts.total}</span>
          </div>
        </div>
        <div className="px-6 py-4 flex flex-col gap-1 bg-[rgba(0,255,102,0.02)]">
          <span className="font-mono text-[10px] text-[#666] tracking-widest uppercase">확정된 사진</span>
          <span className="text-2xl font-bold text-[#00FF66]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {isReviewingV1 ? "—" : counts.approved}
          </span>
        </div>
        <div className="px-6 py-4 flex flex-col gap-1 bg-[rgba(255,77,0,0.02)]">
          <span className="font-mono text-[10px] text-[#666] tracking-widest uppercase">재보정 요청</span>
          <span className="text-2xl font-bold text-[#FF4D00]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {isReviewingV1 ? "—" : counts.revision}
          </span>
        </div>
        {showV2Col && (
          <div className="px-6 py-4 flex flex-col gap-1">
            <span className="font-mono text-[10px] text-[#666] tracking-widest uppercase">v2 재보정본 업로드</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{counts.v2Uploaded}</span>
              <span className="font-mono text-[11px] text-[#555]">/ {counts.revision}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="h-[48px] shrink-0 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-6 z-30 relative">
        <div className="flex items-center h-full">
          <label className={`${styles.techCheckbox} cursor-pointer flex items-center gap-3 pr-6 border-r border-[#222] h-full`}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <div className={styles.box}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-[11px] font-mono tracking-widest text-[#888] uppercase">전체 선택</span>
          </label>

          <div className="flex h-full px-2">
            {FILTER_TABS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 h-full flex items-center justify-center text-[12px] font-bold transition-colors border-b-2 ${
                  filter === key
                    ? "text-white border-[#FF4D00]"
                    : "text-[#888] hover:text-[#CCC] border-transparent"
                }`}
              >
                {label}
                <span className={`font-mono text-[10px] ml-1 ${filter === key ? "text-[#FF4D00]" : "opacity-60"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCSV}
            className="h-7 px-3 border border-[#333] bg-[#111] hover:border-[#555] hover:text-white text-[#888] text-[10px] font-mono tracking-widest uppercase transition-colors flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
          <button
            onClick={handleDownloadTXT}
            className="h-7 px-3 border border-[#333] bg-[#111] hover:border-[#555] hover:text-white text-[#888] text-[10px] font-mono tracking-widest uppercase transition-colors flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            TXT
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className={`flex-1 overflow-y-auto relative z-20 ${styles.scrollArea}`}>

        {/* Column header row */}
        <div className={`grid ${colsClass} bg-[#050505] border-b border-[#222] sticky top-0 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]`}>
          <div className="p-3" />
          <div className="p-3 text-[10px] font-mono text-[#555] uppercase tracking-widest border-l border-[#1a1a1a]">
            Original (Select)
          </div>
          <div className="p-3 text-[10px] font-mono text-[#555] uppercase tracking-widest border-l border-[#1a1a1a]">
            v1 Retouch
          </div>
          {showV2Col && (
            <div className="p-3 text-[10px] font-mono text-[#555] uppercase tracking-widest border-l border-[#1a1a1a]">
              v2 Re-retouch
            </div>
          )}
        </div>

        {/* Empty state */}
        {filteredRows.length === 0 && (
          <div className="py-16 flex items-center justify-center text-[#444] font-mono text-sm">
            해당하는 사진이 없습니다.
          </div>
        )}

        {/* Data rows */}
        {filteredRows.map((row, rowIdx) => {
          const isRevisionPhoto = row.v1?.reviewStatus === "revision_requested";
          const isSelected = selectedPhotoIds.has(row.photo.id);

          return (
            <div
              key={row.photo.id}
              className={`${styles.photoRow} grid ${colsClass} border-b border-[#222] hover:bg-[#0f0f0f] transition-colors relative ${isSelected ? "bg-[#0a0800]" : ""}`}
            >
              {/* Checkbox */}
              <div className="flex items-center justify-center border-r border-[#1a1a1a]">
                <TechCheckbox
                  checked={isSelected}
                  onChange={() => toggleSelect(row.photo.id)}
                />
              </div>

              {/* Col 1: Original */}
              <div className="p-4 flex gap-4 items-start border-r border-[#1a1a1a]">
                <div className="w-[90px] aspect-[3/2] bg-[#161616] relative shrink-0 border border-[#333] overflow-hidden">
                  {row.photo.url && (
                    <img
                      src={row.photo.url}
                      alt={row.photo.originalFilename ?? ""}
                      className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                      onClick={() => openViewer(rowIdx, "original")}
                    />
                  )}
                  <CornerBrackets />
                </div>
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  <span className="font-mono text-[12px] text-[#CCC] truncate">
                    {row.photo.originalFilename ?? `#${row.photo.orderIndex}`}
                  </span>
                  {row.photo.comment && (
                    <p className="text-[11px] text-[#888] leading-snug line-clamp-2">
                      &ldquo;{row.photo.comment}&rdquo;
                    </p>
                  )}
                </div>
              </div>

              {/* Col 2: v1 */}
              <div
                className={`${styles.versionCell} p-4 flex gap-4 items-start border-r border-[#1a1a1a] relative ${
                  row.v1?.reviewStatus === "revision_requested" ? "bg-[#110500]" : ""
                }`}
              >
                {row.v1 ? (
                  <>
                    <div
                      className={`w-[90px] aspect-[3/2] bg-[#161616] relative shrink-0 overflow-hidden ${
                        row.v1.reviewStatus === "revision_requested"
                          ? "border border-[#FF4D00]/50"
                          : "border border-[#333]"
                      }`}
                    >
                      <img
                        src={row.v1.url}
                        alt="v1 보정본"
                        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                        onClick={() => openViewer(rowIdx, "v1")}
                      />
                      <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm px-1 py-0.5 text-[8px] font-mono text-[#AAA] uppercase border border-[#333]">
                        v1
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <StatusBadge
                          status={isReviewingV1 ? "reviewing" : (row.v1.reviewStatus ?? "pending")}
                        />
                        {canDeleteV1 && (
                          <button
                            className={styles.deleteBtn}
                            onClick={() => handleDelete(row.v1!.id, row.photo.id, 1)}
                            disabled={deletingId === row.v1.id}
                            title="v1 삭제"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                      {!isReviewingV1 && row.v1.comment && (
                        <p className="text-[11px] text-[#DDD] leading-snug line-clamp-2">
                          &ldquo;{row.v1.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1">
                    <UploadPlaceholder label="v1 업로드 대기" />
                  </div>
                )}
              </div>

              {/* Col 3: v2 */}
              {showV2Col && (
                <div
                  className={`${styles.versionCell} p-4 flex gap-4 items-start relative ${
                    v2Dimmed ? "opacity-30 bg-[#050505]" : ""
                  }`}
                >
                  {v2Dimmed ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-[#444] w-full py-4">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      <span className="font-mono text-[10px] uppercase tracking-widest">다음 단계</span>
                    </div>
                  ) : !isRevisionPhoto ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-[#444] w-full py-4 opacity-30">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      <span className="font-mono text-[10px] uppercase tracking-widest">N/A — 확정됨</span>
                    </div>
                  ) : row.v2 ? (
                    <>
                      <div className="w-[90px] aspect-[3/2] bg-[#161616] relative shrink-0 border border-[#444] overflow-hidden">
                        <img
                          src={row.v2.url}
                          alt="v2 재보정"
                          className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                          onClick={() => openViewer(rowIdx, "v2")}
                        />
                        <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm px-1 py-0.5 text-[8px] font-mono text-[#FF4D00] uppercase border border-[#FF4D00]/50">
                          v2
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <StatusBadge status={isReviewingV2 ? "reviewing" : (row.v2.reviewStatus ?? "pending")} />
                          {canDeleteV2 && (
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDelete(row.v2!.id, row.photo.id, 2)}
                              disabled={deletingId === row.v2.id}
                              title="v2 삭제"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                        {!isReviewingV2 && row.v2.comment && (
                          <p className="text-[11px] text-[#DDD] leading-snug line-clamp-2">
                            &ldquo;{row.v2.comment}&rdquo;
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1">
                      <UploadPlaceholder label="v2 업로드 대기" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>)}

      {/* ── Compare Viewer Modal ── */}
      <CompareViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        photos={viewerItems}
        initialIndex={viewerIdx}
        initialTab={viewerTab}
      />

      {/* ── Footer CTA ── */}
      <footer className="shrink-0 bg-black/95 backdrop-blur-lg border-t border-[#333] z-50">
        {/* 상태 안내 배너 — note 있을 때만 */}
        {cta.note && (
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-[#FF4D00]/20 bg-[#FF4D00]/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[13px] text-[#FF4D00] font-medium">{cta.note}</span>
          </div>
        )}

        {/* 버튼 바 */}
        <div className="h-16 flex items-center justify-between px-6">
          <div className="hidden sm:flex items-center gap-6 opacity-60">
            <div className="flex items-center gap-1.5">
              <kbd className="font-mono text-[10px] border border-[#444] bg-[#111] rounded-[2px] px-1.5 py-0.5 text-[#AAA]">Space</kbd>
              <span className="text-[11px] text-[#666]">크게 보기</span>
            </div>
          </div>

          <div className="flex items-center gap-6 ml-auto">
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-[#888] uppercase tracking-widest font-mono font-bold">Selected</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-[#FF4D00]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {selectedPhotoIds.size}
                </span>
                <span className="text-sm font-mono text-[#555]">/ {counts.total}</span>
              </div>
            </div>
            <button
              className={styles.ctaBtn}
              disabled={!cta.href}
              onClick={() => cta.href && router.push(cta.href)}
            >
              {cta.text}
              {cta.href && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
