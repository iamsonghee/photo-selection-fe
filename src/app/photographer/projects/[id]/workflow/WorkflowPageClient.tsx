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

type FilterTab = "all" | "approved" | "revision" | "v1_pending" | "v2_pending";

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
    case "confirmed":    return { text: "보정본 업로드 시작",  href: `${base}/upload-versions`,    note: null };
    case "editing":      return { text: "보정본 업로드 계속",  href: `${base}/upload-versions`,    note: null };
    case "reviewing_v1": return { text: "보정본 업로드",       href: null,                          note: "고객이 v1 검토 중입니다" };
    case "editing_v2":   return { text: "재보정본 업로드",     href: `${base}/upload-versions/v2`, note: null };
    case "reviewing_v2": return { text: "재보정본 업로드",     href: null,                          note: "고객이 v2 재검토 중입니다" };
    case "delivered":    return { text: "납품 완료 ✓",        href: null,                          note: null };
    default:             return { text: "보정본 업로드",       href: null,                          note: "고객 셀렉 완료 후 업로드 가능합니다" };
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "approved" | "revision_requested" | "pending" | "reviewing" }) {
  if (status === "reviewing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        검토 중
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        확정 완료
      </span>
    );
  }
  if (status === "revision_requested") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-orange-500/10 text-orange-500 border border-orange-500/20">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        재보정 요청
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
      검토 대기
    </span>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
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

// ── Main Component ─────────────────────────────────────────────────────────

export default function WorkflowPageClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject]       = useState<Project | null>(null);
  const [rows, setRows]             = useState<WorkflowRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>("all");
  const [selectedPhotoIds]          = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx]   = useState(0);
  const [viewerTab, setViewerTab]   = useState<"original" | "v1" | "v2">("original");

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

  const counts = useMemo(() => {
    const inV2 = ["editing_v2", "reviewing_v2", "delivered"].includes(project?.status ?? "");
    const effV1 = (s: string | null) => (inV2 && s === null ? "approved" : (s ?? "pending"));
    const getEff = (row: WorkflowRow) => {
      if (row.v2?.reviewStatus) return row.v2.reviewStatus;
      const v1s = effV1(row.v1?.reviewStatus ?? null);
      if (v1s === "approved" || v1s === "revision_requested") return v1s;
      if (row.v1 !== null) return "pending";
      return "missing";
    };
    return {
      total:      rows.length,
      v1Uploaded: rows.filter((r) => r.v1 !== null).length,
      approved:   rows.filter((r) => getEff(r) === "approved").length,
      revision:   rows.filter((r) => getEff(r) === "revision_requested").length,
      v2Uploaded: rows.filter((r) => r.v2 !== null).length,
    };
  }, [rows, project?.status]);

  const filteredRows = useMemo(() => {
    const inV2 = ["editing_v2", "reviewing_v2", "delivered"].includes(project?.status ?? "");
    const effV1 = (s: string | null) => (inV2 && s === null ? "approved" : (s ?? "pending"));
    const getEff = (row: WorkflowRow) => {
      if (row.v2?.reviewStatus) return row.v2.reviewStatus;
      const v1s = effV1(row.v1?.reviewStatus ?? null);
      if (v1s === "approved" || v1s === "revision_requested") return v1s;
      if (row.v1 !== null) return "pending";
      return "missing";
    };
    switch (filter) {
      case "approved":   return rows.filter((r) => getEff(r) === "approved");
      case "revision":   return rows.filter((r) => getEff(r) === "revision_requested");
      case "v1_pending": return rows.filter((r) => r.v1 === null);
      case "v2_pending": return rows.filter((r) => effV1(r.v1?.reviewStatus ?? null) === "revision_requested" && r.v2 === null);
      default:           return rows;
    }
  }, [rows, filter, project?.status]);

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

  // ── Loading / Error ────────────────────────────────────────────────────────

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

  // ── Derived state ──────────────────────────────────────────────────────────

  const inV2Phase     = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const showV2Col     = project.allowRevision;
  const v2Dimmed      = project.allowRevision && !inV2Phase;
  const canDeleteV1   = project.status === "editing";
  const canDeleteV2   = project.status === "editing_v2";
  const ctaBase       = getCTA(project.status, id);
  // editing_v2 인데 재보정 요청이 없으면(= 모든 v1 확정) 업로드 불필요 안내로 덮어씀
  const cta = (project.status === "editing_v2" && counts.revision === 0)
    ? { text: "모든 사진 확정 완료", href: null, note: "재보정 요청 없음 — 납품 처리를 진행해주세요" }
    : ctaBase;
  const isSelecting   = project.status === "selecting";
  const isReviewingV1 = project.status === "reviewing_v1";
  const isReviewingV2 = project.status === "reviewing_v2";
  const canUploadV1   = ["confirmed", "editing"].includes(project.status);
  const canUploadV2   = project.status === "editing_v2";

  // v2 단계 이상에서 reviewStatus null인 v1은 확정으로 간주 (프로젝트 진행 단계가 증거)
  const effectiveV1Status = (s: string | null) => (inV2Phase && s === null ? "approved" : (s ?? "pending"));

  const colsClass = showV2Col ? "grid-cols-3" : "grid-cols-2";

  const v2PendingCount = rows.filter(
    (r) => effectiveV1Status(r.v1?.reviewStatus ?? null) === "revision_requested" && r.v2 === null
  ).length;

  const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",        label: "전체",      count: counts.total },
    ...(!isReviewingV1 ? [
      { key: "approved"   as FilterTab, label: "확정",       count: counts.approved },
      { key: "revision"   as FilterTab, label: "재보정요청", count: counts.revision },
    ] : []),
    { key: "v1_pending", label: "V1대기중",  count: counts.total - counts.v1Uploaded },
    ...(showV2Col ? [{ key: "v2_pending" as FilterTab, label: "V2대기중", count: v2PendingCount }] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-black text-white" style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}>

      {/* ── Top nav header ── */}
      <ProjectPipelineHeader projectId={id} project={project} />

      {/* ── Sub-header: project name + stats + filters ── */}
      <div className="shrink-0 bg-black border-b border-[#222222] px-8 py-5 flex flex-col gap-4 z-40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded bg-[#FF4D00] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
          </div>
          {!isSelecting && (
            <div className="flex items-center bg-[#111111] border border-[#222] rounded-lg px-4 py-2 font-mono text-sm flex-wrap gap-y-1">
              <span className="text-gray-400">원본 셀렉 <strong className="text-white">{counts.total}</strong>장</span>
              <span className="text-[#333] mx-3">|</span>
              <span className="text-gray-400">보정본 업로드 <strong className="text-white">{counts.v1Uploaded}/{counts.total}</strong></span>
              <span className="text-[#333] mx-3">|</span>
              <span className="text-gray-400">확정 <strong className={isReviewingV1 ? "text-white" : "text-emerald-500"}>{isReviewingV1 ? "—" : counts.approved}</strong></span>
              <span className="text-[#333] mx-3">|</span>
              <span className="text-gray-400">재보정요청 <strong className={isReviewingV1 ? "text-white" : "text-orange-500"}>{isReviewingV1 ? "—" : counts.revision}</strong></span>
              {showV2Col && (
                <>
                  <span className="text-[#333] mx-3">|</span>
                  <span className="text-gray-400">재보정본 업로드 <strong className="text-white">{counts.v2Uploaded}/{counts.revision}</strong></span>
                </>
              )}
            </div>
          )}
        </div>

        {!isSelecting && (
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_TABS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === key
                    ? "bg-white text-black"
                    : "bg-[#111] border border-[#333] text-gray-400 hover:text-white hover:border-[#555]"
                }`}
              >
                {label}
                {filter !== key && (
                  <span className="ml-1.5 text-xs opacity-60">{count}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selecting: waiting screen ── */}
      {isSelecting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
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

      {/* ── Main content ── */}
      {!isSelecting && (
        <div className={`flex-1 overflow-y-auto ${styles.scrollArea}`}>
          <div className="max-w-[1600px] mx-auto px-8 pt-8 pb-8">

            {/* Column headers */}
            <div className={`grid ${colsClass} gap-6 mb-4`}>
              {/* Col 1 */}
              <div className="bg-[#0A0A0A] border border-[#222] rounded-t-xl p-4 flex items-center gap-2">
                <span className="font-bold text-gray-200">1단계: 원본</span>
                <span className="text-xs text-gray-500 border border-[#333] px-1.5 py-0.5 rounded">고객 코멘트</span>
              </div>
              {/* Col 2 */}
              <div className={`bg-[#0A0A0A] border border-[#222] ${canUploadV1 ? "border-b-[#FF4D00] border-b-2" : ""} rounded-t-xl p-4 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-200">2단계: v1 보정본</span>
                  <span className="text-xs text-gray-500 border border-[#333] px-1.5 py-0.5 rounded">상태 &amp; 코멘트</span>
                </div>
                {canUploadV1 && (
                  <button
                    onClick={() => router.push(`/photographer/projects/${id}/upload-versions`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#444] text-gray-300 hover:border-[#FF4D00] hover:text-[#FF4D00] transition-colors bg-[#111]"
                  >
                    <UploadIcon />
                    v1 일괄업로드
                  </button>
                )}
              </div>
              {/* Col 3 - v2 */}
              {showV2Col && (
                <div className={`bg-[#0A0A0A] border border-[#222] ${canUploadV2 && counts.revision > 0 ? "border-b-[#FF4D00] border-b-2" : ""} rounded-t-xl p-4 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-200">3단계: v2 재보정본</span>
                  </div>
                  {canUploadV2 && counts.revision > 0 && (
                    <button
                      onClick={() => router.push(`/photographer/projects/${id}/upload-versions/v2`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#333] text-gray-500 hover:border-[#FF4D00] hover:text-[#FF4D00] transition-colors bg-[#0a0a0a]"
                    >
                      <UploadIcon />
                      v2 일괄업로드
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Empty state */}
            {filteredRows.length === 0 && (
              <div className="py-16 flex items-center justify-center text-gray-600 text-sm">
                해당하는 사진이 없습니다.
              </div>
            )}

            {/* Photo rows */}
            <div className="flex flex-col gap-4">
              {filteredRows.map((row, rowIdx) => {
                const isRevisionPhoto = effectiveV1Status(row.v1?.reviewStatus ?? null) === "revision_requested";
                const filename = row.photo.originalFilename ?? `#${row.photo.orderIndex}`;

                const v1ThumbCls = !row.v1 ? "" :
                  row.v1.reviewStatus === "approved"
                    ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : row.v1.reviewStatus === "revision_requested"
                      ? "border-orange-500/50"
                      : "border-[#333]";

                const v2ThumbCls = !row.v2 ? "border-[#444]" :
                  row.v2.reviewStatus === "approved"
                    ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "border-[#444]";

                return (
                  <div
                    key={row.photo.id}
                    className={`grid ${colsClass} gap-6 p-4 bg-[#0A0A0A] border border-[#222] rounded-xl hover:border-[#444] transition-colors group`}
                  >
                    {/* ── Col 1: Original ── */}
                    <div className="flex gap-4">
                      <div className="w-28 h-28 bg-[#1A1A1A] rounded-lg overflow-hidden flex-shrink-0 border border-[#333]">
                        {row.photo.url && (
                          <img
                            src={row.photo.url}
                            alt={filename}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => openViewer(rowIdx, "original")}
                          />
                        )}
                      </div>
                      <div className="flex flex-col py-1 flex-1 min-w-0">
                        <span className="text-sm font-mono text-gray-200 mb-2 truncate">{filename}</span>
                        {row.photo.comment ? (
                          <div className="mt-auto bg-[#111] border border-[#222] p-2.5 rounded-lg text-sm text-gray-300 relative">
                            <div className="absolute -top-2.5 left-3 bg-[#0a0a0a] px-1 text-[10px] text-gray-500 font-medium">고객 요청사항</div>
                            &ldquo;{row.photo.comment}&rdquo;
                          </div>
                        ) : (
                          <div className="mt-auto p-2.5 text-sm text-gray-600 italic">코멘트 없음</div>
                        )}
                      </div>
                    </div>

                    {/* ── Col 2: v1 ── */}
                    <div className="flex gap-4 relative">
                      {/* Connector */}
                      <div className="absolute top-14 -left-9 w-6 h-px bg-[#333] group-hover:bg-[#FF4D00] transition-colors" />
                      <div className="absolute top-[54px] -left-3 w-1.5 h-1.5 rounded-full bg-[#333] group-hover:bg-[#FF4D00] transition-colors" />

                      {row.v1 ? (
                        <>
                          <div className={`w-28 h-28 bg-[#1A1A1A] rounded-lg overflow-hidden flex-shrink-0 relative border ${v1ThumbCls}`}>
                            <img
                              src={row.v1.url}
                              alt="v1 보정본"
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => openViewer(rowIdx, "v1")}
                            />
                            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm px-1 py-0.5 text-[8px] font-mono text-[#AAA] uppercase border border-[#333]">v1</div>
                          </div>
                          <div className="flex flex-col py-1 w-full min-w-0">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <StatusBadge status={isReviewingV1 ? "reviewing" : effectiveV1Status(row.v1.reviewStatus) as "approved" | "revision_requested" | "pending"} />
                              {canDeleteV1 && (
                                <button
                                  onClick={() => handleDelete(row.v1!.id, row.photo.id, 1)}
                                  disabled={deletingId === row.v1.id}
                                  className="text-[#555] hover:text-[#FF4D00] transition-colors p-1 shrink-0"
                                  title="v1 삭제"
                                >
                                  <TrashIcon />
                                </button>
                              )}
                            </div>
                            {!isReviewingV1 && row.v1.comment && (
                              row.v1.reviewStatus === "revision_requested" ? (
                                <div className="mt-auto bg-[#111] border border-[#222] border-l-2 border-l-orange-500 p-2.5 rounded-r-lg rounded-l-none text-sm text-gray-300 relative">
                                  <div className="absolute -top-2.5 left-2 bg-[#0a0a0a] px-1 text-[10px] text-orange-500 font-medium">고객 피드백</div>
                                  &ldquo;{row.v1.comment}&rdquo;
                                </div>
                              ) : row.v1.reviewStatus === "approved" ? (
                                <div className="mt-auto bg-[#111] border border-[#222] p-2.5 rounded-lg text-sm text-gray-300 relative">
                                  <div className="absolute -top-2.5 left-3 bg-[#0a0a0a] px-1 text-[10px] text-emerald-500 font-medium">고객 확정</div>
                                  &ldquo;{row.v1.comment}&rdquo;
                                </div>
                              ) : (
                                <div className="mt-auto bg-[#111] border border-[#222] p-2.5 rounded-lg text-sm text-gray-300 relative">
                                  <div className="absolute -top-2.5 left-3 bg-[#0a0a0a] px-1 text-[10px] text-[#FF4D00] font-medium">작가 코멘트</div>
                                  &ldquo;{row.v1.comment}&rdquo;
                                </div>
                              )
                            )}
                          </div>
                        </>
                      ) : (
                        <div
                          className="w-full h-28 bg-[#0F0F0F] border-2 border-[#2A2A2A] border-dashed hover:border-[#FF4D00]/50 hover:bg-[#FF4D00]/5 transition-all rounded-lg flex flex-col items-center justify-center cursor-pointer group/upload"
                          onClick={() => router.push(`/photographer/projects/${id}/upload-versions`)}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#1A1A1A] group-hover/upload:bg-[#FF4D00]/20 flex items-center justify-center mb-2 text-gray-400 group-hover/upload:text-[#FF4D00] transition-colors">
                            <UploadIcon />
                          </div>
                          <span className="text-xs text-gray-400 font-medium group-hover/upload:text-[#FF4D00] transition-colors">v1 보정본 업로드</span>
                        </div>
                      )}
                    </div>

                    {/* ── Col 3: v2 ── */}
                    {showV2Col && (
                      <div className="flex gap-4 relative">
                        {/* Connector */}
                        {isRevisionPhoto && !v2Dimmed ? (
                          <>
                            <div className="absolute top-14 -left-9 w-6 h-px bg-[#333] group-hover:bg-[#FF4D00] transition-colors" />
                            <div className="absolute top-[54px] -left-3 w-1.5 h-1.5 rounded-full bg-[#333] group-hover:bg-[#FF4D00] transition-colors" />
                          </>
                        ) : (
                          <div className="absolute top-14 -left-9 w-6 h-px bg-[#222]" />
                        )}

                        {v2Dimmed ? (
                          <div className="w-full h-28 bg-[#0F0F0F] border border-[#222] border-dashed rounded-lg flex flex-col items-center justify-center text-center px-4">
                            <div className="w-8 h-8 rounded-full bg-[#161616] flex items-center justify-center mb-2">
                              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </div>
                            <span className="text-xs text-gray-500">V1 검토 완료 후 업로드 가능</span>
                          </div>
                        ) : !isRevisionPhoto ? (
                          <div className={`w-full h-28 ${styles.stripeBg} border border-[#222] rounded-lg flex flex-col items-center justify-center text-center px-4 opacity-50`}>
                            <div className="w-8 h-8 rounded-full bg-[#111] border border-[#333] flex items-center justify-center mb-2">
                              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                              </svg>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">V1 확정으로 재보정 불필요</span>
                          </div>
                        ) : row.v2 ? (
                          <>
                            <div className={`w-28 h-28 bg-[#1A1A1A] rounded-lg overflow-hidden flex-shrink-0 relative border ${v2ThumbCls}`}>
                              <img
                                src={row.v2.url}
                                alt="v2 재보정"
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => openViewer(rowIdx, "v2")}
                              />
                              <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm px-1 py-0.5 text-[8px] font-mono text-[#FF4D00] uppercase border border-[#FF4D00]/50">v2</div>
                            </div>
                            <div className="flex flex-col py-1 w-full min-w-0">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <StatusBadge status={isReviewingV2 ? "reviewing" : (row.v2.reviewStatus ?? "pending")} />
                                {canDeleteV2 && (
                                  <button
                                    onClick={() => handleDelete(row.v2!.id, row.photo.id, 2)}
                                    disabled={deletingId === row.v2.id}
                                    className="text-[#555] hover:text-[#FF4D00] transition-colors p-1 shrink-0"
                                    title="v2 삭제"
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </div>
                              {!isReviewingV2 && row.v2.comment && (
                                row.v2.reviewStatus === "approved" ? (
                                  <div className="mt-auto bg-[#111] border border-[#222] p-2.5 rounded-lg text-sm text-gray-300 relative">
                                    <div className="absolute -top-2.5 left-3 bg-[#0a0a0a] px-1 text-[10px] text-emerald-500 font-medium">고객 확정</div>
                                    &ldquo;{row.v2.comment}&rdquo;
                                  </div>
                                ) : row.v2.reviewStatus === "revision_requested" ? (
                                  <div className="mt-auto bg-[#111] border border-[#222] border-l-2 border-l-orange-500 p-2.5 rounded-r-lg rounded-l-none text-sm text-gray-300 relative">
                                    <div className="absolute -top-2.5 left-2 bg-[#0a0a0a] px-1 text-[10px] text-orange-500 font-medium">고객 피드백</div>
                                    &ldquo;{row.v2.comment}&rdquo;
                                  </div>
                                ) : null
                              )}
                            </div>
                          </>
                        ) : (
                          <div
                            className="w-full h-28 bg-[#0F0F0F] border-2 border-[#2A2A2A] border-dashed hover:border-[#FF4D00]/50 hover:bg-[#FF4D00]/5 transition-all rounded-lg flex flex-col items-center justify-center cursor-pointer group/upload"
                            onClick={() => router.push(`/photographer/projects/${id}/upload-versions/v2`)}
                          >
                            <div className="w-8 h-8 rounded-full bg-[#1A1A1A] group-hover/upload:bg-[#FF4D00]/20 flex items-center justify-center mb-2 text-gray-400 group-hover/upload:text-[#FF4D00] transition-colors">
                              <UploadIcon />
                            </div>
                            <span className="text-xs text-gray-400 font-medium group-hover/upload:text-[#FF4D00] transition-colors">v2 재보정본 업로드</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
