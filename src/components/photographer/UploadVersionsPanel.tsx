"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Minimize2,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildServerPlaceholderMapping,
  buildVersionMapping,
  clearSingleFile,
  mergeServerPlaceholders,
  remapSingleFile,
  type MappingResult,
  type MappingType,
} from "@/lib/version-mapping";
import { BETA_MAX_REVISION_COUNT } from "@/lib/beta-limits";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import type { Photo } from "@/types";

const ACCENT = "#FF4D00";
const SURFACE_1 = "#0a0a0c";
const BORDER = "#1a1a1e";
const TEXT_NORMAL = "#a1a1aa";

const ACCEPT_IMAGE_TYPES = "image/*,image/heic,image/heif";
function isAcceptedImageFile(f: File): boolean {
  return f.type.startsWith("image/") || f.type === "";
}

export type UploadPanelTarget = {
  id: string;
  photo: Photo;
  filename: string;
  /** V2 컨텍스트에서 고객이 남긴 재보정 코멘트 */
  comment?: string | null;
  /** V2 컨텍스트에서 같이 보여줄 v1 보정본 URL */
  v1Url?: string | null;
  /** 이미 서버에 올라간 보정본(확인·부분 교체 모드) */
  serverRetouchUrl?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  version: 1 | 2;
  /**
   * V1: 고객이 셀렉한 사진 전체.
   * V2: revision_requested 인 사진만.
   */
  targets: UploadPanelTarget[];
  /** 패널이 열릴 때 서버에 이미 올라간 버전 수 (베타 한계 체크) */
  existingVersionCount?: number;
  /** 업로드 완료 시 호출 (status 전환은 부모에서 별도 처리) */
  onDelivered: (uploadedVersion: 1 | 2) => void;
};

/**
 * 보정본 일괄 업로드 슬라이드오버.
 * Workflow 페이지의 [V1 일괄 업로드] / [V2 일괄 업로드] 액션에서 사용한다.
 * 파일만 업로드하고 status 전환은 부모(워크플로 페이지)에서 별도 버튼으로 수행한다.
 */
export default function UploadVersionsPanel({
  isOpen,
  onClose,
  projectId,
  version,
  targets,
  existingVersionCount = 0,
  onDelivered,
}: Props) {
  const multiInputRef = useRef<HTMLInputElement | null>(null);
  const perItemInputRef = useRef<HTMLInputElement | null>(null);

  const [perItemTargetId, setPerItemTargetId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState<MappingResult<UploadPanelTarget>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [globalMemo, setGlobalMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [serverProcessing, setServerProcessing] = useState(false);

  // submitting이 false가 되면 진행률 초기화
  useEffect(() => {
    if (!submitting) {
      setUploadPct(0);
      setUploadedBytes(0);
      setTotalBytes(0);
      setServerProcessing(false);
    }
  }, [submitting]);

  // 패널이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setUploadedFiles([]);
      setMapping([]);
      setGlobalMemo("");
      setError(null);
      setPerItemTargetId(null);
      setCollapsed(false);
      setUploadPct(0);
      setUploadedBytes(0);
      setTotalBytes(0);
      setServerProcessing(false);
    }
  }, [isOpen]);

  // ESC 로 닫기 (단, 전송 중과 collapsed 상태에서는 무시)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting && !collapsed) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, submitting, collapsed, onClose]);

  // 타깃 목록이 바뀌면 mapping 구조를 맞추되, 같은 집합이면 행 편집은 유지
  const uploadedFilesRef = useRef<File[]>([]);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    if (!isOpen) return;
    if (targets.length === 0) {
      setMapping([]);
      return;
    }
    setMapping((prev) => {
      const sameStructure =
        prev.length === targets.length &&
        prev.every((m, i) => m.target.id === targets[i]?.id);
      if (sameStructure) return prev;
      const files = uploadedFilesRef.current;
      if (files.length === 0) return buildServerPlaceholderMapping(targets);
      return mergeServerPlaceholders(buildVersionMapping(files, targets));
    });
  }, [isOpen, targets]);

  const localPreviewMap = useMemo(() => {
    const m = new Map<string, string>();
    mapping.forEach((item) => {
      if (item.file) m.set(item.target.id, URL.createObjectURL(item.file));
    });
    return m;
  }, [mapping]);

  useEffect(
    () => () => {
      localPreviewMap.forEach((url) => URL.revokeObjectURL(url));
    },
    [localPreviewMap],
  );

  const mappedCount = useMemo(
    () => mapping.filter((m) => m.file != null || m.type === "server").length,
    [mapping],
  );

  const stats = useMemo(() => {
    let exact = 0;
    let order = 0;
    let server = 0;
    mapping.forEach((m) => {
      if (m.type === "exact") exact++;
      else if (m.type === "order") order++;
      else if (m.type === "server") server++;
    });
    return { exact, order, server };
  }, [mapping]);

  // BE(upload.py)와 동일: 이미 존재하는 단계(v1/v2)의 교체 업로드는 허용한다.
  // existingVersionCount 가 2(V1+V2)인 것만으로 차단하면, V2 매핑 수정을 위해 패널을 다시 열 때도 막힌다.
  const overBetaLimit = version > BETA_MAX_REVISION_COUNT;

  const canDeliver = useMemo(() => {
    if (overBetaLimit) return false;
    if (targets.length === 0) return false;
    if (mapping.length !== targets.length) return false;
    // 전체 매핑 강제 대신, "업로드할 파일이 1개 이상"이면 업로드를 허용한다.
    // (server 플레이스홀더만 있는 경우는 업로드할 파일이 없으므로 비활성)
    return mapping.some((m) => m.file != null);
  }, [overBetaLimit, targets.length, mapping]);

  const handleDropFiles = useCallback(
    (files: File[]) => {
      const filtered = files.filter(isAcceptedImageFile);
      if (targets.length === 0) return;
      setUploadedFiles(filtered);
      setMapping(mergeServerPlaceholders(buildVersionMapping(filtered, targets)));
    },
    [targets],
  );

  const handleClearFile = useCallback((targetId: string) => {
    let fileToRemove: File | null = null;
    setMapping((prev) => {
      const row = prev.find((r) => r.target.id === targetId);
      fileToRemove = row?.file ?? null;
      if (!row?.file) return prev;
      const t = row.target as UploadPanelTarget;
      if (t.serverRetouchUrl) {
        return prev.map((m) =>
          m.target.id === targetId ? { ...m, file: null, type: "server" as const } : m
        );
      }
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

  const handlePerItemSelect = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length || !perItemTargetId) return;
      const file = Array.from(fileList).find(isAcceptedImageFile);
      if (!file) return;
      setMapping((prev) => remapSingleFile(prev, perItemTargetId, file));
      setPerItemTargetId(null);
    },
    [perItemTargetId],
  );

  const handleDeliver = useCallback(async () => {
    if (!canDeliver) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      const token = session?.access_token;
      if (userError || !user) throw new Error("로그인 인증을 확인할 수 없습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const changed = mapping.filter((m) => m.file != null) as Array<
        MappingResult<UploadPanelTarget> & { file: File }
      >;
      if (changed.length === 0) {
        onDelivered(version);
        return;
      }

      const form = new FormData();
      form.append("project_id", projectId);
      form.append("version", String(version));
      form.append("photo_ids", changed.map((m) => m.target.id).join(","));
      changed.forEach((m) => form.append("files", m.file));
      form.append("global_memo", globalMemo);

      const uploadRes = await new Promise<{ ok: boolean; status: number; text: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/photographer/upload-versions");
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && ev.total > 0) {
              setUploadedBytes(ev.loaded);
              setTotalBytes(ev.total);
              setUploadPct(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
              if (ev.loaded >= ev.total) setServerProcessing(true);
            } else if (ev.loaded > 0) {
              setUploadedBytes(ev.loaded);
            }
          };
          xhr.upload.onload = () => setServerProcessing(true);

          xhr.onload = () =>
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              status: xhr.status,
              text: xhr.responseText ?? "",
            });
          xhr.onerror = () => reject(new TypeError("NetworkError"));
          xhr.onabort = () => reject(new Error("업로드가 중단되었습니다."));

          xhr.send(form);
        },
      );

      const uploadData = ((): {
        error?: string;
        detail?: string | Array<{ msg?: string; message?: string }>;
      } => {
        try {
          return JSON.parse(uploadRes.text || "{}");
        } catch {
          return {};
        }
      })();

      if (!uploadRes.ok) {
        const msg =
          uploadData.error ??
          (typeof uploadData.detail === "string"
            ? uploadData.detail
            : Array.isArray(uploadData.detail)
              ? uploadData.detail[0]?.msg ?? uploadData.detail[0]?.message
              : null);
        throw new Error(msg ?? "업로드 실패");
      }

      onDelivered(version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setSubmitting(false);
    }
  }, [canDeliver, mapping, projectId, version, globalMemo, onDelivered]);

  if (!isOpen) return null;

  const versionLabel = version === 1 ? "V1 보정본" : "V2 재보정본";
  const targetsLabel =
    version === 1 ? "고객이 셀렉한 사진" : "재보정 요청 사진";
  const emptyCount =
    mapping.length > 0
      ? mapping.filter((m) => m.file == null && m.type !== "server").length
      : 0;
  const mappingProgressPct =
    targets.length > 0
      ? Math.min(100, Math.round((mappedCount / targets.length) * 100))
      : 0;
  // submitting 중에는 실제 바이트 진행률(uploadPct)을, 그 외에는 매핑 진행률을 보여준다.
  const progressPct = submitting ? uploadPct : mappingProgressPct;
  const totalUploadFileCount = mapping.filter((m) => m.file != null).length;
  // RailProgress 회전: 진행률이 의미있게 차오르고 있을 때는 멈춰두고,
  // (a) 송신 시작 직전(0%) (b) lengthComputable이 false인 환경 (c) 서버 처리 중일 때만 회전.
  const railSpinning = submitting && (serverProcessing || uploadPct === 0);

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting && !collapsed) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: collapsed ? "transparent" : "rgba(0,0,0,0.7)",
        backdropFilter: collapsed ? "none" : "blur(4px)",
        transition: "background-color 200ms ease, backdrop-filter 200ms ease",
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: collapsed ? "none" : "auto",
      }}
    >
      <style>{`
        @keyframes uvp-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes uvp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .uvp-dropzone {
          box-sizing: border-box;
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' rx='16' ry='16' fill='none' stroke='%2327272c' stroke-width='2' stroke-dasharray='8%2c 8'/%3e%3c/svg%3e");
          background-origin: border-box;
          background-clip: border-box;
          transition: background-color 0.2s ease, background-image 0.2s ease;
        }
        .uvp-dropzone:hover, .uvp-dropzone.uvp-over {
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' rx='16' ry='16' fill='none' stroke='%23FF4D00' stroke-width='2' stroke-dasharray='8%2c 8'/%3e%3c/svg%3e");
          background-color: rgba(255, 77, 0, 0.06);
        }
        .uvp-scroll::-webkit-scrollbar { width: 6px; }
        .uvp-scroll::-webkit-scrollbar-track { background: ${SURFACE_1}; border-left: 1px solid ${BORDER}; }
        .uvp-scroll::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 3px; }
        .uvp-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        @media (max-width: 768px) {
          .uvp-sheet { width: 100% !important; max-width: 100% !important; }
          .uvp-collapse-toggle { display: none !important; }
        }
      `}</style>

      <aside
        className="uvp-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: collapsed ? 56 : "min(720px, 100%)",
          maxWidth: "100%",
          background: SURFACE_1,
          borderLeft: `1px solid ${BORDER}`,
          color: TEXT_NORMAL,
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          boxShadow: collapsed
            ? "0 0 24px rgba(0,0,0,0.55)"
            : "0 0 60px rgba(0,0,0,0.7)",
          transition: "width 200ms ease, box-shadow 200ms ease",
          overflow: "hidden",
          pointerEvents: "auto",
          fontFamily: "var(--font-inter, 'Pretendard', sans-serif)",
        }}
      >
        {collapsed && (
          <CollapsedRail
            version={version}
            mappedCount={mappedCount}
            totalCount={targets.length}
            progressPct={progressPct}
            submitting={submitting}
            spinning={railSpinning}
            onExpand={() => setCollapsed(false)}
            onClose={onClose}
          />
        )}
        {!collapsed && (
        <>
        {/* Header */}
        <header className="shrink-0 border-b border-[#1a1a1e] bg-[#0f0f12]/95 backdrop-blur px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white leading-tight m-0">
              {versionLabel} 업로드
            </h2>
            {targets.some((t) => t.serverRetouchUrl) && (
              <p className="text-xs text-zinc-500 mt-1 m-0">
                필요한 장만 골라 교체할 수 있어요.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="uvp-collapse-toggle p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setCollapsed(true)}
              aria-label="패널 축소"
              title="패널 축소 (본문과 함께 보기)"
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="닫기"
              className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="uvp-scroll flex-1 min-h-0 overflow-y-auto p-6">
          {/* targets summary */}
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-zinc-300">
              <span className="text-zinc-500">{targetsLabel}</span>
              <span className="mx-2 text-zinc-700">·</span>
              <span className="font-semibold text-white">{targets.length}장</span>
            </div>
            <div className="text-xs text-zinc-400">
              매핑 <span className="text-[#FF4D00] font-bold">{mappedCount}</span>
              <span className="text-zinc-600"> / {targets.length}</span>
            </div>
          </div>

          {/* Beta limit warning */}
          {overBetaLimit ? (
            <div className="rounded-2xl bg-rose-500/5 border border-rose-500/30 px-5 py-5 mb-5 flex flex-col items-center gap-2 text-center">
              <AlertCircle size={20} className="text-rose-400" />
              <div className="text-sm text-rose-300 font-semibold">
                베타 기간 최대 보정 횟수({BETA_MAX_REVISION_COUNT}회)에 도달했습니다.
              </div>
              <div className="text-[11px] text-zinc-500">
                현재 {existingVersionCount} / {BETA_MAX_REVISION_COUNT}회 사용 중
              </div>
            </div>
          ) : targets.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              {version === 1
                ? "선택된 사진이 없습니다."
                : "재보정 요청된 사진이 없습니다."}
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div className="mb-6">
                <div
                  role="button"
                  tabIndex={0}
                  className={`uvp-dropzone${dragOver ? " uvp-over" : ""} rounded-2xl flex flex-col items-center justify-center min-h-[160px] px-7 py-7 ${
                    mappedCount === 0 ? "cursor-pointer" : "cursor-default"
                  } ${mappedCount > 0 ? "bg-emerald-500/[0.04]" : "bg-transparent"}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (mappedCount === 0) multiInputRef.current?.click();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleDropFiles(Array.from(e.dataTransfer.files));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  onClick={() => mappedCount === 0 && multiInputRef.current?.click()}
                >
                  <div
                    className={`w-10 h-10 rounded-full border ${
                      mappedCount > 0 ? "border-emerald-500/50" : "border-[#27272c]"
                    } bg-[#0a0a0c] flex items-center justify-center mb-2`}
                  >
                    {mappedCount > 0 ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : (
                      <Upload size={18} className="text-zinc-500" strokeWidth={1.5} />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white m-0">
                    {mappedCount > 0
                      ? `${mappedCount}장 매핑 완료`
                      : "이곳에 파일을 끌어다 놓으세요"}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-1 m-0">JPEG · PNG · WebP</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      multiInputRef.current?.click();
                    }}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#FF4D00] hover:bg-[#ff5e1a] text-black text-xs font-bold transition-colors"
                  >
                    {mappedCount > 0 ? "다시 선택" : "파일 선택"}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 pl-1 text-[11px] text-zinc-600">
                  <Info size={12} strokeWidth={2} />
                  <span>파일명 일치 시 자동 매핑 · 불일치 시 순서대로 매핑</span>
                </div>
              </div>

              {/* Mapping result */}
              {mapping.length > 0 && (
                <div>
                  <div className="flex items-end justify-between border-b border-[#1a1a1e] pb-2.5 mb-3.5 flex-wrap gap-3">
                    <h3 className="text-sm font-semibold text-white m-0">매핑 결과</h3>
                    {(stats.exact > 0 || stats.order > 0 || stats.server > 0) && (
                      <div className="flex items-center gap-3 text-[11px]">
                        {stats.exact > 0 && (
                          <StatChip dotColor="bg-emerald-500" textColor="text-emerald-400" label={`자동 ${stats.exact}`} />
                        )}
                        {stats.order > 0 && (
                          <StatChip dotColor="bg-amber-500" textColor="text-amber-400" label={`순서 ${stats.order}`} />
                        )}
                        {stats.server > 0 && (
                          <StatChip dotColor="bg-sky-500" textColor="text-sky-400" label={`현재 ${stats.server}`} />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {mapping.map((m) => (
                      <PanelMappingRow
                        key={m.target.id}
                        target={m.target}
                        file={m.file}
                        type={m.type}
                        previewUrl={localPreviewMap.get(m.target.id)}
                        onChangeOne={handleChangeOne}
                        onClearFile={handleClearFile}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[12px] text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer / action bar */}
        {!overBetaLimit && targets.length > 0 ? (
          <footer className="shrink-0 border-t border-[#1a1a1e] bg-[#0f0f12]/95 backdrop-blur px-5 py-4 flex flex-col gap-3">
            {/* progress */}
            <div>
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <span className="text-[11px] font-semibold text-zinc-300">
                  {submitting ? "업로드 진행도" : "업로드 상태"}
                </span>
                <span className="text-[11px] text-[#FF4D00] font-medium">
                  {submitting
                    ? serverProcessing
                      ? "서버 처리 중…"
                      : totalBytes > 0
                        ? `${uploadPct}% · ${formatStoredFileSizeBytes(uploadedBytes)} / ${formatStoredFileSizeBytes(totalBytes)}`
                        : `${uploadPct}%`
                    : emptyCount > 0
                      ? `${emptyCount}장 미매핑`
                      : "전체 매핑 완료"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1a1a1e] overflow-hidden">
                <div
                  className="h-full bg-[#FF4D00] relative transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                >
                  {submitting && (
                    <div
                      className="absolute inset-0 bg-white/15"
                      style={{ width: "25%", animation: "uvp-bar-scan 2s linear infinite" }}
                    />
                  )}
                </div>
              </div>
              {submitting && totalUploadFileCount > 0 && (
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  총 {totalUploadFileCount}장
                  {totalBytes > 0 ? ` · 합계 ${formatStoredFileSizeBytes(totalBytes)}` : ""}
                </p>
              )}
            </div>

            {/* memo */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-zinc-500">
                <MessageSquare size={11} strokeWidth={2} />
                <span>메모(선택)</span>
              </div>
              <textarea
                value={globalMemo}
                onChange={(e) => setGlobalMemo(e.target.value)}
                placeholder="고객 검토 화면에 표시될 메모"
                rows={2}
                className="w-full rounded-xl bg-[#0a0a0c] border border-[#27272c] text-white text-[12px] px-3 py-2 resize-y min-h-[44px] max-h-[120px] focus:outline-none focus:border-[#FF4D00] transition-colors leading-snug"
              />
            </div>

            {/* deliver */}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-[#27272c] bg-[#0a0a0c] text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:bg-[#121215] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeliver}
                disabled={!canDeliver || submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF4D00] hover:bg-[#ff5e1a] disabled:bg-[#1a1a1e] disabled:text-zinc-600 disabled:cursor-not-allowed text-black text-sm font-bold transition-colors"
              >
                {submitting ? (
                  <>
                    <span
                      aria-hidden
                      className="inline-block w-3 h-3 rounded-full border-2 border-black/40 border-t-black"
                      style={{ animation: "uvp-spin 0.9s linear infinite" }}
                    />
                    {serverProcessing ? "서버 처리 중…" : `업로드 중 ${uploadPct}%`}
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    업로드
                  </>
                )}
              </button>
            </div>
          </footer>
        ) : null}
        </>
        )}

        {/* Hidden file inputs */}
        <input
          ref={multiInputRef}
          type="file"
          multiple
          accept={ACCEPT_IMAGE_TYPES}
          style={{ display: "none" }}
          onChange={(e) => handleDropFiles(Array.from(e.target.files ?? []))}
        />
        <input
          ref={perItemInputRef}
          type="file"
          accept={ACCEPT_IMAGE_TYPES}
          style={{ display: "none" }}
          onChange={(e) => handlePerItemSelect(e.target.files)}
        />
      </aside>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  dotColor,
  textColor,
  label,
}: {
  dotColor: string;
  textColor: string;
  label: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
}

// ── Collapsed rail ────────────────────────────────────────────────────────────

function CollapsedRail({
  version,
  mappedCount,
  totalCount,
  progressPct,
  submitting,
  spinning,
  onExpand,
  onClose,
}: {
  version: 1 | 2;
  mappedCount: number;
  totalCount: number;
  progressPct: number;
  submitting: boolean;
  spinning: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center px-2 py-4 gap-4 h-full">
      <button
        type="button"
        onClick={onExpand}
        aria-label="패널 펼치기"
        title="패널 펼치기"
        className="w-9 h-9 flex items-center justify-center rounded-md border border-[#FF4D00]/40 bg-[#FF4D00]/15 text-[#FF4D00] hover:bg-[#FF4D00] hover:text-black transition-colors"
      >
        <ChevronLeft size={16} />
      </button>

      <div
        aria-label={`V${version}`}
        className="w-9 py-1.5 text-center rounded-md bg-[#FF4D00]/15 border border-[#FF4D00]/40 text-[#FF4D00] text-[11px] font-bold"
      >
        V{version}
      </div>

      <RailProgress
        progressPct={progressPct}
        mappedCount={mappedCount}
        totalCount={totalCount}
        submitting={submitting}
        spinning={spinning}
      />

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        aria-label="닫기"
        title={submitting ? "업로드 중에는 닫을 수 없습니다" : "닫기"}
        className="w-9 h-9 flex items-center justify-center rounded-md border border-[#27272c] text-zinc-500 hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function RailProgress({
  progressPct,
  mappedCount,
  totalCount,
  submitting,
  spinning,
}: {
  progressPct: number;
  mappedCount: number;
  totalCount: number;
  submitting: boolean;
  spinning: boolean;
}) {
  const size = 40;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, progressPct)) / 100) * circumference;
  return (
    <div
      className="flex flex-col items-center gap-1.5"
      title={`매핑 ${mappedCount}/${totalCount}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            transform: "rotate(-90deg)",
            animation: spinning ? "uvp-spin 1.4s linear infinite" : undefined,
          }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1a1a1e"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ACCENT}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
          {`${progressPct}`}
        </div>
      </div>
      <span className="text-[9px] text-zinc-500">
        {mappedCount}/{totalCount}
      </span>
    </div>
  );
}

// ── Mapping row (compact) ────────────────────────────────────────────────────

function PanelMappingRow({
  target,
  file,
  type,
  previewUrl,
  onChangeOne,
  onClearFile,
}: {
  target: UploadPanelTarget;
  file: File | null;
  type: MappingType;
  previewUrl?: string;
  onChangeOne: (id: string) => void;
  onClearFile: (id: string) => void;
}) {
  const [origErr, setOrigErr] = useState(false);
  const [v1Err, setV1Err] = useState(false);
  const [retouchErr, setRetouchErr] = useState(false);
  const state =
    type === "exact"
      ? "matched"
      : type === "order"
        ? "ordered"
        : type === "server"
          ? "server"
          : "empty";
  const borderClass =
    state === "matched"
      ? "border-emerald-500/30"
      : state === "ordered"
        ? "border-amber-500/30"
        : state === "server"
          ? "border-sky-500/30"
          : "border-rose-500/30";
  const fileSizeStr = file && file.size > 0 ? formatStoredFileSizeBytes(file.size) : "";
  const origSrc = viewerImageUrl(target.photo);

  const primaryActionLabel = state === "empty" ? "선택" : state === "server" ? "교체" : "변경";
  const primaryActionClass =
    state === "empty" || state === "server"
      ? "border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20"
      : "border-[#27272c] text-zinc-300 hover:border-zinc-500 hover:text-white";

  return (
    <div className={`rounded-xl border ${borderClass} bg-[#0f0f12] overflow-hidden`}>
      <div
        className="grid items-center gap-2 px-3.5 py-2.5"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 20px minmax(0, 1fr) auto" }}
      >
        {/* Left: original (+v1 if provided) + filename + comment */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex gap-1 shrink-0">
            <div className="w-10 h-10 rounded-md bg-[#0a0a0c] border border-[#1a1a1e] overflow-hidden flex items-center justify-center">
              {origSrc && !origErr ? (
                <img
                  src={origSrc}
                  alt=""
                  onError={() => setOrigErr(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon size={14} className="text-zinc-600" />
              )}
            </div>
            {target.v1Url ? (
              <div
                title="V1 보정본"
                className="w-10 h-10 rounded-md bg-[#0a0a0c] border border-[#FF4D00]/25 overflow-hidden flex items-center justify-center"
              >
                {!v1Err ? (
                  <img
                    src={target.v1Url}
                    alt=""
                    onError={() => setV1Err(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon size={14} className="text-zinc-600" />
                )}
              </div>
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-[12.5px] font-medium text-zinc-200 truncate"
              title={target.filename}
            >
              {target.filename}
            </div>
            {target.comment?.trim() ? (
              <div
                className="text-[10.5px] text-amber-400 mt-0.5 leading-snug"
                style={{
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

        <div className="flex justify-center text-zinc-600">
          <ArrowRight size={13} />
        </div>

        {/* Right: retouched */}
        {state === "empty" ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-12 h-12 rounded-md border-2 border-dashed border-rose-500/35 flex items-center justify-center shrink-0">
              <X size={14} className="text-rose-500/60" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0 text-[12px] text-rose-300/90">매핑 없음</div>
          </div>
        ) : state === "server" ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-12 h-12 rounded-md bg-[#0a0a0c] border border-sky-500/45 overflow-hidden shrink-0 flex items-center justify-center">
              {target.serverRetouchUrl && !retouchErr ? (
                <img
                  src={target.serverRetouchUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon size={14} className="text-zinc-600" />
              )}
            </div>
            <div
              className="flex-1 min-w-0 text-[12px] text-zinc-200 truncate"
              title={target.filename}
            >
              {target.filename}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-12 h-12 rounded-md bg-[#0a0a0c] overflow-hidden shrink-0 flex items-center justify-center border ${
                state === "matched" ? "border-emerald-500/35" : "border-amber-500/45"
              }`}
            >
              {previewUrl && !retouchErr ? (
                <img
                  src={previewUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon size={14} className="text-zinc-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-zinc-200 truncate" title={file?.name}>
                {file?.name ?? ""}
              </div>
              {fileSizeStr ? (
                <div className="text-[10.5px] text-zinc-500 mt-0.5">{fileSizeStr}</div>
              ) : null}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          {state === "matched" && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
              자동
            </span>
          )}
          {state === "ordered" && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/30">
              순서
            </span>
          )}
          {state === "server" && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide text-sky-400 bg-sky-500/10 border border-sky-500/30">
              현재
            </span>
          )}
          {state === "empty" && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide text-rose-400 bg-rose-500/10 border border-rose-500/30">
              미매핑
            </span>
          )}
          {file != null && (
            <button
              type="button"
              onClick={() => onClearFile(target.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[11px] transition-colors"
            >
              <X size={10} />
              취소
            </button>
          )}
          <button
            type="button"
            onClick={() => onChangeOne(target.id)}
            className={`inline-flex items-center px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${primaryActionClass}`}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
