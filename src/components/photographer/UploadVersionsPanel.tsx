"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Minimize2,
  Pencil,
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

const ACCENT = "#FF5A1F";
const ACCENT_DIM = "rgba(255, 90, 31, 0.15)";
const BORDER = "#1f1f1f";
const BORDER_MID = "#2a2a2a";
const SURFACE_1 = "#050505";
const SURFACE_2 = "#0a0a0a";
const MONO = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif";
const DISPLAY = "'Space Grotesk', 'Pretendard', sans-serif";
const TEXT_MUTED = "#5c5c5c";
const TEXT_NORMAL = "#a3a3a3";
const TEXT_BRIGHT = "#ffffff";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";

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

  // 패널이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setUploadedFiles([]);
      setMapping([]);
      setGlobalMemo("");
      setError(null);
      setPerItemTargetId(null);
      setCollapsed(false);
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
    return mapping.every((m) => m.file != null || m.type === "server");
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

      const uploadRes = await fetch("/api/photographer/upload-versions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const uploadData = (await uploadRes.json().catch(() => ({}))) as {
        error?: string;
        detail?: string | Array<{ msg?: string; message?: string }>;
      };
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
  const progressPct =
    targets.length > 0
      ? Math.min(100, Math.round((mappedCount / targets.length) * 100))
      : 0;

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
        .uvp-tech { font-family: ${MONO}; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }
        .uvp-dropzone {
          box-sizing: border-box;
          padding: 24px 28px 28px;
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23333' stroke-width='2' stroke-dasharray='8%2c 8' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
          background-origin: border-box;
          background-clip: border-box;
          transition: background-color 0.2s ease, background-image 0.2s ease;
        }
        .uvp-dropzone:hover, .uvp-dropzone.uvp-over {
          background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23FF5A1F' stroke-width='2' stroke-dasharray='8%2c 8' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
          background-color: ${ACCENT_DIM};
        }
        .uvp-scroll::-webkit-scrollbar { width: 6px; }
        .uvp-scroll::-webkit-scrollbar-track { background: ${SURFACE_1}; border-left: 1px solid ${BORDER}; }
        .uvp-scroll::-webkit-scrollbar-thumb { background: #333; }
        .uvp-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .uvp-btn-primary { background: ${ACCENT_DIM}; border: 1px solid rgba(255,90,31,0.5); color: ${ACCENT}; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .uvp-btn-primary:hover { background: ${ACCENT}; color: #000; }
        .uvp-btn-secondary { background: transparent; border: 1px solid ${BORDER_MID}; color: ${TEXT_MUTED}; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .uvp-btn-secondary:hover { border-color: #444; color: ${TEXT_BRIGHT}; }
        .uvp-btn-danger { background: transparent; border: 1px solid rgba(255,51,51,0.3); color: #FF3333; cursor: pointer; font-family: ${MONO}; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.15s; }
        .uvp-btn-danger:hover { background: rgba(255,51,51,0.1); }
        .uvp-memo {
          background: #080808; border: 1px solid ${BORDER}; color: ${TEXT_BRIGHT};
          transition: border-color 0.2s; outline: none;
        }
        .uvp-memo:focus { border-color: ${ACCENT}; box-shadow: inset 0 0 10px rgba(255,90,31,0.1); }
        .uvp-rail-btn {
          background: transparent; border: 1px solid ${BORDER_MID};
          color: ${TEXT_MUTED}; cursor: pointer;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .uvp-rail-btn:hover:not(:disabled) { border-color: ${ACCENT}; color: ${ACCENT}; }
        .uvp-rail-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .uvp-rail-btn-primary {
          background: ${ACCENT_DIM}; border: 1px solid rgba(255,90,31,0.5); color: ${ACCENT};
        }
        .uvp-rail-btn-primary:hover { background: ${ACCENT}; color: #000; border-color: ${ACCENT}; }
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
        }}
      >
        {collapsed && (
          <CollapsedRail
            version={version}
            mappedCount={mappedCount}
            totalCount={targets.length}
            progressPct={progressPct}
            submitting={submitting}
            onExpand={() => setCollapsed(false)}
            onClose={onClose}
          />
        )}
        {!collapsed && (
        <>
        {/* Header */}
        <header
          style={{
            flexShrink: 0,
            padding: "16px 24px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(2,2,2,0.95)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                background: ACCENT,
                boxShadow: `0 0 8px ${ACCENT}`,
              }}
            />
            <div>
              <div
                className="uvp-tech"
                style={{ color: ACCENT, marginBottom: 2 }}
              >
                BULK_UPLOAD :: V{version}
              </div>
              <h2
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 16,
                  fontWeight: 700,
                  color: TEXT_BRIGHT,
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {versionLabel} 일괄 업로드
              </h2>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 11,
                  color: TEXT_MUTED,
                  lineHeight: 1.45,
                  maxWidth: 280,
                }}
              >
                {targets.some((t) => t.serverRetouchUrl)
                  ? "서버에 올라간 보정본을 확인하고, 잘못 매핑된 장만 교체해 올릴 수 있어요."
                  : "업로드 후 매핑을 확인한 다음, ‘고객 검토 시작’ 버튼으로 공유합니다."}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="uvp-collapse-toggle"
              onClick={() => setCollapsed(true)}
              aria-label="패널 축소"
              title="패널 축소 (본문과 함께 보기)"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: TEXT_MUTED,
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="닫기"
              style={{
                background: "none",
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                color: TEXT_MUTED,
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div
          className="uvp-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: 24,
            paddingBottom: 24,
          }}
        >
          {/* targets summary */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div className="uvp-tech" style={{ color: "#888", marginBottom: 4 }}>
                {targetsLabel}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  color: TEXT_BRIGHT,
                }}
              >
                {targets.length}장
              </div>
            </div>
            <div
              style={{
                background: SURFACE_2,
                border: `1px solid #222`,
                padding: "6px 14px",
              }}
            >
              <span className="uvp-tech" style={{ color: "#555" }}>
                MAPPED
              </span>
              <span
                style={{
                  marginLeft: 10,
                  fontFamily: MONO,
                  fontSize: 12,
                  color: ACCENT,
                }}
              >
                {mappedCount} / {targets.length}
              </span>
            </div>
          </div>

          {/* Beta limit warning */}
          {overBetaLimit ? (
            <div
              style={{
                padding: "20px 16px",
                textAlign: "center",
                background: "rgba(239,68,68,0.06)",
                border: "2px dashed rgba(239,68,68,0.35)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <AlertCircle size={20} color={RED} />
              <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                베타 기간 최대 보정 횟수({BETA_MAX_REVISION_COUNT}회)에 도달했습니다.
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
                현재 {existingVersionCount} / {BETA_MAX_REVISION_COUNT}회 사용 중
              </div>
            </div>
          ) : targets.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: TEXT_MUTED,
                fontSize: 13,
              }}
            >
              {version === 1
                ? "선택된 사진이 없습니다."
                : "재보정 요청된 사진이 없습니다."}
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div style={{ marginBottom: 24 }}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`uvp-dropzone${dragOver ? " uvp-over" : ""}`}
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
                  style={{
                    width: "100%",
                    minHeight: 168,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: mappedCount === 0 ? "pointer" : "default",
                    backgroundColor:
                      mappedCount > 0 ? "rgba(34,197,94,0.04)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      border: `1px solid ${mappedCount > 0 ? "rgba(34,197,94,0.5)" : "#333"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: SURFACE_2,
                      marginBottom: 6,
                    }}
                  >
                    {mappedCount > 0 ? (
                      <CheckCircle2 size={18} color={GREEN} />
                    ) : (
                      <Upload size={18} color="#666" strokeWidth={1.5} />
                    )}
                  </div>
                  <p
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                      color: mappedCount > 0 ? TEXT_BRIGHT : TEXT_NORMAL,
                      margin: 0,
                    }}
                  >
                    {mappedCount > 0
                      ? `${mappedCount}장 매핑됨 · 아래에서 확인`
                      : version === 1
                        ? "DROP_RETOUCHED_FILES"
                        : "DROP_V2_RETOUCHED_FILES"}
                  </p>
                  <p className="uvp-tech" style={{ color: "#555", marginTop: 6, marginBottom: 0 }}>
                    JPEG / PNG / WebP 지원
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      multiInputRef.current?.click();
                    }}
                    className="uvp-tech"
                    style={{
                      marginTop: 16,
                      padding: "8px 16px",
                      background: ACCENT_DIM,
                      border: "1px solid rgba(255,90,31,0.4)",
                      color: ACCENT,
                      cursor: "pointer",
                    }}
                  >
                    {mappedCount > 0 ? "RESELECT FILES" : "SELECT FILES"}
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                    paddingLeft: 4,
                  }}
                >
                  <Info size={12} color="#666" strokeWidth={2} />
                  <span className="uvp-tech" style={{ color: "#666" }}>
                    파일명 일치 시 자동 매핑 · 불일치 시 순서대로 매핑
                  </span>
                </div>
              </div>

              {/* Mapping result */}
              {mapping.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      borderBottom: `1px solid ${BORDER}`,
                      paddingBottom: 10,
                      marginBottom: 14,
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <h3 className="uvp-tech" style={{ color: TEXT_BRIGHT, margin: 0 }}>
                      MAPPING_RESULT
                    </h3>
                    {(stats.exact > 0 || stats.order > 0 || stats.server > 0) && (
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
                          <span
                            className="uvp-tech"
                            style={{
                              color: GREEN,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: GREEN,
                              }}
                            />
                            NAME_MATCH: {stats.exact}
                          </span>
                        )}
                        {stats.exact > 0 && stats.order > 0 ? (
                          <span style={{ width: 1, height: 12, background: "#333" }} />
                        ) : null}
                        {stats.order > 0 && (
                          <span
                            className="uvp-tech"
                            style={{
                              color: AMBER,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: AMBER,
                              }}
                            />
                            SEQ_MATCH: {stats.order}
                          </span>
                        )}
                        {stats.server > 0 && (stats.exact > 0 || stats.order > 0) ? (
                          <span style={{ width: 1, height: 12, background: "#333" }} />
                        ) : null}
                        {stats.server > 0 && (
                          <span
                            className="uvp-tech"
                            style={{
                              color: "#38bdf8",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "#38bdf8",
                              }}
                            />
                            CURRENT: {stats.server}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div
              style={{
                marginTop: 16,
                padding: "10px 14px",
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

        {/* Footer / action bar */}
        {!overBetaLimit && targets.length > 0 ? (
          <footer
            style={{
              flexShrink: 0,
              borderTop: `1px solid ${BORDER}`,
              padding: 16,
              background: "rgba(2,2,2,0.95)",
              backdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* progress */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span className="uvp-tech" style={{ color: TEXT_BRIGHT }}>
                  V{version} UPLOAD STATUS
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: ACCENT,
                  }}
                >
                  {emptyCount > 0 ? `${emptyCount}장 미매핑` : "전체 매핑 완료"}
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  width: "100%",
                  background: "#111",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: ACCENT,
                    position: "relative",
                    transition: "width 0.3s",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(255,255,255,0.18)",
                      width: "25%",
                      animation: "uvp-bar-scan 2s linear infinite",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* memo */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <MessageSquare size={11} color="#666" strokeWidth={2} />
                <span className="uvp-tech" style={{ color: "#666" }}>
                  PHOTOGRAPHER_MEMO (선택)
                </span>
              </div>
              <textarea
                className="uvp-memo"
                value={globalMemo}
                onChange={(e) => setGlobalMemo(e.target.value)}
                placeholder="고객 검토 화면에 표시될 메모"
                rows={2}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  fontFamily: MONO,
                  fontSize: 11,
                  lineHeight: 1.45,
                  resize: "vertical",
                  minHeight: 44,
                  maxHeight: 120,
                }}
              />
            </div>

            {/* deliver */}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="uvp-btn-secondary"
                style={{ padding: "10px 16px" }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleDeliver}
                disabled={!canDeliver || submitting}
                className="uvp-tech"
                style={{
                  padding: "10px 22px",
                  background: canDeliver ? ACCENT_DIM : "#111",
                  border: `1px solid ${canDeliver ? "rgba(255,90,31,0.45)" : "#333"}`,
                  color: canDeliver ? ACCENT : "#555",
                  cursor: canDeliver && !submitting ? "pointer" : "not-allowed",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {submitting ? (
                  "업로드 중…"
                ) : (
                  <>
                    <Upload size={12} />
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

// ── Collapsed rail ────────────────────────────────────────────────────────────

function CollapsedRail({
  version,
  mappedCount,
  totalCount,
  progressPct,
  submitting,
  onExpand,
  onClose,
}: {
  version: 1 | 2;
  mappedCount: number;
  totalCount: number;
  progressPct: number;
  submitting: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 8px",
        gap: 16,
        height: "100%",
      }}
    >
      <button
        type="button"
        className="uvp-rail-btn uvp-rail-btn-primary"
        onClick={onExpand}
        aria-label="패널 펼치기"
        title="패널 펼치기"
      >
        <ChevronLeft size={16} />
      </button>

      <div
        style={{
          width: 36,
          padding: "8px 0",
          textAlign: "center",
          background: ACCENT_DIM,
          border: `1px solid rgba(255,90,31,0.3)`,
          color: ACCENT,
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
        aria-label={`V${version}`}
      >
        V{version}
      </div>

      <RailProgress
        progressPct={progressPct}
        mappedCount={mappedCount}
        totalCount={totalCount}
        submitting={submitting}
      />

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className="uvp-rail-btn"
        onClick={onClose}
        disabled={submitting}
        aria-label="닫기"
        title={submitting ? "업로드 중에는 닫을 수 없습니다" : "닫기"}
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
}: {
  progressPct: number;
  mappedCount: number;
  totalCount: number;
  submitting: boolean;
}) {
  const size = 40;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, progressPct)) / 100) * circumference;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
      title={`매핑 ${mappedCount}/${totalCount}`}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            transform: "rotate(-90deg)",
            animation: submitting ? "uvp-spin 1.4s linear infinite" : undefined,
          }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#222"
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: 9,
            color: TEXT_BRIGHT,
            fontWeight: 700,
          }}
        >
          {`${progressPct}`}
        </div>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9,
          color: TEXT_MUTED,
          letterSpacing: "0.05em",
        }}
      >
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
  const borderColor =
    state === "matched"
      ? "rgba(34,197,94,0.25)"
      : state === "ordered"
        ? "rgba(245,158,11,0.3)"
        : state === "server"
          ? "rgba(56,189,248,0.35)"
          : "rgba(239,68,68,0.25)";
  const fileSizeStr = file && file.size > 0 ? formatStoredFileSizeBytes(file.size) : "";
  const origSrc = viewerImageUrl(target.photo);

  return (
    <div
      style={{
        background: SURFACE_2,
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 24px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
        }}
      >
        {/* Left: original (+v1 if provided) + filename + comment */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: SURFACE_1,
                border: `1px solid ${BORDER}`,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {origSrc && !origErr ? (
                <img
                  src={origSrc}
                  alt=""
                  onError={() => setOrigErr(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ImageIcon size={14} color={TEXT_MUTED} />
              )}
            </div>
            {target.v1Url ? (
              <div
                title="v1 보정본"
                style={{
                  width: 40,
                  height: 40,
                  background: SURFACE_1,
                  border: "1px solid rgba(255,90,31,0.25)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!v1Err ? (
                  <img
                    src={target.v1Url}
                    alt=""
                    onError={() => setV1Err(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <ImageIcon size={14} color={TEXT_MUTED} />
                )}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginBottom: 2,
                color: TEXT_BRIGHT,
                fontFamily: MONO,
              }}
              title={target.filename}
            >
              {target.filename}
            </div>
            {target.comment?.trim() ? (
              <div
                style={{
                  fontSize: 10,
                  color: AMBER,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.3,
                }}
              >
                {target.comment}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            color: TEXT_MUTED,
          }}
        >
          <ArrowRight size={13} />
        </div>

        {/* Right: retouched */}
        {state === "empty" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 48,
                height: 48,
                background: "transparent",
                border: "2px dashed rgba(239,68,68,0.35)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} color="rgba(239,68,68,0.6)" strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                className="uvp-tech"
                style={{ color: "rgba(239,68,68,0.85)", display: "block" }}
              >
                NO_RETOUCH_FOUND
              </span>
            </div>
          </div>
        ) : state === "server" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 48,
                height: 48,
                background: SURFACE_1,
                border: "1px solid rgba(56,189,248,0.45)",
                overflow: "hidden",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {target.serverRetouchUrl && !retouchErr ? (
                <img
                  src={target.serverRetouchUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ImageIcon size={14} color={TEXT_MUTED} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: TEXT_BRIGHT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                서버에 등록된 보정본
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: "#38bdf8" }}>
                교체 시에만 다시 업로드됩니다
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 48,
                height: 48,
                background: SURFACE_1,
                border: `1px solid ${state === "matched" ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.5)"}`,
                overflow: "hidden",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {previewUrl && !retouchErr ? (
                <img
                  src={previewUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ImageIcon size={14} color={TEXT_MUTED} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: TEXT_BRIGHT,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={file?.name}
              >
                {file?.name ?? ""}
              </div>
              {fileSizeStr ? (
                <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_MUTED }}>
                  {fileSizeStr}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            paddingLeft: 8,
          }}
        >
          {state === "matched" && (
            <span
              style={{
                padding: "2px 6px",
                fontSize: 9,
                color: GREEN,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.3)",
                fontFamily: MONO,
                letterSpacing: "0.08em",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Check size={9} />
              AUTO
            </span>
          )}
          {state === "ordered" && (
            <span
              style={{
                padding: "2px 6px",
                fontSize: 9,
                color: AMBER,
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                fontFamily: MONO,
                letterSpacing: "0.08em",
              }}
            >
              SEQ
            </span>
          )}
          {state === "empty" && (
            <span
              style={{
                padding: "2px 6px",
                fontSize: 9,
                color: RED,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                fontFamily: MONO,
                letterSpacing: "0.08em",
              }}
            >
              MISS
            </span>
          )}
          {state === "server" && (
            <span
              style={{
                padding: "2px 6px",
                fontSize: 9,
                color: "#38bdf8",
                background: "rgba(56,189,248,0.1)",
                border: "1px solid rgba(56,189,248,0.35)",
                fontFamily: MONO,
                letterSpacing: "0.08em",
              }}
            >
              CURRENT
            </span>
          )}
          {file != null && (
            <button
              type="button"
              onClick={() => onClearFile(target.id)}
              className="uvp-btn-danger"
              style={{
                padding: "3px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <X size={9} />
              취소
            </button>
          )}
          <button
            type="button"
            onClick={() => onChangeOne(target.id)}
            className={
              state === "empty" || state === "server" ? "uvp-btn-primary" : "uvp-btn-secondary"
            }
            style={{
              padding: "3px 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {state === "empty" ? (
              "선택"
            ) : state === "server" ? (
              <>
                <Pencil size={9} />
                교체
              </>
            ) : (
              <>
                <Pencil size={9} />
                변경
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
