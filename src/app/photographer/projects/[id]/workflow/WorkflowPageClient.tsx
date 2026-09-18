"use client";

import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Photo, ProjectStatus } from "@/types";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import {
  PhotoVersionHistory,
  type PhotoVersionHistoryKey,
  type PhotoVersionHistoryItem,
} from "@/components/photographer/PhotoVersionHistory";
import {
  PHOTO_GRID_GAP,
  PHOTO_GRID_MEDIA_ASPECT_RATIO,
  PhotographerPhotoGallery,
} from "@/components/photographer/OriginalPhotoGallery";
import UploadVersionsPanel, {
  type UploadPanelTarget,
} from "@/components/photographer/UploadVersionsPanel";
import { CustomerInviteShareModal } from "@/components/photographer/CustomerInviteShareModal";
import { CustomerRetouchReviewRequestModal } from "@/components/photographer/CustomerRetouchReviewRequestModal";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  Check,
  Clock,
  Upload,
  SquarePen,
  Lock,
  AlertTriangle,
  Layers,
  MessageSquare,
  Send,
  Download,
  ChevronDown,
  Trash2,
  X,
} from "lucide-react";
import styles from "./Workflow.module.css";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";
import { compressImageForUpload } from "@/lib/upload-client-compress";
import { abandonDeliveryVersions, uploadDeliveryVersions, type DeliveryVersionUpload } from "@/lib/delivery-version-upload";
import { downloadSelectedPhotosToDirectory } from "@/lib/selected-photo-download";
import { ProjectAssetWorkspaceHeader } from "@/components/photographer/ProjectAssetWorkspaceHeader";
import { hasRetouchedAssetTab } from "@/components/photographer/ProjectAssetTabs";
import {
  ProjectAssetToolbarButton,
  ProjectAssetMobileSheet,
  ProjectAssetMobileToolbarActions,
  ProjectAssetExportTrigger,
  ProjectAssetToolbarSummary,
  ProjectAssetToolbarViewToggle,
  ProjectAssetWorkspaceToolbar,
} from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { ProjectAssetStatusActionBar } from "@/components/photographer/ProjectAssetStatusActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { formatPhotoDisplayFilename, getPhotoDisplayFilename } from "@/lib/photo-display-filename";
import { useProjectAssetsData } from "@/components/photographer/ProjectAssetsDataProvider";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { normalizeReviewComment } from "@/lib/review-submission-validation";
import { useCollapsibleAssetHeader } from "@/hooks/useCollapsibleAssetHeader";
import {
  fetchRetouchedVersionData,
  getCachedRetouchedVersionData,
  RETOUCHED_VERSION_DATA_STALE_MS,
  type RetouchedVersionsPayload as VersionsApiPayload,
} from "@/lib/retouched-version-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ASSET_GRID_STYLE = {
  // 보정 피드백을 읽을 수 있도록 원본·셀렉보다 넓은 최소 카드 폭을 사용한다.
  gridTemplateColumns: "repeat(auto-fill, minmax(218px, 1fr))",
  gap: PHOTO_GRID_GAP,
} as const;
const ASSET_CARD_MEDIA_STYLE = { aspectRatio: PHOTO_GRID_MEDIA_ASPECT_RATIO } as const;
const ASSET_CARD_FILENAME_CLASS = "truncate text-[12px] font-medium leading-5 tracking-[-0.35px] text-muted-foreground";
const getVersionUploadKey = (photoId: string, version: 1 | 2) => `${photoId}:${version}`;
const getInitialRetouchUploadPromptKey = (projectId: string) => `acut:retouched-upload-prompt:${projectId}:v1`;
const getRetouchReviewNoticeKey = (projectId: string) => `acut:retouch-review-notice:${projectId}`;

// ── Types ──────────────────────────────────────────────────────────────────

type VersionInfo = {
  id: string;
  url: string;      // 1500px — 뷰어·라이트박스용
  thumbUrl: string; // 400px — 카드 그리드용 (없으면 url fallback)
  reviewStatus: "approved" | "revision_requested" | null;
  comment: string | null;
  filename: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type VersionHistoryInfo = VersionInfo & {
  version: 1 | 2;
  revisionNo: number;
  supersededAt: string;
};

type WorkflowRow = {
  photo: Photo;
  v1: VersionInfo | null;
  v2: VersionInfo | null;
  history: VersionHistoryInfo[];
};

type FilterTab = "all" | "approved" | "revision" | "v1_pending" | "v2_pending";

// 현재 리뷰가 교체로 초기화되어도 과거 V2 검토 이력이 있으면 삭제 잠금을 유지한다.
function isReviewedRetouch(row: WorkflowRow): boolean {
  return Boolean(row.v2?.reviewStatus || row.v2?.reviewedAt ||
    row.history.some((item) => item.version === 2 && (item.reviewStatus || item.reviewedAt)));
}
type StageTab = "original" | "v1" | "v2" | "final";

type FinalVersionSelection = {
  version: 1 | 2;
  info: VersionInfo | VersionHistoryInfo;
  archived: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultStageForStatus(status: ProjectStatus, allowRevision: boolean): StageTab {
  if (status === "reviewing_v1") return "v1";
  if (allowRevision && (status === "editing_v2" || status === "reviewing_v2")) {
    return "v2";
  }
  if (status === "delivered") return allowRevision ? "v2" : "v1";
  if (status === "editing") return "v1";
  if (status === "confirmed") return "v1";
  return "v1";
}

function getFinalVersion(row: WorkflowRow, delivered: boolean): FinalVersionSelection | null {
  const approved: FinalVersionSelection[] = [
    ...(row.v1?.reviewStatus === "approved"
      ? [{ version: 1 as const, info: row.v1, archived: false }]
      : []),
    ...(row.v2?.reviewStatus === "approved"
      ? [{ version: 2 as const, info: row.v2, archived: false }]
      : []),
    ...row.history
      .filter((item) => item.reviewStatus === "approved")
      .map((item) => ({ version: item.version, info: item, archived: true })),
  ];

  if (approved.length > 0) {
    return approved.sort((a, b) => {
      const aTime = new Date(a.info.reviewedAt ?? a.info.createdAt).getTime();
      const bTime = new Date(b.info.reviewedAt ?? b.info.createdAt).getTime();
      return bTime - aTime;
    })[0];
  }

  // 구버전 일괄 제출 프로젝트는 review_status가 비어 있어도 납품 완료 자체가 최종 확정이다.
  if (delivered) {
    if (row.v2) return { version: 2, info: row.v2, archived: false };
    if (row.v1) return { version: 1, info: row.v1, archived: false };
  }
  return null;
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

function normalizeCustomerComment(comment: string | null | undefined): string | null {
  return normalizeReviewComment(comment);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RetouchedFilename({ filename }: { filename: string }) {
  const splitAt = Math.max(0, filename.length - 10);
  return <span className={styles.filename} tabIndex={0} aria-label={filename}>
    <span className={styles.filenameStart} aria-hidden>{filename.slice(0, splitAt)}</span>
    <span className={styles.filenameEnd} aria-hidden>{filename.slice(splitAt)}</span>
    <span className={styles.filenameTooltip} aria-hidden>{filename}</span>
  </span>;
}

function MobileRetouchedCardHeader({
  originalUrl,
  originalFilename,
  versionFilename,
  uploaded,
  onOpenOriginal,
}: {
  originalUrl: string | null;
  originalFilename: string;
  versionFilename: string;
  uploaded: boolean;
  onOpenOriginal: () => void;
}) {
  return (
    <div className={styles.mobileRetouchedCardHeader}>
      <OriginalReferenceThumbnail url={originalUrl} filename={originalFilename} onOpen={onOpenOriginal} />
      {uploaded ? (
        <div className="min-w-0">
          <p data-retouched-card-filename className={`${ASSET_CARD_FILENAME_CLASS} text-foreground`} title={versionFilename}>
            <RetouchedFilename filename={versionFilename} />
          </p>
          <p className="truncate text-[10px] leading-[15px] text-subtle-foreground" title={originalFilename}>
            원본 · {originalFilename}
          </p>
        </div>
      ) : (
        <p className={ASSET_CARD_FILENAME_CLASS} title={originalFilename}>
          <RetouchedFilename filename={originalFilename} />
        </p>
      )}
    </div>
  );
}

function VersionPhoto({
  thumbSrc,
  fullSrc,
  alt,
  onOpen,
  children,
}: {
  thumbSrc: string;
  fullSrc: string;
  alt: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group/image relative min-h-0 w-full overflow-hidden rounded-lg" style={ASSET_CARD_MEDIA_STYLE}>
      <button type="button" onClick={onOpen} className="group/media absolute inset-0 overflow-hidden rounded-lg border border-border bg-surface-raised transition-colors hover:border-border-strong">
        <img
          src={thumbSrc}
          srcSet={thumbSrc === fullSrc ? undefined : `${thumbSrc} 400w, ${fullSrc} 1500w`}
          sizes="(max-width: 767px) 44vw, (min-width: 1800px) 280px, 220px"
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-300 ease-out will-change-transform group-hover/media:scale-[1.045] group-hover/media:saturate-[1.04] group-hover/media:contrast-[1.025] group-focus-visible/media:scale-[1.045]"
        />
        <span className="pointer-events-none absolute inset-0 rounded-lg bg-[rgba(2,56,82,0)] transition-colors duration-300 group-hover/media:bg-[rgba(2,56,82,0.075)] group-focus-visible/media:bg-[rgba(2,56,82,0.075)]" />
      </button>
      {children}
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: "approved" | "revision_requested" | "pending" | "reviewing";
  compact?: boolean;
}) {
  if (compact) {
    return <span data-review-status={status} className={`${styles.readableStatus} ${status === "revision_requested" ? styles.needsRevision : status === "approved" ? styles.approvedStatus : "text-muted-foreground"}`}>
      {status === "approved" ? <Check size={12} /> : status === "revision_requested" ? <AlertTriangle size={12} /> : <Clock size={12} />}
      {status === "approved" ? "확정" : status === "revision_requested" ? "재보정 요청" : status === "reviewing" ? "검토 중" : "검토 대기"}
    </span>;
  }
  // 내부 렌더링만 공통 Badge(Status/Attention/Time)로 위임 — 호출부 3곳의 signature(status/compact)는 그대로 둔다.
  if (status === "reviewing") {
    return (
      <Badge tone="status-customer" icon={<Clock size={11} />}>
        {compact ? "검토중" : "검토 중"}
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge tone="status-success" icon={<CheckCircle2 size={11} />}>
        확정
      </Badge>
    );
  }
  if (status === "revision_requested") {
    return (
      <Badge tone="status-photographer" icon={<AlertTriangle size={11} />}>
        재보정 요청
      </Badge>
    );
  }
  return (
    <Badge tone="attention-warning" icon={<Clock size={11} />}>
      {compact ? "대기" : "검토 대기"}
    </Badge>
  );
}

// ── Stage cards (Original / V1 / V2) ───────────────────────────────────────

function CardShell({
  children,
  selected = false,
  needsRevision = false,
}: {
  children: React.ReactNode;
  selected?: boolean;
  needsRevision?: boolean;
}) {
  return (
    <div
      data-workflow-asset-card
      data-needs-revision={needsRevision || undefined}
      className={`${needsRevision ? styles.revisionCard : ""} group relative flex self-start flex-col overflow-visible rounded-lg p-[5px] transition-[box-shadow,background-color] ${
        selected
          ? "bg-accent/[0.025] ring-2 ring-accent/70 md:ring-accent/35"
          : "bg-transparent"
      }`}
    >
      {children}
    </div>
  );
}

function VersionSelectionCheckbox({
  selected,
  disabled,
  label,
  onClick,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="absolute left-0 top-0 z-10 flex h-11 w-11 items-start justify-start rounded-lg bg-transparent p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-45"
    >
      <span className={`flex h-5 w-5 items-center justify-center rounded border shadow-sm backdrop-blur-sm transition-colors ${selected ? "border-accent bg-accent text-white" : "border-border-strong bg-white/85 text-transparent"}`}>
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

function OriginalReferenceThumbnail({
  url,
  filename,
  onOpen,
}: {
  url: string | null;
  filename: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/original relative h-11 w-11 md:h-8 md:w-10 shrink-0 overflow-hidden rounded-md border border-border-subtle bg-surface-raised transition-colors hover:border-border-strong"
      title={`${filename} 원본 보기`}
      aria-label={`${filename} 원본 보기`}
    >
      {url ? (
        <img
          src={url}
          alt={`${filename} 원본`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover/original:scale-[1.03]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-disabled-foreground">
          <Layers size={13} />
        </span>
      )}
      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 py-px text-[8px] font-semibold leading-3 text-white">
        원본
      </span>
    </button>
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
  const filename = getPhotoDisplayFilename(row.photo, index);
  return (
    <CardShell>
      <button
        type="button"
        onClick={() => onOpenViewer(index, "original")}
        className="group/media relative mb-2 block min-h-0 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-raised"
        style={ASSET_CARD_MEDIA_STYLE}
      >
        {row.photo.url ? (
          <img src={row.photo.url} alt={filename} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-300 ease-out will-change-transform group-hover/media:scale-[1.045] group-hover/media:saturate-[1.04] group-hover/media:contrast-[1.025] group-focus-visible/media:scale-[1.045]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-disabled-foreground">
            <Layers size={24} />
          </div>
        )}
        <div className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          원본
        </div>
        <span className="pointer-events-none absolute inset-0 rounded-lg bg-[rgba(2,56,82,0.075)] opacity-0 transition-opacity duration-300 group-hover/media:opacity-100 group-focus-visible/media:opacity-100" />
      </button>
      <div className="mb-1.5 truncate text-[12px] font-medium text-muted-foreground" title={filename}>
        {filename}
      </div>
      {row.photo.originalStatus && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide mb-1.5 ${
          row.photo.originalStatus === "completed"
            ? "bg-emerald-500/15 text-emerald-500"
            : row.photo.originalStatus === "failed"
              ? "bg-red-500/15 text-red-500"
              : "bg-amber-500/15 text-amber-500"
        }`}>
          {row.photo.originalStatus === "completed"
            ? "원본 완료"
            : row.photo.originalStatus === "failed"
              ? "원본 실패"
              : "원본 처리 중"}
        </div>
      )}
      {row.photo.comment ? (
        <div className="bg-background border border-border-subtle rounded-lg p-2 text-[11px] text-muted-foreground leading-relaxed">
          <div className="text-[9px] text-accent font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
            <MessageSquare size={9} />
            고객 코멘트
          </div>
          &ldquo;{row.photo.comment}&rdquo;
        </div>
      ) : (
        <div className="text-[10px] text-disabled-foreground italic">코멘트 없음</div>
      )}
    </CardShell>
  );
}

function SingleVersionUploadSlot({
  photoId,
  version,
  canUpload,
  isUploading,
  onUpload,
  compact = false,
}: {
  compact?: boolean;
  photoId: string;
  version: 1 | 2;
  canUpload: boolean;
  isUploading: boolean;
  onUpload: (photoId: string, version: 1 | 2, file: File) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLabel = version === 1 ? "보정본 업로드" : "재보정본 업로드";

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile || isUploading) return;
    const hasImageExtension = /\.(jpe?g|png|webp|heic|heif)$/i.test(nextFile.name);
    if (nextFile.size <= 0) {
      alert("빈 파일은 업로드할 수 없습니다.");
      return;
    }
    if (!nextFile.type.startsWith("image/") && !hasImageExtension) {
      alert("지원하는 이미지 파일을 선택해주세요.");
      return;
    }
    void onUpload(photoId, version, nextFile);
  };

  return (
    <div
      className={`relative flex ${compact ? "h-full w-full flex-col gap-2 rounded-lg border border-dashed px-2" : "w-full flex-col gap-1 rounded-lg border-2 border-dashed"} items-center justify-center transition-colors ${
        canUpload && !isUploading
          ? "border-border-subtle bg-background hover:border-border-strong hover:bg-surface-raised"
          : "border-border-subtle bg-background opacity-50"
      }`}
      style={compact ? { minHeight: 44 } : ASSET_CARD_MEDIA_STYLE}
      onDragOver={(event) => {
        if (canUpload && !isUploading) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canUpload || isUploading) return;
        event.preventDefault();
        selectFile(event.dataTransfer.files?.[0]);
      }}
    >
      {isUploading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
      ) : (
        <Upload size={compact ? 16 : 20} className={canUpload ? "text-subtle-foreground" : "text-disabled-foreground"} />
      )}
      <p className={`${compact ? "text-[14px] leading-5" : "text-[11px]"} font-semibold text-foreground`}>
        {isUploading ? "업로드 중" : canUpload ? compact ? "파일 선택" : uploadLabel : "업로드 대기"}
      </p>
      {canUpload && !isUploading ? (
        <p className={`${compact ? "text-[10px]" : "text-[9px]"} text-subtle-foreground`}>선택 즉시 업로드{!compact ? <span className="hidden md:inline"> · 파일을 놓아도 됩니다</span> : null}</p>
      ) : null}
      <button
        type="button"
        disabled={!canUpload || isUploading}
        onClick={() => inputRef.current?.click()}
        className="absolute inset-0 rounded-lg disabled:cursor-not-allowed"
        aria-label={`${uploadLabel} 파일 선택 후 즉시 업로드`}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        disabled={!canUpload || isUploading}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function V1Card({
  row,
  index,
  isReviewingV1,
  v1DisplayStatus,
  canUploadV1,
  canSelect,
  selected,
  selectionMode,
  selectionBusy,
  onOpenViewer,
  onToggleSelection,
  onReplace,
  isUploading,
  getVersionUrl,
}: {
  row: WorkflowRow;
  index: number;
  isReviewingV1: boolean;
  v1DisplayStatus: "approved" | "revision_requested" | "pending" | "uploaded";
  canUploadV1: boolean;
  canSelect: boolean;
  selected: boolean;
  selectionMode: boolean;
  selectionBusy: boolean;
  onOpenViewer: (idx: number, tab: StageTab) => void;
  onToggleSelection: (versionId: string) => void;
  onReplace: (photoId: string, version: 1 | 2, file: File) => Promise<boolean>;
  isUploading: boolean;
  getVersionUrl: (url: string, photoId: string, version: 1 | 2) => string;
}) {
  const filename = getPhotoDisplayFilename(row.photo, index);
  const v1 = row.v1;
  const effectiveStatus = v1DisplayStatus;
  const isApproved = v1?.reviewStatus === "approved";
  const showV1Status = Boolean(v1 && effectiveStatus !== "uploaded");
  const showV1Replace = Boolean(v1 && canUploadV1 && !isApproved);
  const versionFilename = v1?.filename ? formatPhotoDisplayFilename(v1.filename) : filename;
  const v1ThumbSrc = v1 ? getVersionUrl(v1.thumbUrl, row.photo.id, 1) : null;
  const v1FullSrc = v1 ? getVersionUrl(v1.url, row.photo.id, 1) : null;
  return (
    <CardShell selected={selected} needsRevision={effectiveStatus === "revision_requested"}>
      <MobileRetouchedCardHeader
        originalUrl={row.photo.url}
        originalFilename={filename}
        versionFilename={versionFilename}
        uploaded={Boolean(v1)}
        onOpenOriginal={() => onOpenViewer(index, "original")}
      />
      <div className="mb-2 hidden min-w-0 items-center gap-2 px-0.5 pt-0.5 md:flex">
        <div className="hidden md:block"><OriginalReferenceThumbnail
          url={row.photo.url}
          filename={filename}
          onOpen={() => onOpenViewer(index, "original")}
        /></div>
        <div className="min-w-0 flex-1">
          {v1 ? <p data-retouched-card-filename className={ASSET_CARD_FILENAME_CLASS} title={versionFilename}>
            <RetouchedFilename filename={versionFilename} />
          </p> : <p className={ASSET_CARD_FILENAME_CLASS} title={filename}><RetouchedFilename filename={filename} /></p>}
          {v1 ? (
            <p
              className="hidden truncate text-[10px] leading-[15px] text-subtle-foreground md:block"
              title={filename}
            >
              원본 · {filename}
            </p>
          ) : null}
        </div>
      </div>

      {/* Main V1: 모바일은 상단 원본 참조 아래에 보정본을 크게 표시한다. */}
      <div className={styles.comparisonMedia} data-mobile-retouched-media>
      {v1 && v1ThumbSrc && v1FullSrc ? (
        <VersionPhoto thumbSrc={v1ThumbSrc} fullSrc={v1FullSrc} alt="V1" onOpen={() => onOpenViewer(index, "v1")}>
          {canSelect && !isApproved ? (
            <VersionSelectionCheckbox
              selected={selected}
              disabled={selectionBusy || isUploading}
              label={`${filename} 보정본 ${selected ? "선택 해제" : "선택"}`}
              onClick={() => onToggleSelection(v1.id)}
            />
          ) : null}
          {!selectionMode && showV1Replace ? (
            <label
              className={`absolute bottom-0 right-0 z-10 flex h-11 w-11 cursor-pointer items-end justify-end rounded-lg bg-transparent focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-accent ${
                isUploading ? "pointer-events-none opacity-40" : ""
              }`}
              title="보정본 교체"
              aria-label={`${filename} 보정본 교체`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-tl-lg border border-white/10 bg-black/35 text-white/75 opacity-70 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white hover:opacity-100 group-hover/image:opacity-100">
                <SquarePen size={12} />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onReplace(row.photo.id, 1, f);
                }}
              />
            </label>
          ) : null}
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg pointer-events-none">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </VersionPhoto>
      ) : (
        <SingleVersionUploadSlot
          photoId={row.photo.id}
          version={1}
          canUpload={canUploadV1}
          isUploading={isUploading}
          onUpload={onReplace}
        />
      )}
      </div>

      {showV1Status && !selectionMode ? (
        <div className="mt-1.5 min-w-0">
          <StatusBadge status={effectiveStatus === "pending" && isReviewingV1 ? "reviewing" : effectiveStatus as "approved" | "revision_requested" | "pending"} compact />
        </div>
      ) : null}
    </CardShell>
  );
}

function V2Card({
  row,
  index,
  isReviewingV2,
  effectiveV1Status,
  v2Dimmed,
  canUploadV2,
  canSelect,
  selected,
  selectionMode,
  selectionBusy,
  onOpenViewer,
  onToggleSelection,
  onReplace,
  isUploading,
  getVersionUrl,
}: {
  row: WorkflowRow;
  index: number;
  isReviewingV2: boolean;
  effectiveV1Status: "approved" | "revision_requested" | "pending" | "uploaded";
  v2Dimmed: boolean;
  canUploadV2: boolean;
  canSelect: boolean;
  selected: boolean;
  selectionMode: boolean;
  selectionBusy: boolean;
  onOpenViewer: (idx: number, tab: StageTab) => void;
  onToggleSelection: (versionId: string) => void;
  onReplace: (photoId: string, version: 1 | 2, file: File) => Promise<boolean>;
  isUploading: boolean;
  getVersionUrl: (url: string, photoId: string, version: 1 | 2) => string;
}) {
  const filename = getPhotoDisplayFilename(row.photo, index);
  const v2 = row.v2;
  const isRevisionPhoto = effectiveV1Status === "revision_requested";
  const isApproved = v2?.reviewStatus === "approved";

  const showV2Status = Boolean(v2 && isRevisionPhoto && !v2Dimmed);
  const showV2Replace = Boolean(v2 && isRevisionPhoto && !v2Dimmed && canUploadV2 && !isApproved);
  const versionFilename = v2?.filename ? formatPhotoDisplayFilename(v2.filename) : filename;
  const effectiveV2Status = v2?.reviewStatus ?? "pending";
  const v2ThumbSrc = v2 ? getVersionUrl(v2.thumbUrl, row.photo.id, 2) : null;
  const v2FullSrc = v2 ? getVersionUrl(v2.url, row.photo.id, 2) : null;
  return (
    <CardShell selected={selected} needsRevision={effectiveV2Status === "revision_requested" && !v2Dimmed}>
      <MobileRetouchedCardHeader
        originalUrl={row.photo.url}
        originalFilename={filename}
        versionFilename={versionFilename}
        uploaded={Boolean(v2)}
        onOpenOriginal={() => onOpenViewer(index, "original")}
      />
      <div className="mb-2 hidden min-w-0 items-center gap-2 px-0.5 pt-0.5 md:flex">
        <div className="hidden md:block"><OriginalReferenceThumbnail
          url={row.photo.url}
          filename={filename}
          onOpen={() => onOpenViewer(index, "original")}
        /></div>
        <div className="min-w-0 flex-1">
          {v2 ? <p data-retouched-card-filename className={ASSET_CARD_FILENAME_CLASS} title={versionFilename}>
            <RetouchedFilename filename={versionFilename} />
          </p> : <p className={ASSET_CARD_FILENAME_CLASS} title={filename}><RetouchedFilename filename={filename} /></p>}
          {v2 ? (
            <p
              className="hidden truncate text-[10px] leading-[15px] text-subtle-foreground md:block"
              title={filename}
            >
              원본 · {filename}
            </p>
          ) : null}
        </div>
      </div>

      {/* Main V2: 모바일은 상단 원본 참조 아래에 재보정본을 크게 표시한다. */}
      <div className={styles.comparisonMedia} data-mobile-retouched-media>
      {v2Dimmed ? (
        <div className="w-full rounded-lg border border-border-subtle bg-background flex flex-col items-center justify-center gap-1 mb-2 opacity-50" style={ASSET_CARD_MEDIA_STYLE}>
          <Lock size={18} className="text-disabled-foreground" />
          <span className="text-[10px] text-disabled-foreground text-center px-3">
            V1 검토 완료 후 업로드 가능
          </span>
        </div>
      ) : effectiveV1Status === "approved" ? (
        <div className="w-full rounded-lg border border-dashed border-border-subtle bg-background flex flex-col items-center justify-center gap-1 mb-2 opacity-40" style={ASSET_CARD_MEDIA_STYLE}>
          <CheckCircle2 size={18} className="text-emerald-500" />
          <span className="text-[10px] text-subtle-foreground text-center px-3">
            V1 확정 — 재보정 불필요
          </span>
        </div>
      ) : effectiveV1Status === "pending" ? (
        <div className="w-full rounded-lg border border-dashed border-amber-500/30 bg-background flex flex-col items-center justify-center gap-1 mb-2 opacity-80 px-3" style={ASSET_CARD_MEDIA_STYLE}>
          <AlertTriangle size={18} className="text-amber-400" />
          <span className="text-[10px] text-amber-300 text-center font-medium">
            V1 검토 결과 없음
          </span>
          <span className="text-[9px] text-subtle-foreground text-center">
            페이지를 새로고침 해주세요
          </span>
        </div>
      ) : v2 && v2ThumbSrc && v2FullSrc ? (
        <VersionPhoto thumbSrc={v2ThumbSrc} fullSrc={v2FullSrc} alt="V2" onOpen={() => onOpenViewer(index, "v2")}>
          {canSelect && !isApproved ? (
            <VersionSelectionCheckbox
              selected={selected}
              disabled={selectionBusy || isUploading}
              label={`${filename} 재보정본 ${selected ? "선택 해제" : "선택"}`}
              onClick={() => onToggleSelection(v2.id)}
            />
          ) : null}
          {!selectionMode && showV2Replace ? (
            <label
              className={`absolute bottom-0 right-0 z-10 flex h-11 w-11 cursor-pointer items-end justify-end rounded-lg bg-transparent focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-accent ${
                isUploading ? "pointer-events-none opacity-40" : ""
              }`}
              title="재보정본 교체"
              aria-label={`${filename} 재보정본 교체`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-tl-lg border border-white/10 bg-black/35 text-white/75 opacity-70 shadow-sm backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white hover:opacity-100 group-hover/image:opacity-100">
                <SquarePen size={12} />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onReplace(row.photo.id, 2, f);
                }}
              />
            </label>
          ) : null}
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg pointer-events-none">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </VersionPhoto>
      ) : (
        <SingleVersionUploadSlot
          photoId={row.photo.id}
          version={2}
          canUpload={canUploadV2}
          isUploading={isUploading}
          onUpload={onReplace}
        />
      )}
      </div>

      {showV2Status && !selectionMode ? (
        <div className="mt-1.5 min-w-0"><StatusBadge status={effectiveV2Status === "pending" && isReviewingV2 ? "reviewing" : effectiveV2Status} compact /></div>
      ) : null}
    </CardShell>
  );
}

function FinalCard({
  row,
  index,
  selection,
  onOpenViewer,
  getVersionUrl,
}: {
  row: WorkflowRow;
  index: number;
  selection: FinalVersionSelection;
  onOpenViewer: (idx: number, tab: StageTab) => void;
  getVersionUrl: (url: string, photoId: string, version: 1 | 2) => string;
}) {
  const originalFilename = getPhotoDisplayFilename(row.photo, index);
  const filename = selection.info.filename
    ? formatPhotoDisplayFilename(selection.info.filename)
    : originalFilename;
  const imageUrl = selection.archived
    ? selection.info.thumbUrl
    : getVersionUrl(selection.info.thumbUrl, row.photo.id, selection.version);

  return (
    <CardShell>
      <div data-final-photo-header className="mb-2 min-w-0 px-0.5 pt-0.5">
        <p className="truncate text-[13px] font-semibold leading-[18px] text-foreground" title={filename}>
          {filename}
        </p>
      </div>
      <button
        data-final-photo-image
        type="button"
        onClick={() => onOpenViewer(index, "final")}
        className="group/media relative block min-h-0 w-full overflow-hidden rounded-lg border border-border bg-surface-raised transition-colors hover:border-border-strong"
        style={ASSET_CARD_MEDIA_STYLE}
      >
        <img
          src={imageUrl}
          alt={filename}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-300 ease-out will-change-transform group-hover/media:scale-[1.045] group-hover/media:saturate-[1.04] group-hover/media:contrast-[1.025] group-focus-visible/media:scale-[1.045]"
        />
        <span className="pointer-events-none absolute inset-0 bg-[rgba(2,56,82,0)] transition-colors duration-300 group-hover/media:bg-[rgba(2,56,82,0.075)]" />
      </button>
    </CardShell>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function WorkflowPageClient({
  isActive = true,
  assetView = "retouched",
}: {
  isActive?: boolean;
  assetView?: "retouched" | "final";
}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const {
    project,
    photos,
    selectedIds,
    loading: assetDataLoading,
    error: assetDataError,
    setProject,
  } = useProjectAssetsData();
  const assetRouteAllowed = project
    ? assetView === "final" ? project.status === "delivered" : hasRetouchedAssetTab(project.status)
    : false;
  const [rows, setRows]             = useState<WorkflowRow[]>([]);
  const [existingVersionCount, setExistingVersionCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>("all");
  const [viewMode, setViewMode]     = useState<"gallery" | "list">("gallery");
  // 최초 진입 시에만 프로젝트 단계에 맞는 라운드를 제안한다. 이후 선택은 사용자가 유지한다.
  // 최종본 경로는 첫 paint부터 final 상태로 시작한다. 기본 V1로 렌더한 뒤
  // effect에서 전환하면 납품 완료 화면에 과거 `재보정 요청`이 잠깐 노출된다.
  const [stageTab, setStageTab]     = useState<StageTab>(() => assetView === "final" ? "final" : "v1");
  const initializedRoundProjectRef = useRef<string | null>(null);
  const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(new Set());
  const [deletingSelection, setDeletingSelection] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx]   = useState(0);
  const [viewerTab, setViewerTab]   = useState<StageTab>("original");
  const [viewerHistoryId, setViewerHistoryId] = useState<string | null>(null);
  const [viewerCompare, setViewerCompare] = useState(false);
  const [viewerCompareOriginal, setViewerCompareOriginal] = useState(false);
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [panelVersion, setPanelVersion] = useState<1 | 2 | null>(null);
  const [startingReview, setStartingReview] = useState<1 | 2 | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reviewDeadlineModal, setReviewDeadlineModal] = useState<
    { v: 1 | 2; dateInput: string; stage: "setup" | "share"; error?: string } | null
  >(null);
  const [uploadingVersionKeys, setUploadingVersionKeys] = useState<Set<string>>(new Set());
  const uploadingVersionKeysRef = useRef<Set<string>>(new Set());
  const initialUploadPromptRef = useRef<string | null>(null);
  const versionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [versionBust, setVersionBust] = useState<Record<string, number>>({});
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [mobileRoundOpen, setMobileRoundOpen] = useState(false);
  const [reviewNoticeDismissed, setReviewNoticeDismissed] = useState(false);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const { compact: compactHeader, handleScroll: handleAssetScroll } = useCollapsibleAssetHeader();
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [originalDownloadProgress, setOriginalDownloadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [exportMessage, setExportMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const getVersionUrl = useCallback(
    (url: string, photoId: string, version: 1 | 2) => {
      const bust = versionBust[`${photoId}:${version}`];
      if (!bust) return url;
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}t=${bust}`;
    },
    [versionBust],
  );

  const loadedProjectId = project?.id;
  const applyVersionData = useCallback((versionsRes: VersionsApiPayload) => {
    const selectedPhotos = photos.filter((photo) => selectedIds.has(photo.id));
    const v1Map = new Map<string, VersionInfo>();
    const v2Map = new Map<string, VersionInfo>();
    const historyByPhoto = new Map<string, VersionHistoryInfo[]>();
    const distinctVersions = new Set<number>();
    for (const v of versionsRes.versions ?? []) {
      const info: VersionInfo = {
        id: v.id,
        url: v.r2_url,
        thumbUrl: v.r2_thumb_url ?? v.r2_url,
        reviewStatus: v.review_status ?? null,
        comment: normalizeCustomerComment(v.customer_comment),
        filename: v.version_filename ?? null,
        createdAt: v.created_at,
        reviewedAt: v.reviewed_at,
      };
      distinctVersions.add(v.version);
      if (v.version === 1) v1Map.set(v.photo_id, info);
      else if (v.version === 2) v2Map.set(v.photo_id, info);
    }
    for (const history of versionsRes.version_history ?? []) {
      const archived: VersionHistoryInfo = {
        id: history.id,
        version: history.version,
        revisionNo: history.revision_no,
        url: history.r2_url,
        thumbUrl: history.r2_thumb_url ?? history.r2_url,
        reviewStatus: history.review_status ?? null,
        comment: normalizeCustomerComment(history.customer_comment),
        filename: history.version_filename ?? null,
        createdAt: history.created_at,
        reviewedAt: history.reviewed_at,
        supersededAt: history.superseded_at,
      };
      const existing = historyByPhoto.get(history.photo_id) ?? [];
      existing.push(archived);
      historyByPhoto.set(history.photo_id, existing);
    }
    historyByPhoto.forEach((history) => {
      history.sort((a, b) => b.version - a.version || b.revisionNo - a.revisionNo);
    });

    setExistingVersionCount(distinctVersions.size);
    setRows(
      selectedPhotos.map((photo) => ({
        photo,
        v1: v1Map.get(photo.id) ?? null,
        v2: v2Map.get(photo.id) ?? null,
        history: historyByPhoto.get(photo.id) ?? [],
      })),
    );

    // 자산 탭 패널은 방문 후 DOM을 유지하므로, 고객이 다른 창에서 검토를 마쳐도
    // Provider의 project 상태는 reviewing_v1/v2에 머물 수 있다. versions API가
    // 소유권 확인과 함께 읽은 최신 상태를 잠금·CTA 판단의 단일 기준으로 동기화한다.
    setProject((current) => {
      if (!current || current.status === versionsRes.project_status) return current;
      return { ...current, status: versionsRes.project_status };
    });
  }, [photos, selectedIds, setProject]);

  const loadData = useCallback(async (options?: { force?: boolean }) => {
    if (assetDataLoading || !loadedProjectId || !assetRouteAllowed) return;

    const force = options?.force === true;
    const cached = getCachedRetouchedVersionData(id);
    // 명시적 갱신은 현재 화면의 optimistic 결과를 유지한다. 오래된 캐시를 먼저
    // 적용하면 삭제·교체 직후 이전 이미지가 잠깐 되살아나는 문제가 생긴다.
    if (cached && !force) {
      applyVersionData(cached.payload);
      setLoading(false);
      setError(null);
    }

    const cacheIsFresh = cached && Date.now() - cached.fetchedAt < RETOUCHED_VERSION_DATA_STALE_MS;
    if (!force && cacheIsFresh) return;

    const isInitialLoad = !cached;
    if (isInitialLoad) setLoading(true);
    if (isInitialLoad) setError(null);

    try {
      const versionsRes = await fetchRetouchedVersionData(id, force);
      applyVersionData(versionsRes);
      setError(null);
    } catch (e) {
      if (isInitialLoad) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } else {
        console.warn("[retouched versions refresh]", e);
      }
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [applyVersionData, assetDataLoading, assetRouteAllowed, id, loadedProjectId]);

  const scheduleVersionRefresh = useCallback(() => {
    if (versionRefreshTimerRef.current) clearTimeout(versionRefreshTimerRef.current);
    versionRefreshTimerRef.current = setTimeout(() => {
      versionRefreshTimerRef.current = null;
      void loadData({ force: true });
    }, 250);
  }, [loadData]);

  useEffect(() => () => {
    if (versionRefreshTimerRef.current) clearTimeout(versionRefreshTimerRef.current);
  }, []);

  useEffect(() => {
    // sessionStorage는 브라우저에서만 확인하고 첫 페인트 이후 안전하게 상태를 맞춘다.
    const frame = window.requestAnimationFrame(() => {
      setReviewNoticeDismissed(sessionStorage.getItem(getRetouchReviewNoticeKey(id)) === "dismissed");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [id]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      // 방문한 탭의 데이터는 메모리에 유지되므로 재진입 시 캐시를 먼저 보여주되,
      // 최신 고객 검토 상태는 반드시 서버에서 다시 확인한다.
      await loadData({ force: Boolean(getCachedRetouchedVersionData(id)) });
    })();
    return () => { cancelled = true; };
  }, [id, isActive, loadData]);

  useEffect(() => {
    if (!isActive || !project) return;
    const isWaitingForCustomer = project.status === "reviewing_v1" || project.status === "reviewing_v2";
    if (!isWaitingForCustomer) return;

    let syncing = false;
    const syncReviewState = async () => {
      if (syncing || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        await loadData({ force: true });
      } finally {
        syncing = false;
      }
    };
    const handleFocus = () => { void syncReviewState(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncReviewState();
    };
    const intervalId = window.setInterval(() => { void syncReviewState(); }, 15_000);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive, loadData, project]);

  const hasV1RevisionRequest = rows.some((row) => row.v1?.reviewStatus === "revision_requested");
  const hasV2Data = rows.some((row) => row.v2 !== null);
  const isV2ProjectPhase = Boolean(project && ["editing_v2", "reviewing_v2"].includes(project.status));
  const showV2Tab = hasV1RevisionRequest || hasV2Data || isV2ProjectPhase;
  const finalRows = useMemo(
    () => rows.filter((row) => getFinalVersion(row, project?.status === "delivered") !== null),
    [project?.status, rows],
  );

  // 프로젝트별 최초 진입에서만 상태/URL을 반영한다. 검토 상태 갱신으로 V1 결과 화면을 강제로 덮지 않는다.
  useEffect(() => {
    if (!project || loading || initializedRoundProjectRef.current === project.id) return;
    if (assetView === "final") {
      setStageTab("final");
      setFilter("all");
      initializedRoundProjectRef.current = project.id;
      return;
    }
    const search = new URLSearchParams(window.location.search);
    const requestedRound = search.get("round") ?? search.get("stage");
    const nextRound = requestedRound === "v2" && showV2Tab
      ? "v2"
      : requestedRound === "v1"
        ? "v1"
        : defaultStageForStatus(project.status, showV2Tab);
    const normalizedRound = nextRound === "v2" && !showV2Tab ? "v1" : nextRound;
    setStageTab(normalizedRound);
    setFilter("all");
    const url = new URL(window.location.href);
    url.searchParams.delete("stage");
    url.searchParams.set("round", normalizedRound);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    initializedRoundProjectRef.current = project.id;
  }, [assetView, loading, project, showV2Tab]);

  useEffect(() => {
    if (assetDataLoading || !project || assetRouteAllowed) return;
    router.replace(`/photographer/projects/${id}`);
  }, [assetDataLoading, assetRouteAllowed, id, project, router]);

  useEffect(() => {
    setSelectedVersionIds(new Set());
  }, [stageTab]);

  useEffect(() => {
    const deletionAllowed = project?.status === "editing" || project?.status === "editing_v2";
    if (deletionAllowed) return;
    setSelectedVersionIds((current) => current.size === 0 ? current : new Set());
    setMobileSelectionMode(false);
    setDeleteConfirmOpen(false);
  }, [project?.status]);

  useEffect(() => {
    const lockedIds = new Set(
      rows.flatMap((row) => [row.v1, row.v2])
        .filter((version) => version?.reviewStatus === "approved")
        .map((version) => version!.id),
    );
    if (lockedIds.size === 0) return;
    setSelectedVersionIds((current) => {
      if (![...current].some((id) => lockedIds.has(id))) return current;
      return new Set([...current].filter((id) => !lockedIds.has(id)));
    });
  }, [rows]);

  const counts = useMemo(() => {
    const delivered = project?.status === "delivered";
    const effV1 = (s: string | null) =>
      s === "approved" || s === "revision_requested" ? s : delivered ? "approved" : "pending";
    return {
      total:      rows.length,
      v1Uploaded: rows.filter((r) => r.v1 !== null).length,
      v1Approved: rows.filter((r) => effV1(r.v1?.reviewStatus ?? null) === "approved").length,
      v1Revision: rows.filter((r) => effV1(r.v1?.reviewStatus ?? null) === "revision_requested").length,
      v2Uploaded: rows.filter((r) => r.v2 !== null).length,
    };
  }, [rows, project?.status]);

  // 첫 보정본이 없는 프로젝트의 첫 진입에서만 기존 일괄 업로드 패널을 안내한다.
  // 파일 선택창은 사용자가 패널 안의 CTA를 눌렀을 때만 열며, 같은 탭 세션에서는 반복 노출하지 않는다.
  useEffect(() => {
    if (
      !isActive ||
      assetView !== "retouched" ||
      loading ||
      error ||
      !project ||
      project.status !== "editing" ||
      rows.length === 0 ||
      counts.v1Uploaded > 0 ||
      uploadingVersionKeys.size > 0
    ) return;

    const promptKey = getInitialRetouchUploadPromptKey(project.id);
    if (initialUploadPromptRef.current === promptKey) return;
    try {
      if (sessionStorage.getItem(promptKey) === "shown") return;
      sessionStorage.setItem(promptKey, "shown");
    } catch {
      // storage가 막힌 환경에서도 현재 마운트에서는 한 번만 노출한다.
    }
    initialUploadPromptRef.current = promptKey;
    setPanelVersion((current) => current ?? 1);
  }, [assetView, counts.v1Uploaded, error, isActive, loading, project, rows.length, uploadingVersionKeys.size]);

  const filteredRows = useMemo(() => {
    const delivered = project?.status === "delivered";
    const effV1 = (s: string | null) =>
      s === "approved" || s === "revision_requested" ? s : delivered ? "approved" : "pending";
    const stageRows = stageTab === "final"
      ? rows.filter((row) => getFinalVersion(row, delivered) !== null)
      : stageTab === "v2"
        ? rows.filter((r) => effV1(r.v1?.reviewStatus ?? null) === "revision_requested")
        : rows;
    switch (filter) {
      case "approved":
        return stageRows.filter((r) =>
          stageTab === "v2"
            ? r.v2?.reviewStatus === "approved"
            : effV1(r.v1?.reviewStatus ?? null) === "approved",
        );
      case "revision":
        return stageRows.filter((r) =>
          stageTab === "v2"
            ? r.v2?.reviewStatus === "revision_requested"
            : effV1(r.v1?.reviewStatus ?? null) === "revision_requested",
        );
      case "v1_pending": return rows.filter((r) => r.v1 === null);
      case "v2_pending":
        return stageRows.filter(
          (r) =>
            effV1(r.v1?.reviewStatus ?? null) === "revision_requested" &&
            r.v2 === null,
        );
      default:           return stageRows;
    }
  }, [rows, filter, project?.status, stageTab]);

  // 필터된 행의 photoId → viewer 인덱스 매핑 (전체 rows 렌더 시 올바른 뷰어 인덱스 전달용)
  const filteredIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((row, i) => map.set(row.photo.id, i));
    return map;
  }, [filteredRows]);

  const activeViewerRow = filteredRows[viewerIdx] ?? null;
  const activeFinalVersion = activeViewerRow && viewerTab === "final"
    ? getFinalVersion(activeViewerRow, project?.status === "delivered")
    : null;
  const activeArchivedVersion = activeViewerRow?.history.find(
    (history) => history.id === viewerHistoryId,
  ) ?? (activeFinalVersion?.archived ? activeFinalVersion.info as VersionHistoryInfo : null);
  const archivedViewerTab: StageTab | null = activeArchivedVersion
    ? activeArchivedVersion.version === 2 ? "v2" : "v1"
    : null;
  const resolvedViewerTab: Exclude<StageTab, "final"> = archivedViewerTab ?? (!activeViewerRow
    ? viewerTab === "final" ? "original" : viewerTab
    : viewerTab === "final"
      ? activeFinalVersion?.version === 2 ? "v2" : activeFinalVersion?.version === 1 ? "v1" : "original"
    : viewerTab === "v2" && !activeViewerRow.v2
      ? activeViewerRow.v1 ? "v1" : "original"
      : viewerTab === "v1" && !activeViewerRow.v1
        ? "original"
        : viewerTab);
  const viewerPhotos = useMemo(() => filteredRows.map((row, index) => {
    const finalVersion = viewerTab === "final" && viewerHistoryId === null
      ? getFinalVersion(row, project?.status === "delivered")
      : null;
    const archivedVersion = index === viewerIdx ? activeArchivedVersion : null;
    const version = finalVersion?.info ?? archivedVersion
      ?? (resolvedViewerTab === "v2" ? row.v2 : resolvedViewerTab === "v1" ? row.v1 : null);
    if (!version) return row.photo;
    const versionNumber = finalVersion?.version ?? archivedVersion?.version ?? (resolvedViewerTab === "v2" ? 2 : 1);
    const isArchived = Boolean(finalVersion?.archived || archivedVersion);
    return {
      ...row.photo,
      url: isArchived
        ? version.thumbUrl
        : getVersionUrl(version.thumbUrl, row.photo.id, versionNumber),
      previewUrl: isArchived
        ? version.url
        : getVersionUrl(version.url, row.photo.id, versionNumber),
      originalFilename: version.filename
        ? formatPhotoDisplayFilename(version.filename)
        : getPhotoDisplayFilename(row.photo, index),
    };
  }), [activeArchivedVersion, filteredRows, getVersionUrl, project?.status, resolvedViewerTab, viewerHistoryId, viewerIdx, viewerTab]);
  const originalViewerPhotos = useMemo(
    () => filteredRows.map((row) => row.photo),
    [filteredRows],
  );
  const activeStageReviewVersion = !activeViewerRow
    ? null
    : stageTab === "v2"
      ? activeViewerRow.v2
      : stageTab === "v1"
        ? activeViewerRow.v1
        : null;
  const currentStageReviewComment = activeStageReviewVersion?.reviewStatus === "revision_requested"
    ? activeStageReviewVersion.comment?.trim() ?? null
    : null;
  const activeViewerV2Round = activeViewerRow
    ? Math.max(
        0,
        ...activeViewerRow.history
          .filter((item) => item.version === 2)
          .map((item) => item.revisionNo),
      ) + 1
    : 1;
  const activeViewerHistoryItems = useMemo<PhotoVersionHistoryItem[]>(() => {
    if (!activeViewerRow) return [];

    const statusFor = (version: VersionInfo, tab: "v1" | "v2") => {
      if (version.reviewStatus === "approved") {
        return { statusLabel: "확정", statusTone: "success" as const };
      }
      if (version.reviewStatus === "revision_requested") {
        return { statusLabel: "재보정 요청", statusTone: "attention" as const };
      }
      const reviewing = tab === "v2"
        ? project?.status === "reviewing_v2"
        : project?.status === "reviewing_v1";
      return reviewing
        ? { statusLabel: "고객 검토 중", statusTone: "reviewing" as const }
        : { statusLabel: "업로드 완료", statusTone: "neutral" as const };
    };
    const items: PhotoVersionHistoryItem[] = [];
    if (activeViewerRow.v2) {
      items.push({
        key: "v2",
        label: `재보정본 ${activeViewerV2Round}차`,
        filename: activeViewerRow.v2.filename
          ? formatPhotoDisplayFilename(activeViewerRow.v2.filename)
          : "파일명 정보 없음",
        thumbnailUrl: getVersionUrl(activeViewerRow.v2.thumbUrl, activeViewerRow.photo.id, 2),
        uploadedAt: activeViewerRow.v2.createdAt,
        ...statusFor(activeViewerRow.v2, "v2"),
        hasComment: Boolean(activeViewerRow.v2.comment?.trim()),
      });
    }
    for (const history of activeViewerRow.history.filter((item) => item.version === 2)) {
      items.push({
        key: `history:${history.id}`,
        label: `재보정본 ${history.revisionNo}차`,
        filename: history.filename
          ? formatPhotoDisplayFilename(history.filename)
          : "파일명 정보 없음",
        thumbnailUrl: history.thumbUrl,
        uploadedAt: history.createdAt,
        statusLabel: history.reviewStatus === "approved"
          ? "확정 후 교체"
          : history.reviewStatus === "revision_requested"
            ? "재보정 요청 후 교체"
            : "교체됨",
        statusTone: history.reviewStatus === "approved"
          ? "success"
          : history.reviewStatus === "revision_requested"
            ? "attention"
            : "neutral",
        hasComment: Boolean(history.comment?.trim()),
      });
    }
    if (activeViewerRow.v1) {
      items.push({
        key: "v1",
        label: "보정본",
        filename: activeViewerRow.v1.filename
          ? formatPhotoDisplayFilename(activeViewerRow.v1.filename)
          : "파일명 정보 없음",
        thumbnailUrl: getVersionUrl(activeViewerRow.v1.thumbUrl, activeViewerRow.photo.id, 1),
        uploadedAt: activeViewerRow.v1.createdAt,
        ...statusFor(activeViewerRow.v1, "v1"),
        hasComment: Boolean(activeViewerRow.v1.comment?.trim()),
      });
    }
    for (const history of activeViewerRow.history.filter((item) => item.version === 1)) {
      items.push({
        key: `history:${history.id}`,
        label: `이전 보정본 ${history.revisionNo}`,
        filename: history.filename
          ? formatPhotoDisplayFilename(history.filename)
          : "파일명 정보 없음",
        thumbnailUrl: history.thumbUrl,
        uploadedAt: history.createdAt,
        statusLabel: history.reviewStatus === "approved"
          ? "확정 후 교체"
          : history.reviewStatus === "revision_requested"
            ? "재보정 요청 후 교체"
            : "교체됨",
        statusTone: history.reviewStatus === "approved"
          ? "success"
          : history.reviewStatus === "revision_requested"
            ? "attention"
            : "neutral",
        hasComment: Boolean(history.comment?.trim()),
      });
    }
    items.push({
      key: "original",
      label: "원본",
      filename: getPhotoDisplayFilename(activeViewerRow.photo, viewerIdx),
      thumbnailUrl: activeViewerRow.photo.url,
      uploadedAt: activeViewerRow.photo.createdAt ?? null,
      statusLabel: "최초 업로드",
      statusTone: "neutral",
      hasComment: Boolean(activeViewerRow.photo.comment?.trim()),
    });
    return items;
  }, [activeViewerRow, activeViewerV2Round, getVersionUrl, project?.status, viewerIdx]);
  const activeViewerHistoryKey: PhotoVersionHistoryKey = activeArchivedVersion
    ? `history:${activeArchivedVersion.id}`
    : resolvedViewerTab;
  const activeViewerHistoryIndex = activeViewerHistoryItems.findIndex(
    (item) => item.key === activeViewerHistoryKey,
  );
  const activeViewerComparisonItem = viewerCompareOriginal
    ? activeViewerHistoryItems.find((item) => item.key === "original") ?? null
    : activeViewerHistoryIndex >= 0
    ? activeViewerHistoryItems[activeViewerHistoryIndex + 1] ?? null
    : null;
  const activeViewerComparisonPhotos = useMemo(() => filteredRows.map((row, index) => {
    if (index !== viewerIdx || !activeViewerComparisonItem) return row.photo;

    const key = activeViewerComparisonItem.key;
    if (key === "original") return row.photo;
    const archivedVersion = key.startsWith("history:")
      ? row.history.find((item) => `history:${item.id}` === key) ?? null
      : null;
    const currentVersion = key === "v1" ? row.v1 : key === "v2" ? row.v2 : null;
    const version = archivedVersion ?? currentVersion;
    if (!version) return row.photo;
    const versionNumber: 1 | 2 = archivedVersion?.version ?? (key === "v2" ? 2 : 1);
    return {
      ...row.photo,
      url: archivedVersion
        ? version.thumbUrl
        : getVersionUrl(version.thumbUrl, row.photo.id, versionNumber),
      previewUrl: archivedVersion
        ? version.url
        : getVersionUrl(version.url, row.photo.id, versionNumber),
      originalFilename: version.filename
        ? formatPhotoDisplayFilename(version.filename)
        : getPhotoDisplayFilename(row.photo, index),
    };
  }), [activeViewerComparisonItem, filteredRows, getVersionUrl, viewerIdx]);

  const activeVersionsByPhotoId = useMemo(() => {
    const map = new Map<string, VersionInfo | null>();
    filteredRows.forEach((row) => {
      const finalVersion = stageTab === "final"
        ? getFinalVersion(row, project?.status === "delivered")
        : null;
      const version = finalVersion?.info ?? (stageTab === "v2"
        ? (row.v2 ?? (row.v1?.reviewStatus === "approved" ? row.v1 : null))
        : stageTab === "v1"
          ? row.v1
          : null);
      map.set(row.photo.id, version);
    });
    return map;
  }, [filteredRows, project?.status, stageTab]);

  const retouchedListPhotos = useMemo(
    () => filteredRows.map((row) => row.photo),
    [filteredRows],
  );
  const retouchedPreviewsByPhotoId = useMemo(() => {
    const map = new Map<string, Photo>();
    filteredRows.forEach((row) => {
      const version = activeVersionsByPhotoId.get(row.photo.id);
      if (!version || stageTab === "original") return;
      const finalVersion = stageTab === "final"
        ? getFinalVersion(row, project?.status === "delivered")
        : null;
      const versionNumber = finalVersion?.version ?? (stageTab === "v2" ? 2 : 1);
      map.set(row.photo.id, {
        ...row.photo,
        url: finalVersion?.archived
          ? version.thumbUrl
          : getVersionUrl(version.thumbUrl, row.photo.id, versionNumber),
      });
    });
    return map;
  }, [activeVersionsByPhotoId, filteredRows, getVersionUrl, project?.status, stageTab]);

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
      const finalSelection = stageTab === "final"
        ? getFinalVersion(row, project?.status === "delivered")
        : null;
      const ver = finalSelection?.info ?? (version === 2 ? row.v2 : row.v1);
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
      : stageTab === "final"
        ? `${project?.name ?? "project"}_최종본목록.csv`
      : `${project?.name ?? "review"}_v${version}_검토결과.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [rows, stageTab, project?.name, project?.status]);

  const handleDownloadSelectedOriginals = useCallback(async () => {
    setExportMessage(null);
    try {
      const result = await downloadSelectedPhotosToDirectory({
        projectId: id,
        includeOriginal: Boolean(project?.includeOriginal),
        expectedCount: rows.length,
        onDirectoryReady: () => setShowExportMenu(false),
        onProgress: (completed, total) => setOriginalDownloadProgress({ completed, total }),
      });
      if (!result) return;
      setExportMessage({
        tone: "success",
        text: `${result.downloadKind === "preview" ? "셀렉 프리뷰" : "셀렉 원본"} ${result.fileCount.toLocaleString()}개를 선택한 폴더에 저장했습니다.`,
      });
    } catch (error) {
      setExportMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "셀렉 원본 다운로드에 실패했습니다.",
      });
    } finally {
      setOriginalDownloadProgress(null);
    }
  }, [id, project?.includeOriginal, rows.length]);

  function openViewer(idx: number, tab: StageTab, compareOriginal = false) {
    setViewerIdx(idx);
    setViewerTab(tab);
    setViewerHistoryId(null);
    setViewerCompare(compareOriginal);
    setViewerCompareOriginal(compareOriginal);
    setViewerOpen(true);
  }

  function toggleVersionSelection(versionId: string) {
    const deletionAllowed =
      (stageTab === "v1" && project?.status === "editing") ||
      (stageTab === "v2" && project?.status === "editing_v2");
    if (!deletionAllowed || deletingSelection) return;
    if (rows.some((row) => row.v2?.id === versionId && isReviewedRetouch(row))) return;
    const version = rows.flatMap((row) => [row.v1, row.v2]).find((item) => item?.id === versionId);
    if (!version || version.reviewStatus === "approved") return;
    setSelectedVersionIds((current) => {
      const next = new Set(current);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  }

  function handleDeleteSelected() {
    const deletionAllowed =
      (stageTab === "v1" && project?.status === "editing") ||
      (stageTab === "v2" && project?.status === "editing_v2");
    if (!deletionAllowed) {
      setSelectedVersionIds(new Set());
      setMobileSelectionMode(false);
      return;
    }
    const selectedCount = selectedVersionIds.size;
    if (selectedCount === 0) return;
    setDeleteConfirmOpen(true);
  }

  async function executeDeleteSelected() {
    const version = stageTab === "v2" ? 2 : 1;
    const deletionAllowed =
      (version === 1 && project?.status === "editing") ||
      (version === 2 && project?.status === "editing_v2");
    if (!deletionAllowed) {
      setSelectedVersionIds(new Set());
      setMobileSelectionMode(false);
      setDeleteConfirmOpen(false);
      return;
    }
    const targets = rows.flatMap((row) => {
      const item = version === 2 ? row.v2 : row.v1;
      return item && item.reviewStatus !== "approved" && !(version === 2 && isReviewedRetouch(row)) && selectedVersionIds.has(item.id)
        ? [{ versionId: item.id, photoId: row.photo.id }]
        : [];
    });
    if (targets.length === 0) return;

    setDeletingSelection(true);
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const res = await fetch(
          `/api/photographer/projects/${id}/versions/${target.versionId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "삭제 실패");
        }
        return target;
      }),
    );

    const deleted = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const deletedIds = new Set(deleted.map((target) => target.versionId));
    const deletedPhotoIds = new Set(deleted.map((target) => target.photoId));
    setRows((current) =>
      current.map((row) =>
        deletedPhotoIds.has(row.photo.id)
          ? { ...row, [version === 1 ? "v1" : "v2"]: null }
          : row,
      ),
    );
    setSelectedVersionIds((current) => {
      const next = new Set(current);
      deletedIds.forEach((versionId) => next.delete(versionId));
      return next;
    });
    setDeletingSelection(false);

    if (deleted.length > 0) {
      void loadData({ force: true });
    }

    const failedCount = results.length - deleted.length;
    if (failedCount > 0) {
      alert(`${deleted.length}장은 삭제했고, ${failedCount}장은 삭제하지 못했습니다. 다시 시도해주세요.`);
    }
  }

  async function deleteVersionFromUploadPanel(
    photoId: string,
    versionId: string,
    version: 1 | 2,
  ) {
    const row = rows.find((item) => item.photo.id === photoId);
    if (version === 2 && (!row || isReviewedRetouch(row))) {
      throw new Error("고객 검토 이력이 있는 사진은 교체만 가능합니다.");
    }
    const deletionAllowed =
      (version === 1 && project?.status === "editing") ||
      (version === 2 && project?.status === "editing_v2");
    if (!deletionAllowed) {
      throw new Error("고객 검토 중에는 보정본을 삭제할 수 없습니다.");
    }
    const res = await fetch(
      `/api/photographer/projects/${id}/versions/${versionId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "보정본을 삭제하지 못했습니다.");
    }

    setRows((current) =>
      current.map((row) =>
        row.photo.id === photoId
          ? { ...row, [version === 1 ? "v1" : "v2"]: null }
          : row,
      ),
    );
    setSelectedVersionIds((current) => {
      const next = new Set(current);
      next.delete(versionId);
      return next;
    });
    void loadData({ force: true });
  }

  async function replaceVersion(photoId: string, version: 1 | 2, file: File) {
    const currentVersion = rows.find((row) => row.photo.id === photoId)?.[version === 1 ? "v1" : "v2"];
    if (currentVersion?.reviewStatus === "approved") {
      alert("고객이 확정한 사진은 교체할 수 없습니다.");
      return false;
    }
    const uploadKey = getVersionUploadKey(photoId, version);
    if (uploadingVersionKeysRef.current.has(uploadKey)) return false;
    if (panelVersion !== null) return false;
    uploadingVersionKeysRef.current.add(uploadKey);
    setUploadingVersionKeys(new Set(uploadingVersionKeysRef.current));
    let deliveryMetadata: DeliveryVersionUpload[] = [];
    let uploadToken = "";
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      uploadToken = token;

      // 원본 전달 파일 업로드와 화면용 프리뷰 압축은 서로 독립적이므로 동시에 준비한다.
      const [deliveryResult, compressionResult] = await Promise.allSettled([
        uploadDeliveryVersions({
          projectId: id,
          version,
          token,
          files: [{ photoId, file }],
        }),
        compressImageForUpload(file),
      ]);
      if (deliveryResult.status === "fulfilled") deliveryMetadata = deliveryResult.value;
      if (deliveryResult.status === "rejected") throw deliveryResult.reason;
      if (compressionResult.status === "rejected") throw compressionResult.reason;
      const compressed = compressionResult.value;
      const form = new FormData();
      form.append("project_id", id);
      form.append("version", String(version));
      form.append("photo_ids", photoId);
      form.append("delivery_metadata", JSON.stringify(deliveryMetadata));
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
      // 여러 장을 연속 업로드해도 각 요청마다 전체 목록을 다시 읽지 않도록 갱신을 합친다.
      scheduleVersionRefresh();
      return true;
    } catch (e) {
      if (deliveryMetadata.length > 0 && uploadToken) {
        await abandonDeliveryVersions({ projectId: id, version, token: uploadToken, items: deliveryMetadata });
      }
      alert(e instanceof Error ? e.message : "교체 실패");
      return false;
    } finally {
      uploadingVersionKeysRef.current.delete(uploadKey);
      setUploadingVersionKeys(new Set(uploadingVersionKeysRef.current));
    }
  }

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (assetDataLoading) {
    return (
      <div data-photographer-viewport-page className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <PageLoader text="프로젝트 불러오는 중" />
        </div>
      </div>
    );
  }

  if (assetDataError || !project) {
    return (
      <div data-photographer-viewport-page className="h-screen bg-background flex flex-col items-center justify-center gap-4">
        <span className="text-accent text-sm">{assetDataError ?? "프로젝트를 찾을 수 없습니다."}</span>
        <button
          onClick={() => router.push(`/photographer/projects`)}
          className="text-sm text-muted-foreground border border-border-subtle px-4 py-2 rounded-xl hover:text-foreground hover:border-border-strong transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (!assetRouteAllowed) {
    return (
      <div data-photographer-viewport-page className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <PageLoader text="프로젝트 상세로 이동하는 중" />
        </div>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const inV2Phase     = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const v2Dimmed      = showV2Tab && !inV2Phase;
  const canDeleteV1   = project.status === "editing";
  const canDeleteV2   = project.status === "editing_v2";
  const isSelecting   = project.status === "selecting";
  const isEditing     = project.status === "editing";
  const isEditingV2   = project.status === "editing_v2";
  const isReviewingV1 = project.status === "reviewing_v1";
  const isReviewingV2 = project.status === "reviewing_v2";
  const canUploadV1   = project.status === "editing" || project.status === "reviewing_v1";
  const canUploadV2   = project.status === "editing_v2" || project.status === "reviewing_v2";
  const activeCanSelect = stageTab === "v1" ? canDeleteV1 : stageTab === "v2" ? canDeleteV2 : false;

  const selectableVersionIds = filteredRows.flatMap((row) => {
    const version = stageTab === "v2" ? row.v2 : stageTab === "v1" ? row.v1 : null;
    return version && version.reviewStatus !== "approved" && !(stageTab === "v2" && isReviewedRetouch(row)) ? [version.id] : [];
  });
  const someSelectableSelected = selectableVersionIds.some((versionId) => selectedVersionIds.has(versionId));
  const allSelectableSelected =
    selectableVersionIds.length > 0 &&
    selectableVersionIds.every((versionId) => selectedVersionIds.has(versionId));

  function toggleAllSelectable() {
    if (!activeCanSelect || deletingSelection || selectableVersionIds.length === 0) return;
    setSelectedVersionIds((current) => {
      const next = new Set(current);
      if (allSelectableSelected) {
        selectableVersionIds.forEach((versionId) => next.delete(versionId));
      } else {
        selectableVersionIds.forEach((versionId) => next.add(versionId));
      }
      return next;
    });
  }

  /** delivered + 리뷰 행 없음: 구버전 일괄 제출 등. 그 외 단계에서 null은 확정으로 보지 않는다. */
  const effectiveV1Status = (s: string | null): "approved" | "revision_requested" | "pending" | "uploaded" =>
    s === "approved" || s === "revision_requested"
      ? s
      : project.status === "delivered"
        ? "approved"
        : project.status === "editing"
          ? "uploaded"   // 검토 요청 전 — 뱃지 없이 표시
          : "pending";   // reviewing_v1 이상에서만 "검토 대기"

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
  const selectionIsFinal = !["preparing", "selecting"].includes(project.status);
  const canDownloadSelectedOriginals = selectionIsFinal;
  const selectedOriginalDisabledReason = !selectionIsFinal
    ? "고객 셀렉 확정 후 이용 가능"
    : null;
  const selectedDownloadLabel = project.includeOriginal ? "셀렉 원본" : "셀렉 프리뷰";

  const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: stageTab === "final" ? finalRows.length : stageTab === "v2" ? v2Total : counts.total },
    ...(stageTab === "v1" && counts.v1Approved > 0
      ? [{ key: "approved" as FilterTab, label: "확정", count: counts.v1Approved }]
      : []),
    ...(stageTab === "v1" && counts.v1Revision > 0
      ? [
          { key: "revision" as FilterTab, label: "재보정 요청", count: counts.v1Revision },
        ]
      : []),
    ...(stageTab === "v1" && counts.total - counts.v1Uploaded > 0
      ? [{ key: "v1_pending" as FilterTab, label: "미업로드", count: counts.total - counts.v1Uploaded }]
      : []),
    ...(stageTab === "v2" && showV2Tab && v2PendingCount > 0
      ? [{ key: "v2_pending" as FilterTab, label: "미업로드", count: v2PendingCount }]
      : []),
  ];

  // 처리할 재보정 요청을 확정 항목보다 먼저 찾도록 표시 순서만 정리한다.
  FILTER_TABS.sort((a, b) => (a.key === "all" ? 0 : a.key === "revision" ? 1 : 2) - (b.key === "all" ? 0 : b.key === "revision" ? 1 : 2));

  // V1 panel targets: 확정되지 않은 셀렉 사진 (기존 V1 교체는 buildVersionMapping 이 처리)
  const v1Targets: UploadPanelTarget[] = rows
    .filter((r) => r.v1?.reviewStatus !== "approved")
    .map((r) => ({
      id: r.photo.id,
      photo: r.photo,
      filename: r.photo.originalFilename ?? `#${r.photo.orderIndex}`,
      comment: r.photo.comment ?? null,
      serverRetouchUrl: r.v1?.url ?? null,
      serverVersionId: r.v1?.id ?? null,
    }));

  // V2 panel targets: V1 재보정 요청 중 현재 V2가 확정되지 않은 사진만
  const v2Targets: UploadPanelTarget[] = rows
    .filter((r) =>
      effectiveV1Status(r.v1?.reviewStatus ?? null) === "revision_requested" &&
      r.v2?.reviewStatus !== "approved"
    )
    .map((r) => ({
      id: r.photo.id,
      photo: r.photo,
      filename: r.photo.originalFilename ?? `#${r.photo.orderIndex}`,
      comment: r.v1?.comment ?? null,
      v1Url: r.v1?.url ?? null,
      serverRetouchUrl: r.v2?.url ?? null,
      serverVersionId: r.v2?.id ?? null,
      deleteLocked: isReviewedRetouch(r),
    }));

  const footerNote = (() => {
    if (stageTab === "v1" && (isEditingV2 || project.status === "reviewing_v2")) return "1차 보정 검토 완료";
    const base = getFooterNote(project.status);
    if (base) return base;
    if (isEditing && counts.total > 0 && !canStartV1Review)
      return `보정본 ${counts.v1Uploaded} / ${counts.total}장 업로드됨`;
    if (isEditingV2 && v2Total > 0 && !canStartV2Review)
      return `재보정본 ${counts.v2Uploaded} / ${v2Total}장 업로드됨`;
    return null;
  })();
  const activeUploadCount = stageTab === "final" ? finalRows.length : stageTab === "v2" ? counts.v2Uploaded : counts.v1Uploaded;
  const activeUploadTotal = stageTab === "final" ? finalRows.length : stageTab === "v2" ? v2Total : counts.total;
  const activeUploadRemaining = Math.max(0, activeUploadTotal - activeUploadCount);
  const activeCanUpload = stageTab === "v2" ? canUploadV2 : canUploadV1;
  const activeUploadDisabledReason = activeCanUpload
    ? undefined
    : project.status === "delivered"
      ? "납품 완료 후에는 보정본을 변경할 수 없습니다"
      : stageTab === "v2" && !showV2Tab
        ? "재보정 단계가 시작된 뒤 업로드할 수 있습니다"
        : "현재 단계에서는 보정본을 업로드할 수 없습니다";
  const v1UploadRemaining = Math.max(0, counts.total - counts.v1Uploaded);
  const v2UploadRemaining = Math.max(0, v2Total - counts.v2Uploaded);
  const activeUploadComplete = activeUploadTotal > 0 && activeUploadRemaining === 0;
  const workflowUploadVersion: 1 | 2 = stageTab === "v2" ? 2 : 1;
  const isActiveRoundEditing = (stageTab === "v1" && isEditing) || (stageTab === "v2" && isEditingV2);
  const workflowUploadLabel = workflowUploadVersion === 2 ? "재보정본" : "보정본";
  const workflowUploadCount = workflowUploadVersion === 2 ? counts.v2Uploaded : counts.v1Uploaded;
  const workflowUploadTotal = workflowUploadVersion === 2 ? v2Total : counts.total;
  const workflowUploadRemaining = workflowUploadVersion === 2 ? v2UploadRemaining : v1UploadRemaining;
  const workflowUploadComplete = workflowUploadTotal > 0 && workflowUploadRemaining === 0;
  const workflowNeedsReplacement = workflowUploadVersion === 2 && v2RevisionPending > 0;
  // 첫 진입에서는 rows가 아직 비어 있어 업로드 CTA가 잘못 노출될 수 있다.
  // 버전 조회가 끝난 뒤에만 최종 CTA를 결정하고, 후속 갱신 중에는 기존 UI를 유지한다.
  const initialVersionLoading = loading && rows.length === 0;
  const toolbarDataAvailable = !initialVersionLoading && !error;

  function openPanel(v: 1 | 2) {
    setPanelVersion(v);
  }

  function selectRound(nextRound: "v1" | "v2") {
    if (nextRound === "v2" && !showV2Tab) return;
    setSelectedVersionIds(new Set());
    setStageTab(nextRound);
    setFilter("all");
    const url = new URL(window.location.href);
    url.searchParams.delete("stage");
    url.searchParams.set("round", nextRound);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function handleDelivered(uploadedVersion: 1 | 2, uploadedPhotoIds: string[]) {
    if (uploadedPhotoIds.length > 0) {
      const cacheKey = Date.now();
      setVersionBust((current) => {
        const next = { ...current };
        uploadedPhotoIds.forEach((photoId) => {
          next[`${photoId}:${uploadedVersion}`] = cacheKey;
        });
        return next;
      });
    }
    setPanelVersion(null);
    setFilter("all");
    await loadData({ force: true });
    selectRound(uploadedVersion === 2 ? "v2" : "v1");
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
    // 재시도 가능성이 있는 요청이라 이전 실패 문구를 지우고 시작한다.
    setReviewDeadlineModal((m) => (m ? { ...m, error: undefined } : null));
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
      // 로그 기록(실패해도 무시)
      fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: nextStatus }),
      }).catch(() => {});
      // status만 변경 — rows(사진/보정본)는 그대로이므로 loadData() 불필요
      setProject((prev) => prev ? { ...prev, status: nextStatus } : null);
      // 성공 시 같은 모달을 공유 단계로 전환 (작가가 직접 링크 공유)
      setReviewDeadlineModal((m) => (m ? { ...m, stage: "share" } : null));
    } catch (e) {
      // 화면 표시상 "보정본 N장 준비 완료"라도 서버의 최종 납품 처리(delivery_ready_at)가
      // 아직 안 끝났으면 여기서 거절될 수 있다(409). alert()는 닫으면 흔적이 안 남고
      // 모달은 setup 단계 그대로라 재시도 안내조차 안 보인다 — 모달 안에 그대로 남긴다.
      const message = e instanceof Error ? e.message : "고객 검토 시작 실패";
      setReviewDeadlineModal((m) => (m ? { ...m, error: message } : null));
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

  /** CustomerInviteShareModal의 인라인 PIN 편집이 위임하는 저장 — upload 페이지의
   * 같은 콜백과 동일한 계약이다(실패하면 던져서 모달 안 에러 문구로 보여준다). */
  async function handleSavePin(newPin: string | null) {
    if (!project) return;
    const res = await fetch(`/api/photographer/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_pin: newPin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
    setProject((prev) => prev ? { ...prev, accessPin: newPin } : null);
  }

  // 본문 그리드용 카드 인덱스를 viewer 인덱스에 맞추기 위해 filteredRows 사용
  // 원본 갤러리와 동일한 최소 카드 폭(218px)과 간격(12px)을 사용한다.
  // 고정 breakpoint 상한을 두지 않아 넓은 화면에서는 7열 이상도 자연스럽게 표시된다.
  const cardCols = styles.assetGrid;

  return (
    <div
      data-photographer-viewport-page
      className="h-screen flex flex-col overflow-hidden bg-background text-foreground"
      style={{ fontFamily: "var(--font-pretendard, 'Pretendard Variable', 'Pretendard', -apple-system, sans-serif)" }}
    >
      <ProjectAssetWorkspaceHeader
        project={project}
        activeTab={assetView}
        originalCount={photos.length}
        selectedCount={selectedIds.size}
        compact={compactHeader}
        tabTrailing={assetView === "retouched" && showV2Tab ? (
          <>
            <div data-retouch-stage-stepper role="group" aria-label="보정 단계" className="hidden h-8 items-center gap-1 pl-1 md:flex">
              <button type="button" data-retouch-round="v1" data-viewed={stageTab === "v1" ? "true" : "false"} aria-pressed={stageTab === "v1"} onClick={() => selectRound("v1")} className={`h-8 px-2 text-[13px] font-semibold leading-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${stageTab === "v1" ? "text-accent" : "text-muted-foreground"}`}>
                1차 보정
              </button>
              <span className="text-[12px] text-disabled-foreground" aria-hidden>·</span>
              <button type="button" data-retouch-round="v2" data-viewed={stageTab === "v2" ? "true" : "false"} aria-current="step" aria-pressed={stageTab === "v2"} onClick={() => selectRound("v2")} className={`flex h-8 items-center gap-1.5 px-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${stageTab === "v2" ? "font-bold text-accent" : "font-semibold text-foreground"}`}>
                <span>재보정</span>
                {isV2ProjectPhase && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
                    <span className="text-[10px] font-medium text-cyan">진행 중</span>
                  </>
                )}
              </button>
            </div>
            <button type="button" data-mobile-retouch-stage-trigger onClick={() => setMobileRoundOpen(true)} className="flex h-10 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-foreground md:hidden" aria-haspopup="dialog" aria-expanded={mobileRoundOpen}>
              {stageTab === "v2" ? "2/2 재보정" : "1/2 1차 보정"}<ChevronDown size={14} className="text-muted-foreground" aria-hidden />
            </button>
          </>
        ) : undefined}
      />

      {/* ── Retouch work toolbar ── */}
      {!isSelecting && (
        <ProjectAssetWorkspaceToolbar
          ariaLabel={assetView === "final" ? "최종본 작업 도구" : "보정본 작업 도구"}
          compactMobile
          leading={(
            <>
              <div className="flex min-w-0 items-center gap-1 md:gap-3">
                {viewMode === "gallery" && activeCanSelect && selectableVersionIds.length > 0 ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-label="현재 목록 보정본 전체 선택"
                    aria-checked={allSelectableSelected ? true : someSelectableSelected ? "mixed" : false}
                    disabled={deletingSelection}
                    className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-transparent px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30 disabled:opacity-45 md:hidden"
                    onClick={() => { setMobileSelectionMode(!allSelectableSelected); toggleAllSelectable(); }}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded border ${someSelectableSelected ? "border-accent bg-accent text-white" : "border-border-strong bg-surface text-transparent"}`}>
                      {allSelectableSelected ? <Check size={12} strokeWidth={3} /> : someSelectableSelected ? <span className="h-0.5 w-2 rounded-full bg-white" /> : null}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">전체</span>
                  </button>
                ) : null}
                {selectedVersionIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => { setSelectedVersionIds(new Set()); setMobileSelectionMode(false); }}
                    aria-label="선택 해제"
                    className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground md:inline-flex transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    <X size={14} />
                    선택 해제
                  </button>
                ) : activeCanSelect && selectableVersionIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleAllSelectable}
                    aria-label={allSelectableSelected ? "현재 목록 전체 선택 해제" : "현재 목록 전체 선택"}
                    aria-pressed={allSelectableSelected}
                    disabled={deletingSelection}
                    className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-45 md:flex"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      allSelectableSelected ? "border-accent bg-accent text-white" : "border-border-strong bg-surface text-transparent"
                    }`}>
                      <Check size={11} strokeWidth={3} />
                    </span>
                    전체 선택
                  </button>
                ) : null}
                <div className="min-w-0">
              {initialVersionLoading ? (
                <div className={assetView === "retouched" ? "hidden" : ""}>
                  <ProjectAssetToolbarSummary label="보정본 불러오는 중" />
                </div>
              ) : selectedVersionIds.size > 0 ? (
                <div className="hidden items-center gap-3 md:flex">
                  <ProjectAssetToolbarSummary label={`${selectedVersionIds.size.toLocaleString()}장 선택됨`} />
                  {!allSelectableSelected ? (
                    <button
                      type="button"
                      onClick={toggleAllSelectable}
                      className="hidden h-7 rounded-md px-2 text-[12px] font-medium text-muted-foreground md:block hover:bg-surface-raised hover:text-foreground"
                    >
                      전체 선택
                    </button>
                  ) : null}
                </div>
              ) : assetView === "final" ? (
                <ProjectAssetToolbarSummary label="최종 확정본" count={`${finalRows.length.toLocaleString()}장`} meta="사진별 마지막 확정 버전" metaClassName="max-md:hidden" />
              ) : (
                <>
                  <span className="truncate whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground md:hidden">
                    {activeUploadCount}/{activeUploadTotal}장 업로드
                  </span>
                  <div className="hidden items-center gap-2.5 whitespace-nowrap md:flex">
                    {/* 업로드 수량은 한 문장과 진행 막대로 묶어 중복 집계를 줄인다. */}
                    <span className="text-[12px] text-muted-foreground">
                      업로드 <strong className="font-semibold tabular-nums text-foreground">{activeUploadCount} / {activeUploadTotal}장</strong>
                    </span>
                    <div
                      role="progressbar"
                      aria-label={`${stageTab === "v2" ? "재보정" : "1차 보정"} 업로드 진행률`}
                      aria-valuemin={0}
                      aria-valuemax={activeUploadTotal}
                      aria-valuenow={activeUploadCount}
                      className="h-1.5 w-16 overflow-hidden rounded-full bg-border"
                    >
                      <span
                        className="block h-full rounded-full bg-accent transition-[width] duration-300"
                        style={{ width: `${activeUploadTotal > 0 ? Math.min(100, (activeUploadCount / activeUploadTotal) * 100) : 0}%` }}
                      />
                    </div>
                    <span className={`text-[12px] font-semibold tabular-nums ${activeUploadRemaining > 0 ? "text-accent" : "text-muted-foreground"}`}>
                      {activeUploadRemaining > 0 ? `${activeUploadRemaining}장 남음` : "업로드 완료"}
                    </span>
                  </div>
                </>
              )}
                </div>
              </div>

          {/* 회차·업로드 진행과 같은 작업 헤더 안에서 상태 필터를 이어서 제공한다. */}
          {selectedVersionIds.size === 0 && toolbarDataAvailable && assetView === "retouched" && (
            <div className="hidden items-center gap-1 border-l border-border-subtle pl-3 md:flex">
            {FILTER_TABS.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                data-review-filter={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${
                  filter === key
                      ? "bg-surface-raised text-foreground"
                        : key === "revision" || key === "v1_pending" || key === "v2_pending"
                          ? "bg-transparent text-accent hover:bg-accent/[0.06]"
                          : "bg-transparent text-subtle-foreground hover:bg-surface-raised hover:text-muted-foreground"
                }`}
              >
                <span>{label}</span>
                <span className="tabular-nums text-[10px] opacity-75">{count.toLocaleString()}</span>
              </button>
            ))}
            </div>
          )}
            </>
          )}

          actions={(
            <div className="flex shrink-0 items-center gap-2">
            {selectedVersionIds.size === 0 ? (
              <ProjectAssetMobileToolbarActions
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onOpenTools={() => setMobileToolsOpen(true)}
                toolsOpen={mobileToolsOpen}
                toolCount={filter === "all" ? 0 : 1}
                toolsLabel={`${stageTab === "final" ? "최종본" : "보정본"} 필터 설정`}
                onOpenExport={stageTab === "final" && filteredRows.length > 0 ? () => setMobileExportOpen(true) : undefined}
                onCloseExport={() => setMobileExportOpen(false)}
                exportOpen={mobileExportOpen}
                exportLabel={`${stageTab === "final" ? "최종본" : "보정본"} 내보내기`}
                exportContent={stageTab === "final" ? (
                  <div className="grid gap-1">
                    <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
                      <strong className="text-[13px] font-semibold text-foreground">내보내기</strong>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{filteredRows.length.toLocaleString()}장</span>
                    </div>
                    <button type="button" onClick={() => { handleDownloadReview(false); setMobileExportOpen(false); }} className="flex h-11 items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-foreground hover:bg-surface-raised"><Download size={17} className="text-muted-foreground" />파일명 목록 (.csv)</button>
                    <button type="button" onClick={() => { handleDownloadReview(true); setMobileExportOpen(false); }} className="flex h-11 items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-foreground hover:bg-surface-raised"><MessageSquare size={17} className="text-muted-foreground" />코멘트 포함 (.csv)</button>
                    <button
                      type="button"
                      onClick={() => { setMobileExportOpen(false); void handleDownloadSelectedOriginals(); }}
                      disabled={!canDownloadSelectedOriginals || originalDownloadProgress !== null}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download size={17} className="shrink-0 text-accent" />
                      <span className="min-w-0">
                        <strong className="block truncate font-medium">{originalDownloadProgress ? `${selectedDownloadLabel} 저장 중` : `${selectedDownloadLabel} 다운로드`}</strong>
                        <small className="block truncate text-[10px] font-normal text-muted-foreground">{selectedOriginalDisabledReason ?? (project.includeOriginal ? "업로드 원본 그대로" : "확인용 최대 1200px JPEG")}</small>
                      </span>
                    </button>
                  </div>
                ) : undefined}
              />
            ) : null}
            {selectedVersionIds.size === 0 ? (
              <div className="hidden md:block">
                <ProjectAssetToolbarViewToggle value={viewMode} onChange={setViewMode} />
              </div>
            ) : null}
            {selectedVersionIds.size === 0 && rows.length > 0 && (
              <div ref={exportMenuRef} className="relative hidden md:block">
                <ProjectAssetExportTrigger
                  ariaLabel={`${stageTab === "final" ? "최종본" : "보정본"} 내보내기`}
                  open={showExportMenu}
                  onClick={() => setShowExportMenu((v) => !v)}
                />
                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                    <div
                      data-desktop-export-menu
                      className="absolute right-0 top-[48px] z-20 w-[252px] overflow-hidden rounded-[10px] bg-surface p-1.5 shadow-[0_12px_28px_rgba(2,56,82,0.16)]"
                    >
                      <button
                        type="button"
                        onClick={() => { setShowExportMenu(false); handleDownloadReview(false); }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-[7px] px-3 text-left text-[13px] text-foreground transition-colors hover:bg-surface-raised"
                      >
                        <Download size={15} className="shrink-0 text-muted-foreground" />
                        파일명 목록 (.csv)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowExportMenu(false); handleDownloadReview(true); }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-[7px] px-3 text-left text-[13px] text-foreground transition-colors hover:bg-surface-raised"
                      >
                        <Download size={15} className="shrink-0 text-accent" />
                        코멘트 포함 (.csv)
                      </button>
                      <div className="h-px bg-border-subtle mx-3" />
                      <button
                        type="button"
                        onClick={() => { setShowExportMenu(false); void handleDownloadSelectedOriginals(); }}
                        disabled={!canDownloadSelectedOriginals || originalDownloadProgress !== null}
                        className="flex min-h-[58px] w-full items-start gap-2 rounded-[7px] px-3 py-2.5 text-left transition-colors enabled:hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download size={12} className="text-accent shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-foreground">
                            {originalDownloadProgress ? `${selectedDownloadLabel} 저장 중` : `${selectedDownloadLabel} 다운로드`}
                          </span>
                          <span className="block mt-0.5 text-[9px] leading-4 text-subtle-foreground">
                            {selectedOriginalDisabledReason ?? (project.includeOriginal
                              ? `선택된 ${rows.length.toLocaleString()}장 · 업로드 원본 그대로`
                              : `선택된 ${rows.length.toLocaleString()}장 · 확인용 최대 1200px JPEG`)}
                          </span>
                          {!selectedOriginalDisabledReason && !project.includeOriginal && (
                            <span className="block text-[9px] leading-4 text-disabled-foreground">
                              보정·납품용으로는 해상도가 부족할 수 있어요.
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {selectedVersionIds.size === 0 && stageTab !== "final" && toolbarDataAvailable && activeUploadTotal > 0 && activeCanUpload ? (
              <div className="hidden items-center md:flex" title={activeUploadDisabledReason}>
                <ProjectAssetToolbarButton
                  data-workflow-bulk-upload-action
                  onClick={() => openPanel(stageTab === "v2" ? 2 : 1)}
                  disabled={!activeCanUpload}
                  title={activeUploadDisabledReason ?? (activeUploadComplete
                    ? "업로드한 보정본을 일괄 교체합니다"
                    : "남은 보정본을 일괄 업로드합니다")}
                  className="!h-[42px] !border-0 !bg-accent/[0.10] !px-3.5 !text-[13px] !font-semibold !text-accent hover:!bg-accent/[0.16]"
                >
                  {activeUploadComplete ? <SquarePen size={16} /> : <Upload size={16} />}
                  {activeUploadComplete ? "일괄 교체" : "일괄 업로드"}
                </ProjectAssetToolbarButton>
              </div>
            ) : null}
            </div>
          )}
        />
      )}

      <ProjectAssetMobileSheet
        open={!isSelecting && assetView === "retouched" && showV2Tab && mobileRoundOpen}
        onClose={() => setMobileRoundOpen(false)}
        title="보정 단계"
        titleId="mobile-retouch-stage-title"
        closeLabel="보정 단계 닫기"
      >
        <div className="space-y-2 py-5" role="group" aria-label="보정 단계 이동">
          {(["v1", "v2"] as const).map((round) => {
            const selected = stageTab === round;
            const current = round === "v2";
            return (
              <button
                key={round}
                type="button"
                aria-pressed={selected}
                aria-current={current ? "step" : undefined}
                onClick={() => { selectRound(round); setMobileRoundOpen(false); }}
                className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${selected ? "bg-accent/[0.08]" : "bg-transparent"}`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${selected ? "bg-accent text-white" : current ? "border border-cyan text-cyan" : "bg-[var(--stepper-done-node)] text-white"}`}>
                  {current ? "2" : <Check size={13} strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className={`block text-[14px] ${selected ? "text-accent" : "text-foreground"}`}>{round === "v1" ? "1차 보정" : "재보정"}</strong>
                  <small className={`mt-0.5 block text-[11px] ${current ? "text-cyan" : "text-muted-foreground"}`}>{current ? "현재 진행 단계" : "완료된 단계"}</small>
                </span>
                {selected ? <Check size={17} className="text-accent" aria-label="현재 보고 있는 단계" /> : null}
              </button>
            );
          })}
        </div>
      </ProjectAssetMobileSheet>

      <ProjectAssetMobileSheet
        open={!isSelecting && mobileToolsOpen}
        onClose={() => setMobileToolsOpen(false)}
        title={`${stageTab === "final" ? "최종본" : "보정본"} 필터`}
        titleId="mobile-workflow-filter-title"
        closeLabel={`${stageTab === "final" ? "최종본" : "보정본"} 필터 닫기`}
        headerAction={(
          <button
            type="button"
            onClick={() => setFilter("all")}
            disabled={filter === "all"}
            className="h-9 px-2 text-[12px] font-medium text-muted-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-40"
          >
            초기화
          </button>
        )}
      >
        <div className="grid grid-cols-2 gap-2 py-5" role="group" aria-label="사진 상태 필터">
          {FILTER_TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`flex h-11 items-center justify-between rounded-lg border px-3 text-[14px] font-semibold transition-colors ${
                filter === key ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-foreground"
              }`}
            >
              <span>{label}</span>
              <span className="text-[12px] tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMobileToolsOpen(false)}
          className="h-12 w-full rounded-lg bg-accent text-[15px] font-bold text-white"
        >
          완료
        </button>
      </ProjectAssetMobileSheet>

      {(originalDownloadProgress || exportMessage) && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-5 bottom-5 z-[80] max-w-sm rounded-xl border px-4 py-3 shadow-2xl ${
            exportMessage?.tone === "error"
              ? "border-red-500/30 bg-red-950/95 text-red-100"
              : "border-border-strong bg-surface text-foreground"
          }`}
        >
          <div className="flex items-start gap-3">
            <Download size={15} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {originalDownloadProgress
                  ? `${selectedDownloadLabel} 저장 중 · ${originalDownloadProgress.completed.toLocaleString()} / ${originalDownloadProgress.total.toLocaleString()}`
                  : exportMessage?.text}
              </p>
              {originalDownloadProgress && (
                <p className="mt-1 text-[10px] text-subtle-foreground">
                  창을 닫지 마세요. 파일을 한 장씩 선택한 폴더에 저장하고 있어요.
                </p>
              )}
            </div>
            {!originalDownloadProgress && exportMessage && (
              <button
                type="button"
                onClick={() => setExportMessage(null)}
                aria-label="알림 닫기"
                className="text-subtle-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Selecting: waiting screen ── */}
      {isSelecting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl border border-border-subtle bg-surface flex items-center justify-center text-disabled-foreground">
            <Clock size={28} strokeWidth={1.5} />
          </div>
          <div className="text-center flex flex-col gap-2">
            <p className="text-foreground font-semibold">고객이 셀렉 중입니다</p>
            <p className="text-subtle-foreground text-sm">고객 셀렉 완료 후 보정 업로드가 가능합니다</p>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {!isSelecting && (
        <div
          ref={contentScrollRef}
          onScroll={handleAssetScroll}
          data-workflow-asset-scroll
          className={`flex-1 overflow-y-auto scroll-pb-20 md:scroll-pb-48 ${styles.scrollArea}`}
        >
          <div
            data-workflow-asset-content
            className={viewMode === "list"
              ? "mx-auto flex w-full flex-col gap-1 pb-0 md:gap-4 md:pb-52"
              : "mx-auto flex w-full flex-col gap-3 px-4 pb-0 pt-4 md:gap-4 md:px-10 md:pb-52 md:pt-5"}
          >
            {stageTab === "v2" && isEditingV2 && v2RevisionPending > 0 && !reviewNoticeDismissed && (
              <div className={`flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 md:px-4 ${viewMode === "list" ? "mx-4 mt-3 md:mx-10 md:mt-4" : ""}`}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Upload size={16} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
                  <p className="shrink-0 text-sm font-semibold text-foreground">재보정 {v2RevisionPending}장 교체 필요</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground md:mt-0 md:truncate">
                    고객 검토 사진은 교체만 가능하며, 이전 사진과 요청은 이력에 보관됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem(getRetouchReviewNoticeKey(id), "dismissed");
                    setReviewNoticeDismissed(true);
                  }}
                  aria-label="재보정 안내 닫기"
                  className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-subtle-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  <X size={16} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
            )}
            {isEditingV2 && rows.length > 0 && rows.every((r) => !r.v1?.reviewStatus) && (
              <div className={`rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-start gap-3 ${viewMode === "list" ? "mx-4 mt-4 md:mx-10 md:mt-5" : ""}`}>
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
            {initialVersionLoading ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border-subtle bg-surface/40">
                <PageLoader text="보정본 불러오는 중" />
              </div>
            ) : error ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface/50 px-6 text-center">
                <AlertTriangle size={24} className="text-accent" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadData({ force: true })}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-surface-raised"
                >
                  다시 불러오기
                </button>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="bg-surface/50 border border-border-subtle rounded-2xl py-16 flex flex-col items-center justify-center gap-3">
                <Layers size={28} className="text-disabled-foreground" />
                <p className="text-subtle-foreground text-sm">해당하는 사진이 없습니다.</p>
              </div>
            ) : viewMode === "list" ? (
              <>
              <PhotographerPhotoGallery
                scrollRef={contentScrollRef}
                photos={retouchedListPhotos}
                viewMode="list"
                thumbQueue={thumbQueue}
                onPhotoClick={(index) => {
                  const hasVersion = Boolean(activeVersionsByPhotoId.get(retouchedListPhotos[index].id));
                  const compare = stageTab !== "final" && hasVersion && window.matchMedia("(max-width: 767px)").matches;
                  openViewer(index, hasVersion ? stageTab : "original", compare);
                }}
                mobileManageMode={mobileSelectionMode}
                readonly={!activeCanSelect || selectableVersionIds.length === 0}
                variant={stageTab === "final" ? "final" : "retouched"}
                selectedPhotoIds={selectedVersionIds}
                onToggleSelected={toggleVersionSelection}
                selectionDisabled={deletingSelection}
                allVisibleSelected={allSelectableSelected}
                someVisibleSelected={someSelectableSelected}
                onToggleAllVisible={() => {
                  if (window.matchMedia("(max-width: 767px)").matches) setMobileSelectionMode(!allSelectableSelected);
                  toggleAllSelectable();
                }}
                getSelectionId={(photo) => {
                  const version = activeVersionsByPhotoId.get(photo.id);
                  if (stageTab === "v2" && rows.some((row) => row.photo.id === photo.id && isReviewedRetouch(row))) return null;
                  return version?.reviewStatus === "approved" ? null : version?.id ?? null;
                }}
                getRetouchedFilename={(photo) => {
                  const versionFilename = activeVersionsByPhotoId.get(photo.id)?.filename;
                  if (!versionFilename) return stageTab === "final" ? getPhotoDisplayFilename(photo) : "";
                  if (stageTab === "final") return formatPhotoDisplayFilename(versionFilename);
                  return formatPhotoDisplayFilename(versionFilename);
                }}
                getRetouchedPhoto={(photo) => retouchedPreviewsByPhotoId.get(photo.id) ?? null}
                renderMissingRetouched={(photo) => stageTab !== "final" ? (
                  <SingleVersionUploadSlot photoId={photo.id} version={stageTab === "v2" ? 2 : 1} canUpload={stageTab === "v2" ? canUploadV2 : canUploadV1} isUploading={uploadingVersionKeys.has(getVersionUploadKey(photo.id, stageTab === "v2" ? 2 : 1))} onUpload={replaceVersion} compact />
                ) : null}
                getRetouchedStatus={(photo) => {
                  const version = activeVersionsByPhotoId.get(photo.id);
                  if (!version) return null;
                  if (stageTab === "final") return <StatusBadge status="approved" compact />;
                  if (!version.reviewStatus && project.status === "editing") return null;
                  return <StatusBadge status={version.reviewStatus ?? "pending"} compact />;
                }}
                getSecondaryText={(photo) => {
                  const version = activeVersionsByPhotoId.get(photo.id);
                  return version?.reviewStatus === "revision_requested" ? version.comment ?? "" : "";
                }}
              />
              </>
            ) : (
              <>
                {/* 탭별 그리드 항상 DOM 유지 + 필터 미통과 행도 display:none으로 유지
                    → 탭 전환/필터 변경 시 카드 언마운트 없음 = 이미지 재요청 없음 */}
                <div className={cardCols} style={{ ...ASSET_GRID_STYLE, display: stageTab === "original" ? undefined : "none" }}>
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
                <div className={cardCols} style={{ ...ASSET_GRID_STYLE, display: stageTab === "v1" ? undefined : "none" }}>
                  {rows.map((row) => {
                    const visIdx = filteredIndexMap.get(row.photo.id);
                    return (
                      <div key={row.photo.id} style={{ display: visIdx !== undefined ? "contents" : "none" }}>
                        <V1Card
                          row={row}
                          index={visIdx ?? 0}
                          isReviewingV1={isReviewingV1}
                          v1DisplayStatus={effectiveV1Status(row.v1?.reviewStatus ?? null)}
                          canUploadV1={canUploadV1}
                          canSelect={canDeleteV1}
                          selected={Boolean(row.v1 && selectedVersionIds.has(row.v1.id))}
                          selectionMode={selectedVersionIds.size > 0}
                          selectionBusy={deletingSelection}
                          onOpenViewer={openViewer}
                          onToggleSelection={(versionId) => { setMobileSelectionMode(true); toggleVersionSelection(versionId); }}
                          onReplace={replaceVersion}
                          isUploading={uploadingVersionKeys.has(getVersionUploadKey(row.photo.id, 1))}
                          getVersionUrl={getVersionUrl}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className={cardCols} style={{ ...ASSET_GRID_STYLE, display: stageTab === "v2" ? undefined : "none" }}>
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
                          canUploadV2={canUploadV2}
                          canSelect={canDeleteV2 && !isReviewedRetouch(row)}
                          selected={Boolean(row.v2 && selectedVersionIds.has(row.v2.id))}
                          selectionMode={selectedVersionIds.size > 0}
                          selectionBusy={deletingSelection}
                          onOpenViewer={openViewer}
                          onToggleSelection={(versionId) => { setMobileSelectionMode(true); toggleVersionSelection(versionId); }}
                          onReplace={replaceVersion}
                          isUploading={uploadingVersionKeys.has(getVersionUploadKey(row.photo.id, 2))}
                          getVersionUrl={getVersionUrl}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className={cardCols} style={{ ...ASSET_GRID_STYLE, display: stageTab === "final" ? undefined : "none" }}>
                  {rows.map((row) => {
                    const visIdx = filteredIndexMap.get(row.photo.id);
                    const finalVersion = getFinalVersion(row, project.status === "delivered");
                    if (!finalVersion) return null;
                    return (
                      <div key={row.photo.id} style={{ display: visIdx !== undefined ? "contents" : "none" }}>
                        <FinalCard
                          row={row}
                          index={visIdx ?? 0}
                          selection={finalVersion}
                          onOpenViewer={openViewer}
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

      {/* 원본·셀렉 탭과 동일한 공통 사진 상세 뷰어 */}
      {viewerOpen && activeViewerRow && viewerPhotos[viewerIdx] ? (
        <OriginalPhotoViewer
          photos={viewerPhotos}
          activeIndex={viewerIdx}
          onActiveIndexChange={(index) => {
            setViewerIdx(index);
            setViewerHistoryId(null);
            if (!window.matchMedia("(max-width: 767px)").matches) setViewerCompare(false);
          }}
          onClose={() => {
            setViewerOpen(false);
            setViewerHistoryId(null);
            setViewerCompare(false);
          }}
          mobileMissingRetouched={filteredRows.map((row) => !row.v1 && !row.v2)}
          mobileComments={[{ label: "재보정 요청", text: currentStageReviewComment ?? "" }]}
          mobileCommentsHeading="재보정 요청"
          mobileView={assetView === "final" ? undefined : {
            mode: viewerCompare ? "compare" : viewerTab === "original" ? "original" : "retouched",
            missingRetouched: !activeViewerRow.v1 && !activeViewerRow.v2,
            onChange: (mode) => {
              setViewerHistoryId(null);
              setViewerTab(mode === "original" ? "original" : stageTab === "v2" ? "v2" : "v1");
              setViewerCompare(mode === "compare");
              setViewerCompareOriginal(mode === "compare");
            },
          }}
          comparisonPhotos={assetView !== "final" && resolvedViewerTab !== "original" && viewerCompare && activeViewerComparisonItem ? activeViewerComparisonPhotos : undefined}
          holdPreviewPhotos={assetView !== "final" && !activeArchivedVersion && resolvedViewerTab !== "original" && !viewerCompare ? originalViewerPhotos : undefined}
          comparisonImageLabel={activeViewerComparisonItem?.label}
          activeImageLabel={assetView === "final"
            ? "최종본"
            : activeArchivedVersion
            ? activeArchivedVersion.version === 2 ? `재보정본 ${activeArchivedVersion.revisionNo}차` : "이전 보정본"
            : resolvedViewerTab === "original" ? "원본" : resolvedViewerTab === "v2" ? `재보정본 ${activeViewerV2Round}차` : "보정본"}
          activeStatusLabel={activeViewerHistoryItems.find((item) => item.key === activeViewerHistoryKey)?.statusLabel}
          inspector={assetView === "final" ? undefined : (
            <PhotoVersionHistory
              items={activeViewerHistoryItems}
              activeKey={activeViewerHistoryKey}
              onSelect={(key) => {
                if (key.startsWith("history:")) {
                  const historyId = key.slice("history:".length);
                  const history = activeViewerRow.history.find((item) => item.id === historyId);
                  setViewerHistoryId(historyId);
                  if (history) setViewerTab(history.version === 2 ? "v2" : "v1");
                } else if (key === "original" || key === "v1" || key === "v2") {
                  setViewerHistoryId(null);
                  setViewerTab(key);
                }
                setViewerCompare(false);
                setViewerCompareOriginal(false);
              }}
              compareEnabled={viewerCompare}
              onCompareChange={(enabled) => { setViewerCompareOriginal(false); setViewerCompare(enabled); }}
              canCompare={activeViewerComparisonItem !== null}
              hideMobileSecondaryControls
              comment={(activeArchivedVersion ? activeArchivedVersion.comment : resolvedViewerTab === "original" ? activeViewerRow.photo.comment : resolvedViewerTab === "v2" ? activeViewerRow.v2?.comment : activeViewerRow.v1?.comment) ?? null}
              commentHeading={resolvedViewerTab === "original" ? "셀렉 요청" : "검토 코멘트"}
            />
          )}
          renderThumbnailOverlay={assetView === "final" ? undefined : () => (
            <span className="max-md:hidden absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/85">
              {activeArchivedVersion
                ? activeArchivedVersion.version === 2 ? `재보정 ${activeArchivedVersion.revisionNo}차` : "이전 보정"
                : resolvedViewerTab === "original" ? "원본" : resolvedViewerTab === "v2" ? `재보정 ${activeViewerV2Round}차` : "보정"}
            </span>
          )}
        />
      ) : null}

      {/* ── Footer ── */}
      <ProjectAssetStatusActionBar
        project={project}
        forceFallback={selectedVersionIds.size > 0 || (stageTab === "v1" && project.status === "reviewing_v2")}
        maxWidth={1760}
        className="shrink-0"
        mobileFixed
        compactMobile
        fallbackMobileLeading={selectedVersionIds.size > 0 ? (
          <p role="status" className="text-[13px] font-semibold text-foreground">
            {selectedVersionIds.size.toLocaleString()}장 선택됨
          </p>
        ) : isActiveRoundEditing && workflowUploadTotal > 0 ? (
          <p role="status" className="text-[13px] font-semibold text-foreground">
            {workflowNeedsReplacement
              ? `${workflowUploadLabel} ${workflowUploadCount}/${workflowUploadTotal}장 업로드 · ${v2RevisionPending}장 교체 필요`
              : workflowUploadComplete
                ? `${workflowUploadLabel} ${workflowUploadTotal}장 준비 완료`
                : `${workflowUploadLabel} ${workflowUploadCount}/${workflowUploadTotal}장 업로드`}
          </p>
        ) : footerNote}
        fallbackLeading={
          <div className="min-w-0">
            {selectedVersionIds.size > 0 ? (
              <p role="status" className="text-[13px] font-semibold text-foreground">
                보정본 {selectedVersionIds.size.toLocaleString()}장 선택됨
              </p>
            ) : isActiveRoundEditing && workflowUploadTotal > 0 ? (
              <div className="flex max-w-xl items-center gap-3">
                {workflowUploadComplete && !workflowNeedsReplacement ? (
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-foreground">
                        {workflowUploadLabel} {workflowUploadTotal}장 준비 완료
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">
                      {workflowUploadLabel} {workflowUploadCount}/{workflowUploadTotal}장 업로드
                      {workflowNeedsReplacement ? <span className="ml-2 font-medium text-muted-foreground">교체 필요 {v2RevisionPending}장</span> : null}
                    </p>
                  </div>
                )}
              </div>
            ) : footerNote ? <span className="text-sm font-medium text-muted-foreground">{footerNote}</span> : null}
          </div>
        }
        fallbackActions={selectedVersionIds.size > 0 ? (
          <PhotographerLightButton
            type="button"
            onClick={handleDeleteSelected}
            disabled={deletingSelection}
            variant="primary"
            className="min-h-11 w-full px-5 sm:w-auto"
          >
            <Trash2 size={16} />
            {deletingSelection ? "삭제 중…" : `선택 삭제 ${selectedVersionIds.size.toLocaleString()}장`}
          </PhotographerLightButton>
        ) : (stageTab === "v1" && isEditing && counts.total > 0) ? (
            <>
              {v1UploadRemaining > 0 ? (
                <span className="w-full md:hidden">
                  <PhotographerLightButton
                    type="button"
                    onClick={() => openPanel(1)}
                    disabled={!canUploadV1}
                    variant="primary"
                    className="min-h-11 w-full px-6"
                  >
                    <Upload size={16} />
                    일괄 업로드
                  </PhotographerLightButton>
                </span>
              ) : null}
              <span className={v1UploadRemaining > 0 ? "hidden md:contents" : "contents"}>
                <PhotographerLightButton
                  type="button"
                  onClick={() => handleStartCustomerReview(1)}
                  disabled={startingReview === 1 || !canStartV1Review}
                  title={!canStartV1Review
                    ? `보정본 ${v1UploadRemaining.toLocaleString()}장을 더 업로드해야 검토를 요청할 수 있습니다`
                    : "업로드와 매칭을 확인한 뒤 고객 검토를 요청합니다"}
                  variant="primary"
                  className="min-h-11 w-full px-6 md:w-auto"
                >
                  <Send size={15} />
                  {startingReview === 1 ? "처리 중…" : "보정본 검토 요청"}
                </PhotographerLightButton>
              </span>
            </>
          ) : (stageTab === "v2" && isEditingV2 && v2Total > 0) ? (
            <>
              {v2UploadRemaining > 0 ? (
                <span className="w-full md:hidden">
                  <PhotographerLightButton
                    type="button"
                    onClick={() => openPanel(2)}
                    disabled={!canUploadV2}
                    variant="primary"
                    className="min-h-11 w-full px-6"
                  >
                    <Upload size={16} />
                    일괄 업로드
                  </PhotographerLightButton>
                </span>
              ) : null}
              <span className={v2UploadRemaining > 0 ? "hidden md:contents" : "contents"}>
                <PhotographerLightButton
                  type="button"
                  onClick={() => handleStartCustomerReview(2)}
                  disabled={startingReview === 2 || !canStartV2Review}
                  title={!canStartV2Review
                    ? workflowNeedsReplacement
                      ? `재보정 요청 ${v2RevisionPending.toLocaleString()}장을 교체해야 검토를 요청할 수 있습니다`
                      : `재보정본 ${v2UploadRemaining.toLocaleString()}장을 더 업로드해야 검토를 요청할 수 있습니다`
                    : "업로드와 매칭을 확인한 뒤 고객 검토를 요청합니다"}
                  variant="primary"
                  className="min-h-11 w-full px-6 md:w-auto"
                >
                  <Send size={15} />
                  {startingReview === 2 ? "처리 중…" : "재보정본 검토 요청"}
                </PhotographerLightButton>
              </span>
            </>
          ) : null}
      />

      {/* ── Upload slide-over panel ── */}
      <UploadVersionsPanel
        isOpen={panelVersion !== null}
        onClose={() => setPanelVersion(null)}
        projectId={id}
        version={panelVersion ?? 1}
        targets={panelVersion === 2 ? v2Targets : v1Targets}
        existingVersionCount={existingVersionCount}
        onDelivered={handleDelivered}
        onDeleteExisting={deleteVersionFromUploadPanel}
        allowDeleteExisting={panelVersion === 1 ? canDeleteV1 : canDeleteV2}
      />

      <PhotographerConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!deletingSelection) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void executeDeleteSelected();
        }}
        title="선택한 보정본을 삭제할까요?"
        description={`선택한 보정본 ${selectedVersionIds.size.toLocaleString()}장을 삭제합니다.`}
        confirmLabel={`${selectedVersionIds.size.toLocaleString()}장 삭제`}
        pendingLabel="삭제 중…"
        pending={deletingSelection}
        tone="danger"
      />

      {reviewDeadlineModal?.stage === "setup" ? (
        <CustomerRetouchReviewRequestModal
          open
          onClose={closeReviewDeadlineModal}
          version={reviewDeadlineModal.v}
          customerName={project?.customerName ?? "고객"}
          photoCount={reviewDeadlineModal.v === 2 ? v2Total : counts.total}
          initialDeadline={reviewDeadlineModal.dateInput || project?.reviewDeadline}
          pending={startingReview === reviewDeadlineModal.v}
          error={reviewDeadlineModal.error}
          onRequest={(deadline) => {
            void runStartCustomerReview(reviewDeadlineModal.v, deadline);
          }}
        />
      ) : null}

      <CustomerInviteShareModal
        open={reviewDeadlineModal?.stage === "share"}
        onClose={closeReviewDeadlineModal}
        inviteUrl={inviteUrl}
        accessPin={project?.accessPin}
        onSavePin={handleSavePin}
      />
    </div>
  );
}
