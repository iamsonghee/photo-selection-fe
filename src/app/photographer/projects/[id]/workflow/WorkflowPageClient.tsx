"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPhotosWithSelections, getProjectById } from "@/lib/db";
import type { Photo, Project, ProjectStatus } from "@/types";
import CompareViewerModal from "@/components/CompareViewerModal";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";
import UploadVersionsPanel, {
  type UploadPanelTarget,
} from "@/components/photographer/UploadVersionsPanel";
import { CustomerInviteShareModal } from "@/components/photographer/CustomerInviteShareModal";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  Clock,
  Upload,
  Trash2,
  SquarePen,
  Lock,
  AlertTriangle,
  Layers,
  MessageSquare,
  Maximize2,
  Send,
  Sparkles,
  Download,
  LayoutGrid,
  List,
  ChevronDown,
} from "lucide-react";
import styles from "./Workflow.module.css";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";
import { compressImageForUpload } from "@/lib/upload-client-compress";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

type VersionInfo = {
  id: string;
  url: string;      // 1500px — 뷰어·라이트박스용
  thumbUrl: string; // 400px — 카드 그리드용 (없으면 url fallback)
  reviewStatus: "approved" | "revision_requested" | null;
  comment: string | null;
  filename: string | null;
};

type WorkflowRow = {
  photo: Photo;
  v1: VersionInfo | null;
  v2: VersionInfo | null;
};

type FilterTab = "all" | "approved" | "revision" | "v1_pending" | "v2_pending";
type StageTab = "original" | "v1" | "v2";

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
const DEADLINE_PRESETS = [
  { label: "5일 뒤",  days: 5  },
  { label: "7일 뒤",  days: 7  },
  { label: "14일 뒤", days: 14 },
  { label: "30일 뒤", days: 30 },
];

type WorkflowConfirmContent = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
};

function WorkflowConfirmModal({
  content,
  onClose,
}: {
  content: WorkflowConfirmContent;
  onClose: () => void;
}) {
  const {
    title,
    description,
    confirmLabel,
    cancelLabel = "취소",
    tone = "default",
    onConfirm,
  } = content;
  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25"
      : "bg-[#FF4D00] hover:bg-[#ff5e1a] text-black shadow-lg shadow-[#FF4D00]/20";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#1a1a1e] bg-[#121215] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-0.5 w-full bg-[#FF4D00]" aria-hidden />
        <div className="p-6 sm:p-7">
          <h2 id="workflow-confirm-title" className="text-lg font-bold tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{description}</p>
          <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-[#27272c] bg-[#0a0a0c] px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white sm:w-auto"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`w-full rounded-xl px-5 py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5 sm:w-auto ${confirmClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultStageForStatus(status: ProjectStatus, allowRevision: boolean): StageTab {
  if (status === "reviewing_v1") return "v1";
  if (allowRevision && (status === "editing_v2" || status === "reviewing_v2" || status === "delivered")) {
    return "v2";
  }
  if (status === "editing") return "v1";
  if (status === "confirmed") return "original";
  return "original";
}

function getFooterNote(status: ProjectStatus): string | null {
  switch (status) {
    case "selecting":    return "고객 셀렉 완료 후 보정 업로드가 가능합니다";
    case "reviewing_v1": return "고객이 V1 보정본을 검토 중입니다";
    case "reviewing_v2": return "고객이 V2 재보정본을 재검토 중입니다";
    case "delivered":    return "납품 완료";
    default:             return null;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({
  status,
  compact = false,
}: {
  status: "approved" | "revision_requested" | "pending" | "reviewing";
  compact?: boolean;
}) {
  if (status === "reviewing") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
        <Clock size={11} />{compact ? "검토중" : "검토 중"}
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        <CheckCircle2 size={11} />확정
      </span>
    );
  }
  if (status === "revision_requested") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20 whitespace-nowrap">
        <AlertTriangle size={11} />{compact ? "재보정" : "재보정 요청"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 whitespace-nowrap">
      <Clock size={11} />{compact ? "대기" : "검토 대기"}
    </span>
  );
}

// ── Stage stepper (정의 유지, 렌더링은 제거됨) ──────────────────────────────

type StepKey = "select" | "v1_upload" | "v1_review" | "v2_upload" | "v2_review" | "delivered";

function StageStepper({
  status,
  allowRevision,
  v1Uploaded,
  v1Total,
  approved,
  revision,
  v2Uploaded,
  v2Total,
}: {
  status: ProjectStatus;
  allowRevision: boolean;
  v1Uploaded: number;
  v1Total: number;
  approved: number;
  revision: number;
  v2Uploaded: number;
  v2Total: number;
}) {
  const steps: { key: StepKey; label: string; sub?: string }[] = [
    { key: "select",      label: "셀렉",      sub: v1Total > 0 ? `${v1Total}장` : undefined },
    { key: "v1_upload",   label: "V1 업로드",  sub: v1Total > 0 ? `${v1Uploaded}/${v1Total}` : undefined },
    { key: "v1_review",   label: "V1 검토",    sub: revision > 0 ? `재보정 ${revision}` : approved > 0 ? `확정 ${approved}` : undefined },
  ];
  if (allowRevision) {
    steps.push({ key: "v2_upload", label: "V2 업로드", sub: v2Total > 0 ? `${v2Uploaded}/${v2Total}` : undefined });
    steps.push({ key: "v2_review", label: "V2 검토" });
  }
  steps.push({ key: "delivered", label: "납품" });

  const stateOf = (key: StepKey): "done" | "active" | "todo" => {
    const order: ProjectStatus[] = ["preparing", "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2", "delivered"];
    const idx = order.indexOf(status);
    const stageRank: Record<StepKey, number> = {
      select:    1, // selecting 진입 시 active, 이후 done
      v1_upload: 2,
      v1_review: 3,
      v2_upload: 4,
      v2_review: 5,
      delivered: 6,
    };
    const statusToRank: Record<ProjectStatus, number> = {
      preparing:    0,
      selecting:    1,
      confirmed:    2,
      editing:      2,
      reviewing_v1: 3,
      editing_v2:   4,
      reviewing_v2: 5,
      delivered:    6,
    };
    const cur = statusToRank[status] ?? 0;
    const my = stageRank[key];
    if (idx < 0) return "todo";
    if (cur > my) return "done";
    if (cur === my) return "active";
    return "todo";
  };

  return (
    <div className="shrink-0 px-4 md:px-8 py-2.5 md:py-3 border-b border-[#1a1a1e] bg-[#0a0a0c]/60">
      <div className="flex items-center justify-between gap-2 max-w-[1600px] mx-auto">
        {steps.map((step, i) => {
          const s = stateOf(step.key);
          const dot =
            s === "done" ? "bg-emerald-500"
            : s === "active" ? "bg-[#FF4D00] shadow-[0_0_8px_rgba(255,77,0,0.6)]"
            : "bg-zinc-700";
          const label =
            s === "done" ? "text-zinc-300"
            : s === "active" ? "text-white"
            : "text-zinc-600";
          const sub =
            s === "active" ? "text-[#FF4D00]" : "text-zinc-500";
          const line =
            s === "done" ? "bg-emerald-500/40" : "bg-[#27272c]";
          return (
            <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${label} truncate`}>
                  {step.label}
                </span>
                {step.sub && (
                  <span className={`text-[10px] font-mono ${sub} hidden md:inline`}>
                    {step.sub}
                  </span>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${line} mx-1`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage cards (Original / V1 / V2) ───────────────────────────────────────

function CardShell({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: "approved" | "revision" | "neutral";
}) {
  const ring =
    highlight === "approved"
      ? "border-emerald-500/30"
      : highlight === "revision"
        ? "border-[#FF4D00]/35"
        : "border-[#1a1a1e]";
  return (
    <div className={`bg-[#0a0a0c]/70 border ${ring} rounded-xl p-2 group hover:border-zinc-600/60 transition-colors`}>
      {children}
    </div>
  );
}

function OriginalCard({
  row,
  index,
  onOpenViewer,
}: {
  row: WorkflowRow;
  index: number;
  onOpenViewer: (idx: number, tab: StageTab) => void;
}) {
  const filename = row.photo.originalFilename ?? `#${row.photo.orderIndex}`;
  return (
    <CardShell>
      <button
        type="button"
        onClick={() => onOpenViewer(index, "original")}
        className="w-full aspect-[4/3] bg-[#080808] rounded-lg overflow-hidden border border-[#1a1a1e] hover:border-zinc-500 transition-colors relative cursor-pointer mb-2"
      >
        {row.photo.url ? (
          <img src={row.photo.url} alt={filename} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <Layers size={24} />
          </div>
        )}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-300 border border-[#333]">
          원본
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Maximize2 size={18} className="text-white" />
        </div>
      </button>
      <div className="text-[11px] font-mono text-zinc-300 truncate mb-1.5" title={filename}>
        {filename}
      </div>
      {row.photo.comment ? (
        <div className="bg-[#0a0a0c] border border-[#27272c] rounded-lg p-2 text-[11px] text-zinc-300 leading-relaxed">
          <div className="text-[9px] text-[#FF4D00] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
            <MessageSquare size={9} />
            고객 코멘트
          </div>
          &ldquo;{row.photo.comment}&rdquo;
        </div>
      ) : (
        <div className="text-[10px] text-zinc-600 italic">코멘트 없음</div>
      )}
    </CardShell>
  );
}

function V1Card({
  row,
  index,
  isReviewingV1,
  v1DisplayStatus,
  canDeleteV1,
  deletingId,
  canUploadV1,
  onOpenViewer,
  onDelete,
  onOpenPanel,
  onReplace,
  replacingId,
  getVersionUrl,
}: {
  row: WorkflowRow;
  index: number;
  isReviewingV1: boolean;
  v1DisplayStatus: "approved" | "revision_requested" | "pending";
  canDeleteV1: boolean;
  deletingId: string | null;
  canUploadV1: boolean;
  onOpenViewer: (idx: number, tab: StageTab) => void;
  onDelete: (versionId: string, photoId: string, version: 1 | 2) => void;
  onOpenPanel: () => void;
  onReplace: (photoId: string, version: 1 | 2, file: File) => void;
  replacingId: string | null;
  getVersionUrl: (url: string, photoId: string, version: 1 | 2) => string;
}) {
  const filename = row.photo.originalFilename ?? `#${row.photo.orderIndex}`;
  const v1 = row.v1;
  const effectiveStatus = v1DisplayStatus;
  const highlight: "approved" | "revision" | "neutral" =
    effectiveStatus === "approved"
      ? "approved"
      : effectiveStatus === "revision_requested"
        ? "revision"
        : "neutral";

  return (
    <CardShell highlight={highlight}>
      {/* Mini original */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => onOpenViewer(index, "original")}
          className="w-8 h-8 rounded-md bg-[#080808] border border-[#1a1a1e] overflow-hidden shrink-0 hover:border-zinc-500 transition-colors"
          title="원본 보기"
        >
          {row.photo.url ? (
            <img src={row.photo.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : null}
        </button>
        <span className="text-[10px] font-mono text-zinc-400 truncate" title={filename}>
          {filename}
        </span>
      </div>

      {/* Main V1 */}
      {v1 ? (
        <div className="relative w-full aspect-[4/3] mb-2">
          <button
            type="button"
            onClick={() => onOpenViewer(index, "v1")}
            className="w-full h-full bg-[#080808] rounded-lg overflow-hidden relative cursor-pointer hover:opacity-95 transition-opacity border border-[#1a1a1e]"
          >
            <img
              src={getVersionUrl(v1.thumbUrl, row.photo.id, 1)}
              alt="V1"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-300 border border-[#333]">
              보정
            </div>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 size={18} className="text-white" />
            </div>
          </button>
          {replacingId === row.photo.id && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg pointer-events-none">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenPanel}
          disabled={!canUploadV1}
          className={`w-full aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 mb-2 transition-all ${
            canUploadV1
              ? "border-[#27272c] bg-[#080808] hover:border-[#FF4D00]/60 hover:bg-[#FF4D00]/5 cursor-pointer"
              : "border-[#1a1a1e] bg-[#080808] opacity-50 cursor-not-allowed"
          }`}
        >
          <Upload size={20} className={canUploadV1 ? "text-zinc-500" : "text-zinc-700"} />
          <span className="text-[11px] text-zinc-500 font-medium">
            {canUploadV1 ? "V1 업로드" : "업로드 대기"}
          </span>
        </button>
      )}

      {/* Status row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        {v1 ? (
          <StatusBadge
            status={
              isReviewingV1
                ? "reviewing"
                : (effectiveStatus as "approved" | "revision_requested" | "pending")
            }
          />
        ) : (
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
            미업로드
          </span>
        )}
        {v1 && (canUploadV1 || canDeleteV1) && (
          <div className="flex items-center gap-0.5">
            {canUploadV1 && (
              <label
                className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/5 transition-colors cursor-pointer ${
                  replacingId ? "pointer-events-none opacity-40" : ""
                }`}
                title="V1 교체"
              >
                <SquarePen size={13} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={replacingId !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onReplace(row.photo.id, 1, f);
                  }}
                />
              </label>
            )}
            {canDeleteV1 && (
              <button
                type="button"
                onClick={() => onDelete(v1.id, row.photo.id, 1)}
                disabled={deletingId === v1.id || replacingId === row.photo.id}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-white/5 transition-colors disabled:opacity-40"
                title="V1 삭제"
              >
                {deletingId === v1.id ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Comment */}
      {v1?.comment && !isReviewingV1 && (
        <div
          className={`bg-[#0a0a0c] border rounded-lg p-2 text-[11px] text-zinc-300 leading-relaxed ${
            v1.reviewStatus === "revision_requested"
              ? "border-[#FF4D00]/30 border-l-2 border-l-[#FF4D00]"
              : "border-[#27272c]"
          }`}
        >
          <div
            className={`text-[9px] font-semibold uppercase tracking-wide mb-1 ${
              v1.reviewStatus === "revision_requested"
                ? "text-[#FF4D00]"
                : v1.reviewStatus === "approved"
                  ? "text-emerald-400"
                  : "text-zinc-500"
            }`}
          >
            {v1.reviewStatus === "revision_requested"
              ? "재보정 요청"
              : v1.reviewStatus === "approved"
                ? "고객 확정"
                : "고객 코멘트"}
          </div>
          &ldquo;{v1.comment}&rdquo;
        </div>
      )}
    </CardShell>
  );
}

function V2Card({
  row,
  index,
  isReviewingV2,
  effectiveV1Status,
  v2Dimmed,
  canDeleteV2,
  deletingId,
  canUploadV2,
  onOpenViewer,
  onDelete,
  onOpenPanel,
  onReplace,
  replacingId,
  getVersionUrl,
}: {
  row: WorkflowRow;
  index: number;
  isReviewingV2: boolean;
  effectiveV1Status: "approved" | "revision_requested" | "pending";
  v2Dimmed: boolean;
  canDeleteV2: boolean;
  deletingId: string | null;
  canUploadV2: boolean;
  onOpenViewer: (idx: number, tab: StageTab) => void;
  onDelete: (versionId: string, photoId: string, version: 1 | 2) => void;
  onOpenPanel: () => void;
  onReplace: (photoId: string, version: 1 | 2, file: File) => void;
  replacingId: string | null;
  getVersionUrl: (url: string, photoId: string, version: 1 | 2) => string;
}) {
  const filename = row.photo.originalFilename ?? `#${row.photo.orderIndex}`;
  const v1 = row.v1;
  const v2 = row.v2;
  const isRevisionPhoto = effectiveV1Status === "revision_requested";

  const highlight: "approved" | "revision" | "neutral" =
    v2?.reviewStatus === "approved"
      ? "approved"
      : v2?.reviewStatus === "revision_requested"
        ? "revision"
        : "neutral";

  return (
    <CardShell highlight={highlight}>
      {/* Mini original + v1 */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => onOpenViewer(index, "original")}
          className="w-8 h-8 rounded-md bg-[#080808] border border-[#1a1a1e] overflow-hidden shrink-0 hover:border-zinc-500 transition-colors"
          title="원본 보기"
        >
          {row.photo.url ? (
            <img src={row.photo.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : null}
        </button>
        {v1 ? (
          <button
            type="button"
            onClick={() => onOpenViewer(index, "v1")}
            className="w-8 h-8 rounded-md bg-[#080808] border border-[#FF4D00]/30 overflow-hidden shrink-0 hover:border-[#FF4D00] transition-colors"
            title="V1 보기"
          >
            <img
              src={getVersionUrl(v1.thumbUrl, row.photo.id, 1)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </button>
        ) : null}
        <span className="text-[10px] font-mono text-zinc-400 truncate" title={filename}>
          {filename}
        </span>
      </div>

      {/* Main V2 */}
      {v2Dimmed ? (
        <div className="w-full aspect-[4/3] rounded-lg border border-[#1a1a1e] bg-[#080808] flex flex-col items-center justify-center gap-1 mb-2 opacity-50">
          <Lock size={18} className="text-zinc-600" />
          <span className="text-[10px] text-zinc-600 text-center px-3">
            V1 검토 완료 후 업로드 가능
          </span>
        </div>
      ) : effectiveV1Status === "approved" ? (
        <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-[#1a1a1e] bg-[#080808] flex flex-col items-center justify-center gap-1 mb-2 opacity-40">
          <CheckCircle2 size={18} className="text-emerald-500" />
          <span className="text-[10px] text-zinc-500 text-center px-3">
            V1 확정 — 재보정 불필요
          </span>
        </div>
      ) : effectiveV1Status === "pending" ? (
        <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-amber-500/30 bg-[#080808] flex flex-col items-center justify-center gap-1 mb-2 opacity-80 px-3">
          <AlertTriangle size={18} className="text-amber-400" />
          <span className="text-[10px] text-amber-300 text-center font-medium">
            V1 검토 결과 없음
          </span>
          <span className="text-[9px] text-zinc-500 text-center">
            페이지를 새로고침 해주세요
          </span>
        </div>
      ) : v2 ? (
        <div className="relative w-full aspect-[4/3] mb-2">
          <button
            type="button"
            onClick={() => onOpenViewer(index, "v2")}
            className="w-full h-full bg-[#080808] rounded-lg overflow-hidden relative cursor-pointer hover:opacity-95 transition-opacity border border-[#1a1a1e]"
          >
            <img
              src={getVersionUrl(v2.thumbUrl, row.photo.id, 2)}
              alt="V2"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-[#FF4D00] border border-[#FF4D00]/40">
              재보정
            </div>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 size={18} className="text-white" />
            </div>
          </button>
          {replacingId === row.photo.id && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg pointer-events-none">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenPanel}
          disabled={!canUploadV2}
          className={`w-full aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 mb-2 transition-all ${
            canUploadV2
              ? "border-[#27272c] bg-[#080808] hover:border-[#FF4D00]/60 hover:bg-[#FF4D00]/5 cursor-pointer"
              : "border-[#1a1a1e] bg-[#080808] opacity-50 cursor-not-allowed"
          }`}
        >
          <Upload size={20} className={canUploadV2 ? "text-zinc-500" : "text-zinc-700"} />
          <span className="text-[11px] text-zinc-500 font-medium">
            {canUploadV2 ? "V2 업로드" : "업로드 대기"}
          </span>
        </button>
      )}

      {/* Status row */}
      {isRevisionPhoto && !v2Dimmed && (
        <div className="flex items-center justify-between gap-2 mb-2">
          {v2 ? (
            <StatusBadge
              status={
                isReviewingV2
                  ? "reviewing"
                  : (v2.reviewStatus ?? "pending") as "approved" | "revision_requested" | "pending"
              }
            />
          ) : (
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
              미업로드
            </span>
          )}
          {v2 && (canUploadV2 || canDeleteV2) && (
            <div className="flex items-center gap-0.5">
              {canUploadV2 && (
                <label
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/5 transition-colors cursor-pointer ${
                    replacingId ? "pointer-events-none opacity-40" : ""
                  }`}
                  title="V2 교체"
                >
                  <SquarePen size={13} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={replacingId !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onReplace(row.photo.id, 2, f);
                    }}
                  />
                </label>
              )}
              {canDeleteV2 && (
                <button
                  type="button"
                  onClick={() => onDelete(v2.id, row.photo.id, 2)}
                  disabled={deletingId === v2.id || replacingId === row.photo.id}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-white/5 transition-colors disabled:opacity-40"
                  title="V2 삭제"
                >
                  {deletingId === v2.id ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Comment */}
      {v2?.comment && !isReviewingV2 && (
        <div
          className={`bg-[#0a0a0c] border rounded-lg p-2 text-[11px] text-zinc-300 leading-relaxed ${
            v2.reviewStatus === "revision_requested"
              ? "border-[#FF4D00]/30 border-l-2 border-l-[#FF4D00]"
              : "border-[#27272c]"
          }`}
        >
          <div
            className={`text-[9px] font-semibold uppercase tracking-wide mb-1 ${
              v2.reviewStatus === "approved"
                ? "text-emerald-400"
                : v2.reviewStatus === "revision_requested"
                  ? "text-[#FF4D00]"
                  : "text-zinc-500"
            }`}
          >
            {v2.reviewStatus === "approved"
              ? "고객 확정"
              : v2.reviewStatus === "revision_requested"
                ? "재보정 요청"
                : "고객 코멘트"}
          </div>
          &ldquo;{v2.comment}&rdquo;
        </div>
      )}
    </CardShell>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function WorkflowPageClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [project, setProject]       = useState<Project | null>(null);
  const [rows, setRows]             = useState<WorkflowRow[]>([]);
  const [existingVersionCount, setExistingVersionCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>("all");
  const [viewMode, setViewMode]     = useState<"gallery" | "list">("gallery");
  // 첫 렌더에서 ?stage 쿼리를 즉시 반영 — V1 → 원본으로 바뀌는 깜빡임 방지
  const [stageTab, setStageTab]     = useState<StageTab>(() => {
    const raw = searchParams.get("stage");
    return raw === "original" || raw === "v1" || raw === "v2" ? (raw as StageTab) : "v1";
  });
  const [stageTabAuto, setStageTabAuto] = useState(() => {
    const raw = searchParams.get("stage");
    return !(raw === "original" || raw === "v1" || raw === "v2");
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx]   = useState(0);
  const [viewerTab, setViewerTab]   = useState<"original" | "v1" | "v2">("original");
  const [panelVersion, setPanelVersion] = useState<1 | 2 | null>(null);
  const [startingEditing, setStartingEditing] = useState(false);
  const [startingReview, setStartingReview] = useState<1 | 2 | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<WorkflowConfirmContent | null>(null);
  const [reviewDeadlineModal, setReviewDeadlineModal] = useState<
    { v: 1 | 2; dateInput: string; stage: "setup" | "share" } | null
  >(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [versionBust, setVersionBust] = useState<Record<string, number>>({});
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const getVersionUrl = useCallback(
    (url: string, photoId: string, version: 1 | 2) => {
      const bust = versionBust[`${photoId}:${version}`];
      if (!bust) return url;
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}t=${bust}`;
    },
    [versionBust],
  );

  const loadData = useCallback(async () => {
      try {
        setLoading(true);
        const [projectData, photosResult, versionsRes] = await Promise.all([
          getProjectById(id),
          getPhotosWithSelections(id),
          fetch(`/api/photographer/projects/${id}/versions`).then((r) => r.json()),
        ]);

        setProject(projectData);

        const selectedPhotos = photosResult.photos.filter((p) =>
          photosResult.selectedIds.has(p.id)
        );

        const v1Map = new Map<string, VersionInfo>();
        const v2Map = new Map<string, VersionInfo>();
      const distinctVersions = new Set<number>();
        for (const v of versionsRes.versions ?? []) {
          const info: VersionInfo = {
            id: v.id,
            url: v.r2_url,
            thumbUrl: v.r2_thumb_url ?? v.r2_url,
            reviewStatus: v.review_status ?? null,
            comment: v.customer_comment ?? null,
            filename: v.version_filename ?? null,
          };
        if (typeof v.version === "number") distinctVersions.add(v.version);
          if (v.version === 1) v1Map.set(v.photo_id, info);
          else if (v.version === 2) v2Map.set(v.photo_id, info);
        }

      setExistingVersionCount(distinctVersions.size);
        setRows(
          selectedPhotos.map((photo) => ({
            photo,
            v1: v1Map.get(photo.id) ?? null,
            v2: v2Map.get(photo.id) ?? null,
          }))
        );
      } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
      setLoading(false);
      }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadData();
    })();
    return () => { cancelled = true; };
  }, [loadData]);

  // ?stage 쿼리 정리 + v2 폴백 + status 기반 자동 탭. 초기 stageTab은 useState lazy init에서 처리됨
  useEffect(() => {
    const raw = searchParams.get("stage");
    const qStage =
      raw === "original" || raw === "v1" || raw === "v2" ? (raw as StageTab) : null;

    // 쿼리가 있었으면 한 번 적용된 뒤 주소만 청소
    if (qStage) {
      router.replace(`/photographer/projects/${id}/workflow`, { scroll: false });
    }

    if (!project) return;
    const v2Ok = project.maxRevisionCount > 0;

    // ?stage=v2 인데 재보정 없는 프로젝트면 폴백
    if (qStage === "v2" && !v2Ok) {
      setStageTabAuto(true);
      setStageTab(defaultStageForStatus(project.status, v2Ok));
      return;
    }

    if (!stageTabAuto) return;
    setStageTab(defaultStageForStatus(project.status, v2Ok));
  }, [project, stageTabAuto, searchParams, id, router]);

  useEffect(() => {
    if (!confirmDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDialog]);

  const counts = useMemo(() => {
    const delivered = project?.status === "delivered";
    const effV1 = (s: string | null) =>
      s === "approved" || s === "revision_requested" ? s : delivered ? "approved" : "pending";
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
    const delivered = project?.status === "delivered";
    const effV1 = (s: string | null) =>
      s === "approved" || s === "revision_requested" ? s : delivered ? "approved" : "pending";
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
      case "v2_pending":
        return rows.filter(
          (r) =>
            effV1(r.v1?.reviewStatus ?? null) === "revision_requested" &&
            r.v2 === null,
        );
      default:           return rows;
    }
  }, [rows, filter, project?.status]);

  // 필터된 행의 photoId → viewer 인덱스 매핑 (전체 rows 렌더 시 올바른 뷰어 인덱스 전달용)
  const filteredIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((row, i) => map.set(row.photo.id, i));
    return map;
  }, [filteredRows]);

  const viewerItems = useMemo(() =>
    filteredRows.map((row) => ({
      original: {
        url: row.photo.previewUrl ?? row.photo.url,
        filename: row.photo.originalFilename ?? `#${row.photo.orderIndex}`,
      },
      v1: row.v1 ? { url: getVersionUrl(row.v1.url, row.photo.id, 1), filename: "보정본 v1" } : undefined,
      v2: row.v2 ? { url: getVersionUrl(row.v2.url, row.photo.id, 2), filename: "보정본 v2" } : undefined,
    })),
  [filteredRows, getVersionUrl]);

  const handleDownloadReview = useCallback((withComment: boolean) => {
    const isOriginal = stageTab === "original";
    const version = stageTab === "v2" ? 2 : 1;
    const header = isOriginal
      ? withComment ? ["번호", "파일명", "고객 코멘트"] : ["번호", "파일명"]
      : withComment ? ["번호", "파일명", "보정본 파일명", "상태", "고객 코멘트"] : ["번호", "파일명", "보정본 파일명", "상태"];
    const rowData = rows.map((row, i) => {
      const filename = row.photo.originalFilename ?? `FRAME_${String(row.photo.orderIndex).padStart(4, "0")}`;
      if (isOriginal) {
        return withComment
          ? [String(i + 1), filename, row.photo.comment ?? ""]
          : [String(i + 1), filename];
      }
      const ver = version === 2 ? row.v2 : row.v1;
      const status =
        ver?.reviewStatus === "approved" ? "확정"
        : ver?.reviewStatus === "revision_requested" ? "재보정 요청"
        : "미검토";
      const versionFilename = ver?.filename ?? "";
      return withComment
        ? [String(i + 1), filename, versionFilename, status, ver?.comment ?? ""]
        : [String(i + 1), filename, versionFilename, status];
    });
    const csv = [header, ...rowData]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isOriginal
      ? `${project?.name ?? "project"}_원본목록.csv`
      : `${project?.name ?? "review"}_v${version}_검토결과.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [rows, stageTab, project?.name]);

  function openViewer(idx: number, tab: StageTab) {
    setViewerIdx(idx);
    setViewerTab(tab);
    setViewerOpen(true);
  }

  function handleDelete(versionId: string, photoId: string, version: 1 | 2) {
    setConfirmDialog({
      title: `V${version} 보정본 삭제`,
      description: `V${version} 보정본을 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      cancelLabel: "취소",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        void executeDeleteVersion(versionId, photoId, version);
      },
    });
  }

  async function executeDeleteVersion(versionId: string, photoId: string, version: 1 | 2) {
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

  async function replaceVersion(photoId: string, version: 1 | 2, file: File) {
    if (replacingId) return;
    if (panelVersion !== null) return;
    setReplacingId(photoId);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");

      const compressed = await compressImageForUpload(file);
      const form = new FormData();
      form.append("project_id", id);
      form.append("version", String(version));
      form.append("photo_ids", photoId);
      form.append("files", compressed, compressed.name);

      const res = await fetch(`${API_BASE}/api/upload/versions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string | Array<{ msg?: string; message?: string }>;
      };
      if (!res.ok) {
        const msg =
          data.error ??
          (typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail[0]?.msg ?? data.detail[0]?.message
              : null);
        throw new Error(msg ?? "교체 실패");
      }
      // 교체된 버전 URL 캐시 버스트 + reviewStatus null 초기화 (version_reviews 백엔드에서 삭제됨)
      setVersionBust((prev) => ({ ...prev, [`${photoId}:${version}`]: Date.now() }));
      setRows((prev) =>
        prev.map((row) => {
          if (row.photo.id !== photoId) return row;
          if (version === 2 && row.v2) return { ...row, v2: { ...row.v2, reviewStatus: null, comment: null } };
          if (version === 1 && row.v1) return { ...row, v1: { ...row.v1, reviewStatus: null, comment: null } };
          return row;
        })
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "교체 실패");
    } finally {
      setReplacingId(null);
    }
  }

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader variant="full" />;
  }

  if (error || !project) {
    return (
      <div className="h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
        <span className="text-[#FF4D00] text-sm">{error ?? "프로젝트를 찾을 수 없습니다."}</span>
        <button
          onClick={() => router.push(`/photographer/projects`)}
          className="text-sm text-zinc-400 border border-[#27272c] px-4 py-2 rounded-xl hover:text-white hover:border-zinc-500 transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const inV2Phase     = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const showV2Tab     = project.maxRevisionCount > 0;
  const v2Dimmed      = project.maxRevisionCount > 0 && !inV2Phase;
  const canDeleteV1   = project.status === "editing";
  const canDeleteV2   = project.status === "editing_v2";
  const isSelecting   = project.status === "selecting";
  const isConfirmed   = project.status === "confirmed";
  const isEditing     = project.status === "editing";
  const isEditingV2   = project.status === "editing_v2";
  const isReviewingV1 = project.status === "reviewing_v1";
  const isReviewingV2 = project.status === "reviewing_v2";
  // confirmed 상태에서는 '보정 시작' 후에만 업로드 가능 (BE 가드: editing → reviewing_v1)
  const canUploadV1   = ["editing", "reviewing_v1"].includes(project.status);
  const canUploadV2   = project.status === "editing_v2" || project.status === "reviewing_v2";

  /** delivered + 리뷰 행 없음: 구버전 일괄 제출 등. 그 외 단계에서 null은 확정으로 보지 않는다. */
  const effectiveV1Status = (s: string | null): "approved" | "revision_requested" | "pending" =>
    s === "approved" || s === "revision_requested"
      ? s
      : project.status === "delivered"
        ? "approved"
        : "pending";

  const v2PendingCount = rows.filter(
    (r) => effectiveV1Status(r.v1?.reviewStatus ?? null) === "revision_requested" && r.v2 === null
  ).length;
  const v2Total = rows.filter(
    (r) => effectiveV1Status(r.v1?.reviewStatus ?? null) === "revision_requested"
  ).length;

  // editing_v2 재진입 시 아직 교체 안 된 revision_requested V2 사진 수
  const v2RevisionPending = rows.filter((r) => r.v2?.reviewStatus === "revision_requested").length;

  // 고객 검토 시작 가능 여부: editing/editing_v2이면서 매핑이 모두 준비된 경우
  const canStartV1Review = isEditing && counts.total > 0 && counts.v1Uploaded === counts.total;
  // V2: 업로드 완료 + 재보정 요청 사진이 모두 교체됐을 때만 활성화
  const canStartV2Review = isEditingV2 && v2Total > 0 && counts.v2Uploaded === v2Total && v2RevisionPending === 0;

  const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: counts.total },
    ...(stageTab === "v1" && !isReviewingV1
      ? [
          { key: "approved" as FilterTab, label: "확정", count: counts.approved },
          { key: "revision" as FilterTab, label: "재보정 요청", count: counts.revision },
        ]
      : []),
    ...(stageTab === "v1"
      ? [{ key: "v1_pending" as FilterTab, label: "V1 미업로드", count: counts.total - counts.v1Uploaded }]
      : []),
    ...(stageTab === "v2" && showV2Tab
      ? [{ key: "v2_pending" as FilterTab, label: "V2 미업로드", count: v2PendingCount }]
      : []),
  ];

  // V1 panel targets: 모든 셀렉 사진 (이미 V1이 있는 것도 재업로드 가능 — buildVersionMapping 이 처리)
  const v1Targets: UploadPanelTarget[] = rows.map((r) => ({
    id: r.photo.id,
    photo: r.photo,
    filename: r.photo.originalFilename ?? `#${r.photo.orderIndex}`,
    comment: r.photo.comment ?? null,
    serverRetouchUrl: r.v1?.url ?? null,
  }));

  // V2 panel targets: revision_requested 만
  const v2Targets: UploadPanelTarget[] = rows
    .filter((r) => effectiveV1Status(r.v1?.reviewStatus ?? null) === "revision_requested")
    .map((r) => ({
      id: r.photo.id,
      photo: r.photo,
      filename: r.photo.originalFilename ?? `#${r.photo.orderIndex}`,
      comment: r.v1?.comment ?? null,
      v1Url: r.v1?.url ?? null,
      serverRetouchUrl: r.v2?.url ?? null,
    }));

  const footerNote = getFooterNote(project.status);

  function setStageTabManual(t: StageTab) {
    setStageTabAuto(false);
    setStageTab(t);
    setFilter("all");
  }

  function openPanel(v: 1 | 2) {
    setPanelVersion(v);
  }

  async function handleDelivered(uploadedVersion: 1 | 2) {
    setPanelVersion(null);
    await loadData();
    // 패널은 V2인데 그리드가 V1 탭에 남는 경우(예: 이전에 V1 탭을 수동 선택) 방지
    setStageTab(uploadedVersion === 2 ? "v2" : "v1");
  }

  /** confirmed → editing 전환 (보정 시작) */
  function handleStartEditing() {
    if (!project || project.status !== "confirmed") return;
    setConfirmDialog({
      title: "보정 시작",
      description: "보정을 시작할까요? 이후 고객은 셀렉을 직접 변경할 수 없습니다.",
      confirmLabel: "보정 시작",
      onConfirm: () => {
        setConfirmDialog(null);
        void runStartEditing();
      },
    });
  }

  async function runStartEditing() {
    if (!project || project.status !== "confirmed") return;
    setStartingEditing(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      }
      // 로그 기록(실패해도 무시)
      fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "editing" }),
      }).catch(() => {});
      // status만 변경 — rows(사진/보정본)는 그대로이므로 loadData() 불필요
      setProject((prev) => prev ? { ...prev, status: "editing" } : null);
      setStageTab("v1");
      setStageTabAuto(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "보정 시작 실패");
    } finally {
      setStartingEditing(false);
    }
  }

  /** editing → reviewing_v1 또는 editing_v2 → reviewing_v2 (고객 검토 시작) */
  function handleStartCustomerReview(v: 1 | 2) {
    if (!project) return;
    const expectedStatus = v === 1 ? "editing" : "editing_v2";
    if (project.status !== expectedStatus) return;
    setReviewDeadlineModal({ v, dateInput: "", stage: "setup" });
  }

  async function runStartCustomerReview(v: 1 | 2, reviewDeadline?: string) {
    if (!project) return;
    const expectedStatus = v === 1 ? "editing" : "editing_v2";
    if (project.status !== expectedStatus) return;
    const nextStatus = v === 1 ? "reviewing_v1" : "reviewing_v2";
    setStartingReview(v);
    try {
      if (reviewDeadline) {
        const ymd = normalizeReviewDeadlineYmd(reviewDeadline);
        if (ymd) {
          await fetch(`/api/photographer/projects/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ review_deadline: ymd }),
          });
        }
      }
      const res = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      }
      // status만 변경 — rows(사진/보정본)는 그대로이므로 loadData() 불필요
      setProject((prev) => prev ? { ...prev, status: nextStatus } : null);
      // 성공 시 같은 모달을 공유 단계로 전환 (작가가 직접 링크 공유)
      setReviewDeadlineModal((m) => (m ? { ...m, stage: "share" } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : "고객 검토 시작 실패");
    } finally {
      setStartingReview(null);
    }
  }

  // ── Invite link share helpers (검토 단계 전환 후 작가가 직접 공유) ──────────
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${project?.accessToken ?? ""}`
      : `/c/${project?.accessToken ?? ""}`;

  function closeReviewDeadlineModal() {
    setReviewDeadlineModal(null);
  }

  // 본문 그리드용 카드 인덱스를 viewer 인덱스에 맞추기 위해 filteredRows 사용
  const cardCols =
    "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5";

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-[#0a0a0c] text-white"
      style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}
    >
      {/* ── Header ── */}
      <PhotographerPageHeader
        crumbs={[
          { label: "프로젝트", href: "/photographer/projects" },
          { label: project.name, href: `/photographer/projects/${id}` },
          { label: "보정 관리" },
        ]}
        title="보정 관리"
        stats={
          isSelecting
            ? undefined
            : [
                { label: "셀렉",    value: counts.total },
                { label: "업로드",  value: `${counts.v1Uploaded}/${counts.total}` },
                { label: "확정",    value: counts.approved, accent: true },
                ...(showV2Tab ? [{ label: "재보정", value: counts.revision }] : []),
              ]
        }
      />


      {/* ── Stage tabs ── */}
      {!isSelecting && (
        <div className="shrink-0 px-4 md:px-8 py-2.5 md:py-3 border-b border-[#1a1a1e] bg-[#121215]/50 flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex items-end gap-1 -mb-px">
            {[
              { key: "original" as StageTab, label: "원본", disabled: false },
              { key: "v1" as StageTab,        label: "V1 보정본", disabled: false },
              ...(showV2Tab
                ? [{ key: "v2" as StageTab, label: "V2 재보정본", disabled: v2Dimmed && !inV2Phase }]
                : []),
            ].map((tab) => {
              const isActive = stageTab === tab.key;
              return (
              <button
                  key={tab.key}
                  onClick={() => !tab.disabled && setStageTabManual(tab.key)}
                  disabled={tab.disabled}
                  className={`relative px-4 py-2.5 text-[13px] font-semibold tracking-wide transition-colors ${
                    isActive
                      ? "text-white"
                      : tab.disabled
                        ? "text-zinc-700 cursor-not-allowed"
                        : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                  {isActive && !tab.disabled && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-2 right-2 -bottom-[1px] h-[2px] bg-[#FF4D00] rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter chips for current stage (PC only) */}
          {FILTER_TABS.length > 1 && (
            <div className="hidden md:flex items-center gap-1.5">
              <div className="w-px h-4 bg-[#27272c] shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TABS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  filter === key
                        ? "border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00]"
                        : "border-[#27272c] bg-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {label}
                    <span className={`text-[10px] font-mono ${filter === key ? "text-[#FF4D00]/70" : "text-zinc-600"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
            </div>
          )}

          {/* progress summary */}
          {stageTab === "v1" && !isReviewingV1 && (
            <div className="ml-auto hidden md:flex items-center gap-2 text-[11px] font-mono text-zinc-500 bg-[#0a0a0c] border border-[#1a1a1e] rounded-xl px-3 py-1.5">
              <span className="text-white font-semibold">{counts.v1Uploaded}</span>
              <span>/</span>
              <span>{counts.total}</span>
              <span className="text-zinc-600 mx-1">업로드</span>
              <span className="w-px h-3 bg-[#27272c]" />
              <span className="text-emerald-400 font-semibold">{counts.approved}</span>
              <span className="text-zinc-600">확정</span>
              {counts.revision > 0 && (
                <>
                  <span className="w-px h-3 bg-[#27272c]" />
                  <span className="text-[#FF4D00] font-semibold">{counts.revision}</span>
                  <span className="text-zinc-600">재보정</span>
                </>
              )}
            </div>
          )}
          {stageTab === "v2" && (
            <div className="ml-auto hidden md:flex items-center gap-2 text-[11px] font-mono text-zinc-500 bg-[#0a0a0c] border border-[#1a1a1e] rounded-xl px-3 py-1.5">
              <span className="text-white font-semibold">{counts.v2Uploaded}</span>
              <span>/</span>
              <span>{v2Total}</span>
              <span className="text-zinc-600 mx-1">V2 업로드</span>
            </div>
          )}

          {/* 다운로드 + 뷰 토글 */}
          <div className={`${stageTab === "v2" || (stageTab === "v1" && !isReviewingV1) ? "" : "ml-auto"} flex items-center gap-2 shrink-0`}>
            {rows.length > 0 && (
              <div ref={exportMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[#27272c] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                >
                  <Download size={12} />
                  내보내기
                  <ChevronDown size={11} className={`transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
                </button>
                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-[#121215] border border-[#27272c] rounded-xl shadow-xl overflow-hidden min-w-[148px]">
                      <button
                        type="button"
                        onClick={() => handleDownloadReview(false)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-zinc-300 hover:bg-[#1a1a1e] hover:text-white transition-colors text-left"
                      >
                        <Download size={11} className="text-zinc-500 shrink-0" />
                        파일명만
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadReview(true)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-zinc-300 hover:bg-[#1a1a1e] hover:text-white transition-colors text-left"
                      >
                        <Download size={11} className="text-[#FF4D00] shrink-0" />
                        코멘트 포함
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center border border-[#27272c] rounded-lg overflow-hidden">
              {([["gallery", <LayoutGrid key="g" size={13} />] as const, ["list", <List key="l" size={13} />] as const]).map(([mode, icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode as "gallery" | "list")}
                  className={`px-2.5 py-1.5 transition-colors ${viewMode === mode ? "bg-[#FF4D00]/15 text-[#FF4D00]" : "bg-transparent text-zinc-500 hover:text-zinc-300"}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Selecting: waiting screen ── */}
      {isSelecting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl border border-[#1a1a1e] bg-[#121215] flex items-center justify-center text-zinc-600">
            <Clock size={28} strokeWidth={1.5} />
          </div>
          <div className="text-center flex flex-col gap-2">
            <p className="text-white font-semibold">고객이 셀렉 중입니다</p>
            <p className="text-zinc-500 text-sm">고객 셀렉 완료 후 보정 업로드가 가능합니다</p>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {!isSelecting && (
        <div className={`flex-1 overflow-y-auto ${styles.scrollArea}`}>
          <div className="max-w-[1600px] mx-auto px-3 py-3 md:px-8 md:py-6 flex flex-col gap-3 md:gap-4">
            {isConfirmed && (
              <div className="rounded-2xl border border-[#1a1a1e] bg-[#121215]/50 px-5 py-3 flex items-start gap-2.5">
                <div className="text-[#FF4D00] mt-0.5 shrink-0">
                  <Sparkles size={13} />
              </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  고객이 셀렉을 확정했습니다.
                  <span className="text-white font-semibold"> 하단의 보정 시작</span> 버튼을 눌러 V1 보정본 업로드를 시작하세요.
                </p>
                </div>
            )}
            {(isEditing || isEditingV2) && (
              <div className="rounded-2xl border border-[#1a1a1e] bg-[#121215]/50 px-5 py-3 flex items-start gap-2.5">
                <div className="text-zinc-500 mt-0.5">
                  <Send size={13} />
              </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  업로드만으로 고객 화면이 자동 공개되지 않습니다. 매핑을 확인한 다음
                  <span className="text-[#FF4D00] font-semibold"> &lsquo;고객에게 검토 보내기&rsquo;</span>
                  를 눌러 공유하세요.
                </p>
                  </div>
            )}
            {isEditingV2 && v2RevisionPending > 0 && (
              <div className="rounded-2xl border border-[#FF4D00]/30 bg-[#FF4D00]/5 px-5 py-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FF4D00]/15 border border-[#FF4D00]/40 flex items-center justify-center text-[#FF4D00] shrink-0">
                  <Upload size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold">재보정본 업로드가 필요합니다</p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    고객이 재보정을 요청한 사진이 <span className="text-[#FF4D00] font-semibold">{v2RevisionPending}장</span> 있습니다.
                    V2 탭에서 해당 사진을 교체한 뒤 검토 요청을 보내주세요.
                  </p>
                </div>
              </div>
            )}
            {isEditingV2 && rows.length > 0 && rows.every((r) => !r.v1?.reviewStatus) && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <AlertTriangle size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-200 font-semibold">고객 V1 검토 결과를 불러오지 못했습니다.</p>
                  <p className="text-xs text-amber-200/70 mt-0.5">
                    페이지를 새로고침 해주세요. 새로고침 후에도 동일하면 관리자에게 알려주세요.
                  </p>
            </div>
              </div>
            )}
            {filteredRows.length === 0 ? (
              <div className="bg-[#121215]/50 border border-[#1a1a1e] rounded-2xl py-16 flex flex-col items-center justify-center gap-3">
                <Layers size={28} className="text-zinc-700" />
                <p className="text-zinc-500 text-sm">해당하는 사진이 없습니다.</p>
              </div>
            ) : viewMode === "list" ? (
              /* ── 파일 리스트 뷰 ── */
              <div className="border border-[#1a1a1e] rounded-xl overflow-hidden">
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: "'Space Mono','Noto Sans KR',monospace" }}>
                  <colgroup>
                    <col style={{ width: 36 }} />
                    <col style={{ width: "30%" }} />
                    {stageTab !== "original" && <col />}
                    {stageTab !== "original" && <col style={{ width: 84 }} />}
                    <col />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a1a1e", background: "#0a0a0c" }}>
                      <th style={{ padding: "7px 8px", fontSize: 10, color: "#5c5c5c", textAlign: "center", fontWeight: 600 }}>#</th>
                      <th style={{ padding: "7px 10px", fontSize: 10, color: "#5c5c5c", textAlign: "left", fontWeight: 600 }}>파일명</th>
                      {stageTab !== "original" && <th style={{ padding: "7px 10px", fontSize: 10, color: "#5c5c5c", textAlign: "left", fontWeight: 600 }}>보정본 파일명</th>}
                      {stageTab !== "original" && <th style={{ padding: "7px 8px", fontSize: 10, color: "#5c5c5c", textAlign: "center", fontWeight: 600 }}>상태</th>}
                      <th style={{ padding: "7px 10px", fontSize: 10, color: "#5c5c5c", textAlign: "left", fontWeight: 600 }}>고객 코멘트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const visIdx = filteredIndexMap.get(row.photo.id);
                      if (visIdx === undefined) return null;
                      const ver = stageTab === "v2"
                        ? (row.v2 ?? (row.v1?.reviewStatus === "approved" ? row.v1 : null))
                        : stageTab === "v1" ? row.v1 : null;
                      const filename = row.photo.originalFilename ?? `FRAME_${String(row.photo.orderIndex).padStart(4, "0")}`;
                      return (
                        <tr
                          key={row.photo.id}
                          onClick={() => openViewer(visIdx, stageTab)}
                          style={{ borderBottom: "1px solid #1a1a1e", cursor: "pointer", transition: "background 0.15s" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,77,0,0.04)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                        >
                          <td style={{ padding: "10px 8px", fontSize: 11, color: "#5c5c5c", textAlign: "center" }}>{visIdx + 1}</td>
                          <td style={{ padding: "10px 10px", fontSize: 11, color: "#a3a3a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</td>
                          {stageTab !== "original" && (
                            <td style={{ padding: "10px 10px", fontSize: 11, color: ver?.filename ? "#a3a3a3" : "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ver?.filename || "—"}
                            </td>
                          )}
                          {stageTab !== "original" && (
                            <td style={{ padding: "10px 8px", textAlign: "center" }}>
                              <StatusBadge status={ver?.reviewStatus ?? "pending"} compact />
                            </td>
                          )}
                          <td style={{ padding: "10px 10px", fontSize: 11, color: (stageTab === "original" ? row.photo.comment : ver?.comment) ? "#a3a3a3" : "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {stageTab === "original" ? (row.photo.comment || "—") : (ver?.comment || "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                {/* 3개 탭 그리드 항상 DOM 유지 + 필터 미통과 행도 display:none으로 유지
                    → 탭 전환/필터 변경 시 카드 언마운트 없음 = 이미지 재요청 없음 */}
                <div className={cardCols} style={{ display: stageTab === "original" ? undefined : "none" }}>
                  {rows.map((row) => {
                    const visIdx = filteredIndexMap.get(row.photo.id);
                    return (
                      <div key={row.photo.id} style={{ display: visIdx !== undefined ? "contents" : "none" }}>
                        <OriginalCard
                          row={row}
                          index={visIdx ?? 0}
                          onOpenViewer={openViewer}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className={cardCols} style={{ display: stageTab === "v1" ? undefined : "none" }}>
                  {rows.map((row) => {
                    const visIdx = filteredIndexMap.get(row.photo.id);
                    return (
                      <div key={row.photo.id} style={{ display: visIdx !== undefined ? "contents" : "none" }}>
                        <V1Card
                          row={row}
                          index={visIdx ?? 0}
                          isReviewingV1={isReviewingV1}
                          v1DisplayStatus={effectiveV1Status(row.v1?.reviewStatus ?? null)}
                          canDeleteV1={canDeleteV1}
                          deletingId={deletingId}
                          canUploadV1={canUploadV1}
                          onOpenViewer={openViewer}
                          onDelete={handleDelete}
                          onOpenPanel={() => openPanel(1)}
                          onReplace={replaceVersion}
                          replacingId={replacingId}
                          getVersionUrl={getVersionUrl}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className={cardCols} style={{ display: stageTab === "v2" ? undefined : "none" }}>
                  {rows.map((row) => {
                    const visIdx = filteredIndexMap.get(row.photo.id);
                    return (
                      <div key={row.photo.id} style={{ display: visIdx !== undefined ? "contents" : "none" }}>
                        <V2Card
                          row={row}
                          index={visIdx ?? 0}
                          isReviewingV2={isReviewingV2}
                          effectiveV1Status={effectiveV1Status(row.v1?.reviewStatus ?? null)}
                          v2Dimmed={v2Dimmed}
                          canDeleteV2={canDeleteV2}
                          deletingId={deletingId}
                          canUploadV2={canUploadV2}
                          onOpenViewer={openViewer}
                          onDelete={handleDelete}
                          onOpenPanel={() => openPanel(2)}
                          onReplace={replaceVersion}
                          replacingId={replacingId}
                          getVersionUrl={getVersionUrl}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
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

      {/* ── Footer ── */}
      <footer className="shrink-0 border-t border-[#1a1a1e] bg-[#0a0a0c]/95 backdrop-blur-md z-10">
        {footerNote && (
          <div className="flex items-center gap-2.5 px-4 md:px-8 py-2 md:py-2.5 border-b border-[#FF4D00]/15 bg-[#FF4D00]/5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-sm text-[#FF4D00] font-medium">{footerNote}</span>
                            </div>
        )}
        <div className="flex items-center justify-end px-4 md:px-8 py-3 md:py-0 md:h-16">
          {project.status === "delivered" ? (
            <span className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={15} />납품 완료
            </span>
          ) : isConfirmed ? (
                                  <button
              onClick={handleStartEditing}
              disabled={startingEditing}
              className="flex items-center justify-center gap-2 w-full md:w-auto bg-[#FF4D00] hover:bg-[#ff5e1a] disabled:opacity-60 disabled:cursor-not-allowed text-black px-6 py-3 md:py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5"
            >
              <Sparkles size={15} />
              {startingEditing ? "처리 중…" : "보정 시작"}
            </button>
          ) : (canStartV1Review || canStartV2Review) ? (
            <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto">
              {canStartV1Review && (
                <button
                  onClick={() => handleStartCustomerReview(1)}
                  disabled={startingReview === 1}
                  className="flex items-center justify-center gap-2 w-full md:w-auto bg-[#FF4D00] hover:bg-[#ff5e1a] disabled:opacity-60 disabled:cursor-not-allowed text-black px-6 py-3 md:py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5"
                >
                  <Send size={15} />
                  {startingReview === 1 ? "처리 중…" : "보정본 검토 요청"}
                                  </button>
                                )}
              {canStartV2Review && (
                <button
                  onClick={() => handleStartCustomerReview(2)}
                  disabled={startingReview === 2}
                  className="flex items-center justify-center gap-2 w-full md:w-auto bg-[#FF4D00] hover:bg-[#ff5e1a] disabled:opacity-60 disabled:cursor-not-allowed text-black px-6 py-3 md:py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5"
                >
                  <Send size={15} />
                  {startingReview === 2 ? "처리 중…" : "재보정본 검토 요청"}
                </button>
                              )}
                            </div>
          ) : isEditingV2 && v2RevisionPending > 0 ? (
            <button
              disabled
              className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 md:py-2.5 rounded-xl text-sm font-bold border border-[#FF4D00]/30 text-[#FF4D00]/50 bg-[#FF4D00]/5 cursor-not-allowed"
            >
              <Send size={15} />
              재보정본 검토 요청 ({v2RevisionPending}장 교체 필요)
            </button>
          ) : (
            <span className="flex items-center justify-center w-full md:w-auto px-6 py-2.5 rounded-xl text-sm font-bold bg-[#121215] border border-[#27272c] text-zinc-500">
              다음 단계 대기 중
            </span>
          )}
                      </div>
      </footer>

      {/* ── Upload slide-over panel ── */}
      <UploadVersionsPanel
        isOpen={panelVersion !== null}
        onClose={() => setPanelVersion(null)}
        projectId={id}
        version={panelVersion ?? 1}
        targets={panelVersion === 2 ? v2Targets : v1Targets}
        existingVersionCount={existingVersionCount}
        onDelivered={handleDelivered}
      />

      {confirmDialog ? (
        <WorkflowConfirmModal
          content={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      ) : null}

      {reviewDeadlineModal?.stage === "setup" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => {
            if (startingReview === reviewDeadlineModal.v) return;
            closeReviewDeadlineModal();
          }}
        >
          <div
            className="w-full max-w-sm bg-[#0f0f12] border border-[#27272c] rounded-2xl p-6 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">
                    고객에게 {reviewDeadlineModal.v === 1 ? "보정본" : "재보정본"} 검토 요청
                  </h3>
                  <p className="text-sm text-[#71717a] leading-relaxed">
                    링크는 자동 발송되지 않습니다. 검토 단계로 전환한 뒤 다음 화면에서
                    링크를 복사해 직접 공유해 주세요.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[#a1a1aa]">검토 기한 (선택사항)</label>

                  {/* 빠른 선택 칩 */}
                  <div className="flex gap-2 flex-wrap">
                    {DEADLINE_PRESETS.map(({ label, days }) => {
                      const val = addDays(days);
                      const active = reviewDeadlineModal.dateInput === val;
                      return (
                        <button
                          key={days}
                          type="button"
                          onClick={() =>
                            setReviewDeadlineModal({ ...reviewDeadlineModal, dateInput: val })
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? "bg-[#FF4D00] border-[#FF4D00] text-black"
                              : "bg-transparent border-[#27272c] text-[#a1a1aa] hover:border-[#3f3f46] hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 직접 입력 (캘린더) */}
                  <input
                    type="date"
                    value={reviewDeadlineModal.dateInput}
                    onChange={(e) =>
                      setReviewDeadlineModal({
                        ...reviewDeadlineModal,
                        dateInput: e.target.value,
                      })
                    }
                    onClick={(e) => {
                      try {
                        (
                          e.currentTarget as HTMLInputElement & { showPicker?: () => void }
                        ).showPicker?.();
                      } catch {
                        /* unsupported */
                      }
                    }}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full rounded-xl bg-[#0a0a0c] border border-[#27272c] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#FF4D00] cursor-pointer"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={startingReview === reviewDeadlineModal.v}
                    className="flex-1 rounded-xl border border-[#27272c] text-[#71717a] text-sm font-medium py-2.5 hover:border-[#3f3f46] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    onClick={closeReviewDeadlineModal}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={startingReview === reviewDeadlineModal.v}
                    className="flex-1 rounded-xl bg-[#FF4D00] text-black text-sm font-bold py-2.5 disabled:opacity-50 hover:bg-[#ff5e1a] transition-colors"
                    onClick={() => {
                      const { v, dateInput } = reviewDeadlineModal;
                      void runStartCustomerReview(v, dateInput || undefined);
                    }}
                  >
                    {startingReview === reviewDeadlineModal.v
                      ? "처리 중…"
                      : reviewDeadlineModal.v === 1
                        ? "보정본 검토 요청"
                        : "재보정본 검토 요청"}
                  </button>
                </div>
            </>
          </div>
        </div>
      )}

      <CustomerInviteShareModal
        open={reviewDeadlineModal?.stage === "share"}
        onClose={closeReviewDeadlineModal}
        inviteUrl={inviteUrl}
        accessPin={project?.accessPin}
      />
    </div>
  );
}
