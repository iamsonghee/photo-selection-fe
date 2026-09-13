"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Info,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PhotographerPortal } from "./PhotographerPortal";
import styles from "./UploadVersionsPanel.module.css";
import { useDialogAccessibility } from "@/hooks/useDialogAccessibility";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";
import { PhotoCardComment } from "@/components/photographer/PhotoCardComment";
import { createClient } from "@/lib/supabase/client";
import {
  applySequentialFallback,
  buildServerPlaceholderMapping,
  buildVersionMapping,
  clearSingleFile,
  mergeServerPlaceholders,
  remapSingleFile,
  type MappingResult,
  type MappingType,
} from "@/lib/version-mapping";
import { applyGeminiMatches, matchRetouchByGemini } from "@/lib/retouch-gemini-match";
import { DEFAULT_BETA_MAX_REVISION_COUNT } from "@/lib/beta-limits";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import { compressImageForUpload } from "@/lib/upload-client-compress";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { abandonDeliveryVersions, uploadDeliveryVersions, type DeliveryVersionUpload } from "@/lib/delivery-version-upload";
import type { Photo } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SURFACE_1 = "var(--surface-raised)";
const BORDER = "var(--border)";
const TEXT_NORMAL = "var(--muted-foreground)";

const ACCEPT_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
function isAcceptedImageFile(f: File): boolean {
  const extension = f.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

function validateSelectedImageFiles(files: File[]): { accepted: File[]; messages: string[] } {
  const accepted: File[] = [];
  const seen = new Set<string>();
  let emptyCount = 0;
  let unsupportedCount = 0;
  let duplicateCount = 0;

  files.forEach((file) => {
    if (file.size <= 0) {
      emptyCount++;
      return;
    }
    if (!isAcceptedImageFile(file)) {
      unsupportedCount++;
      return;
    }
    const duplicateKey = `${file.name.trim().toLowerCase()}::${file.size}::${file.lastModified}`;
    if (seen.has(duplicateKey)) {
      duplicateCount++;
      return;
    }
    seen.add(duplicateKey);
    accepted.push(file);
  });

  const messages: string[] = [];
  if (unsupportedCount > 0) {
    messages.push(`지원하지 않는 형식 ${unsupportedCount}개를 제외했습니다. JPEG, PNG, WebP, HEIC만 사용할 수 있습니다.`);
  }
  if (emptyCount > 0) messages.push(`내용이 없는 파일 ${emptyCount}개를 제외했습니다.`);
  if (duplicateCount > 0) messages.push(`중복 파일 ${duplicateCount}개를 한 번만 포함했습니다.`);
  return { accepted, messages };
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
  /** 서버 보정본 삭제에 사용하는 photo_versions 식별자 */
  serverVersionId?: string | null;
  /** 고객 검토 이력이 있는 재보정본은 삭제하지 않고 교체로 이력을 보존한다. */
  deleteLocked?: boolean;
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
  onDelivered: (uploadedVersion: 1 | 2, uploadedPhotoIds: string[]) => void;
  /** 이미 업로드된 보정본을 삭제하고 부모 목록을 갱신한다. */
  onDeleteExisting: (photoId: string, versionId: string, version: 1 | 2) => Promise<void>;
  /** 현재 프로젝트 단계에서 서버 보정본 삭제가 허용되는지 여부 */
  allowDeleteExisting?: boolean;
};

/**
 * 보정본 일괄 업로드 다이얼로그.
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
  onDeleteExisting,
  allowDeleteExisting = true,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const dialogTitleId = useId();
  const multiInputRef = useRef<HTMLInputElement | null>(null);
  const perItemInputRef = useRef<HTMLInputElement | null>(null);
  const matchGenerationRef = useRef(0);

  const [perItemTargetId, setPerItemTargetId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState<MappingResult<UploadPanelTarget>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileSelectionMessages, setFileSelectionMessages] = useState<string[]>([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [serverProcessing, setServerProcessing] = useState(false);
  const [geminiMatching, setGeminiMatching] = useState(false);
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<UploadPanelTarget | null>(null);
  const [deletingExisting, setDeletingExisting] = useState(false);
  const [deleteExistingError, setDeleteExistingError] = useState<string | null>(null);
  const [betaMaxRevisionCount, setBetaMaxRevisionCount] = useState(DEFAULT_BETA_MAX_REVISION_COUNT);

  useEffect(() => {
    fetch("/api/limits")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.betaMaxRevisionCount) setBetaMaxRevisionCount(data.betaMaxRevisionCount);
      })
      .catch(() => {});
  }, []);

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
      setError(null);
      setFileSelectionMessages([]);
      setPerItemTargetId(null);
      setUploadPct(0);
      setUploadedBytes(0);
      setTotalBytes(0);
      setServerProcessing(false);
      setGeminiMatching(false);
      setShowManualMapping(false);
      setDeleteCandidate(null);
      setDeletingExisting(false);
      setDeleteExistingError(null);
      matchGenerationRef.current++;
    }
  }, [isOpen]);

  // Shared focus/name/scroll behavior; uploads and nested deletion lock closing.
  useDialogAccessibility({ open: isOpen, rootRef: dialogRef, onClose, closeDisabled: submitting || deletingExisting });


  // 타깃 목록이 바뀌면 mapping 구조를 맞추되, 같은 집합이면 행 편집은 유지
  const uploadedFilesRef = useRef<File[]>([]);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  const mappingRef = useRef<MappingResult<UploadPanelTarget>[]>([]);
  useEffect(() => {
    mappingRef.current = mapping;
  }, [mapping]);

  // exact/fuzzy 매칭에 실패한 잔여 항목(type "none")에 대해 Gemini 임베딩 유사도 매칭을
  // 시도하고(2026-07-30부터 OpenCLIP 대체), 그래도 남은 항목은 순서대로 짝지어 "order"로
  // 연결한다. 매칭 방식은 내부 상태로 유지하고, 작가는 "파일 변경"으로 언제든 재지정할 수 있다.
  // matchRetouchByGemini는 실패해도 절대 throw하지 않는다(내부에서 보장).
  const runGeminiMatchPass = useCallback(
    async (files: File[], rows: MappingResult<UploadPanelTarget>[]) => {
      const generation = ++matchGenerationRef.current;
      const claimed = new Set(rows.map((r) => r.file).filter((f): f is File => f != null));
      const leftoverFiles = files.filter((f) => !claimed.has(f));
      const leftoverPhotoIds = rows.filter((r) => r.type === "none").map((r) => r.target.id);
      if (leftoverFiles.length === 0 || leftoverPhotoIds.length === 0) {
        setGeminiMatching(false);
        return;
      }

      setGeminiMatching(true);
      try {
        const matches = await matchRetouchByGemini(projectId, leftoverPhotoIds, leftoverFiles, {
          signal: AbortSignal.timeout(20000),
        });
        if (generation !== matchGenerationRef.current) return;
        setMapping((prev) => {
          const afterGemini = matches.length > 0 ? applyGeminiMatches(prev, leftoverFiles, matches) : prev;
          const stillClaimed = new Set(afterGemini.map((r) => r.file).filter((f): f is File => f != null));
          const stillLeftoverFiles = leftoverFiles.filter((f) => !stillClaimed.has(f));
          return applySequentialFallback(afterGemini, stillLeftoverFiles);
        });
      } finally {
        if (generation === matchGenerationRef.current) setGeminiMatching(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (targets.length === 0) {
      setMapping([]);
      return;
    }
    const prev = mappingRef.current;
    const sameStructure =
      prev.length === targets.length && prev.every((m, i) => m.target.id === targets[i]?.id);
    if (sameStructure) return;
    const files = uploadedFilesRef.current;
    if (files.length === 0) {
      setMapping(buildServerPlaceholderMapping(targets));
      return;
    }
    const initial = mergeServerPlaceholders(buildVersionMapping(files, targets));
    setMapping(initial);
    void runGeminiMatchPass(files, initial);
  }, [isOpen, targets, runGeminiMatchPass]);

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
    let fuzzy = 0;
    let gemini = 0;
    let geminiLow = 0;
    let order = 0;
    let server = 0;
    mapping.forEach((m) => {
      if (m.type === "exact") exact++;
      else if (m.type === "fuzzy") fuzzy++;
      else if (m.type === "gemini") gemini++;
      else if (m.type === "gemini_low") geminiLow++;
      else if (m.type === "order") order++;
      else if (m.type === "server") server++;
    });
    return { exact, fuzzy, gemini, geminiLow, order, server };
  }, [mapping]);

  // 자동 연결이 되었더라도 신뢰도가 낮거나 순서로 연결된 항목은 작가 확인이 필요하다.
  const needsReviewCount = stats.geminiLow + stats.order;

  // BE(upload.py)와 동일: 이미 존재하는 단계(v1/v2)의 교체 업로드는 허용한다.
  // existingVersionCount 가 2(V1+V2)인 것만으로 차단하면, V2 매핑 수정을 위해 패널을 다시 열 때도 막힌다.
  const overBetaLimit = version > betaMaxRevisionCount;
  const hasExistingRetouches = targets.some((target) => target.serverRetouchUrl);
  const remainingTargetCount = targets.filter((target) => !target.serverRetouchUrl).length;
  const totalUploadFileCount = useMemo(
    () => mapping.filter((m) => m.file != null).length,
    [mapping],
  );
  const selectedUploadBytes = useMemo(
    () => mapping.reduce((sum, item) => sum + (item.file?.size ?? 0), 0),
    [mapping],
  );
  const fileCountNotice = useMemo(() => {
    const selectedCount = uploadedFiles.length;
    if (selectedCount === 0 || targets.length === 0) return null;

    if (remainingTargetCount > 0) {
      if (selectedCount < remainingTargetCount) {
        return `남은 대상 ${remainingTargetCount}장 중 ${selectedCount}장만 선택했습니다. 선택한 사진만 먼저 업로드됩니다.`;
      }
      if (selectedCount > targets.length) {
        return `전체 대상보다 ${selectedCount - targets.length}장 많습니다. 초과 파일은 매칭되지 않으므로 파일을 확인해주세요.`;
      }
      if (selectedCount > remainingTargetCount) {
        return `남은 대상보다 ${selectedCount - remainingTargetCount}장 많습니다. 기존 보정본이 교체될 수 있으니 매칭 결과를 확인해주세요.`;
      }
      return null;
    }

    if (selectedCount < targets.length) {
      return `전체 대상 ${targets.length}장 중 ${selectedCount}장만 선택했습니다. 선택한 사진만 교체됩니다.`;
    }
    if (selectedCount > targets.length) {
      return `전체 대상보다 ${selectedCount - targets.length}장 많습니다. 초과 파일은 매칭되지 않으므로 파일을 확인해주세요.`;
    }
    return null;
  }, [remainingTargetCount, targets.length, uploadedFiles.length]);

  const canDeliver = useMemo(() => {
    if (overBetaLimit) return false;
    if (geminiMatching) return false;
    if (targets.length === 0) return false;
    if (mapping.length !== targets.length) return false;
    // 전체 매핑 강제 대신, "업로드할 파일이 1개 이상"이면 업로드를 허용한다.
    // (server 플레이스홀더만 있는 경우는 업로드할 파일이 없으므로 비활성)
    return totalUploadFileCount > 0;
  }, [overBetaLimit, geminiMatching, targets.length, mapping.length, totalUploadFileCount]);

  const handleDropFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const { accepted, messages } = validateSelectedImageFiles(files);
      setFileSelectionMessages(messages);
      if (accepted.length === 0) return;
      if (targets.length === 0) return;
      setUploadedFiles(accepted);
      setShowManualMapping(false);
      const initial = mergeServerPlaceholders(buildVersionMapping(accepted, targets));
      setMapping(initial);
      void runGeminiMatchPass(accepted, initial);
    },
    [targets, runGeminiMatchPass],
  );

  const handleResetSelection = useCallback(() => {
    matchGenerationRef.current++;
    setGeminiMatching(false);
    setUploadedFiles([]);
    setMapping(buildServerPlaceholderMapping(targets));
    setFileSelectionMessages([]);
    setError(null);
    setShowManualMapping(false);
    if (multiInputRef.current) multiInputRef.current.value = "";
    if (perItemInputRef.current) perItemInputRef.current.value = "";
  }, [targets]);

  const handleChangeOne = useCallback((targetId: string) => {
    setPerItemTargetId(targetId);
    setTimeout(() => perItemInputRef.current?.click(), 0);
  }, []);

  const handleDeleteLocalFile = useCallback((targetId: string) => {
    const selectedFile = mappingRef.current.find((item) => item.target.id === targetId)?.file;
    if (!selectedFile) return;

    // 진행 중인 자동 매칭이 삭제한 파일을 다시 연결하지 않도록 현재 세대를 종료한다.
    matchGenerationRef.current++;
    setGeminiMatching(false);
    setMapping((current) => mergeServerPlaceholders(clearSingleFile(current, targetId)));
    setUploadedFiles((current) => current.filter((file) => file !== selectedFile));
  }, []);

  const handleDeleteExisting = useCallback(async () => {
    const candidate = deleteCandidate;
    if (!candidate?.serverVersionId || candidate.deleteLocked || deletingExisting) return;
    setDeletingExisting(true);
    setDeleteExistingError(null);
    try {
      await onDeleteExisting(candidate.id, candidate.serverVersionId, version);
      setMapping((current) =>
        current.map((item) =>
          item.target.id === candidate.id
            ? {
                ...item,
                file: null,
                type: "none",
                similarity: undefined,
                target: {
                  ...item.target,
                  serverRetouchUrl: null,
                  serverVersionId: null,
                },
              }
            : item,
        ),
      );
      setDeleteCandidate(null);
    } catch (deleteError) {
      setDeleteExistingError(
        deleteError instanceof Error ? deleteError.message : "보정본을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingExisting(false);
    }
  }, [deleteCandidate, deletingExisting, onDeleteExisting, version]);

  const handlePerItemSelect = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length || !perItemTargetId) return;
      const { accepted, messages } = validateSelectedImageFiles(Array.from(fileList));
      setFileSelectionMessages(messages);
      const file = accepted[0];
      if (!file) return;
      const previousFile = mappingRef.current.find((item) => item.target.id === perItemTargetId)?.file ?? null;
      setMapping((prev) => remapSingleFile(prev, perItemTargetId, file));
      setUploadedFiles((prev) => [...prev.filter((item) => item !== previousFile && item !== file), file]);
      setPerItemTargetId(null);
    },
    [perItemTargetId],
  );

  const handleDeliver = useCallback(async () => {
    if (!canDeliver) return;
    setSubmitting(true);
    setError(null);
    let deliveryMetadata: DeliveryVersionUpload[] = [];
    let uploadToken = "";
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!session?.user) throw new Error("로그인 인증을 확인할 수 없습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");
      uploadToken = token;

      const changed = mapping.filter((m) => m.file != null) as Array<
        MappingResult<UploadPanelTarget> & { file: File }
      >;
      if (changed.length === 0) {
        onDelivered(version, []);
        return;
      }

      // 원본 전달 업로드를 기다린 뒤 프리뷰를 압축하던 직렬 병목을 제거한다.
      const [deliveryResult, compressionResult] = await Promise.allSettled([
        uploadDeliveryVersions({
          projectId,
          version,
          token,
          files: changed.map((m) => ({ photoId: m.target.id, file: m.file })),
          onProgress: (loaded, total) => {
            setUploadedBytes(loaded);
            setTotalBytes(total);
            setUploadPct(total > 0 ? Math.round((loaded / total) * 70) : 0);
          },
        }),
        Promise.all(changed.map((m) => compressImageForUpload(m.file))),
      ]);
      if (deliveryResult.status === "fulfilled") deliveryMetadata = deliveryResult.value;
      if (deliveryResult.status === "rejected") throw deliveryResult.reason;
      if (compressionResult.status === "rejected") throw compressionResult.reason;
      const compressedFiles = compressionResult.value;
      const deliveryTotalBytes = changed.reduce((sum, item) => sum + item.file.size, 0);
      const previewTotalBytes = compressedFiles.reduce((sum, file) => sum + file.size, 0);
      const combinedTotalBytes = deliveryTotalBytes + previewTotalBytes;
      setUploadedBytes(deliveryTotalBytes);
      setTotalBytes(combinedTotalBytes);
      const form = new FormData();
      form.append("project_id", projectId);
      form.append("version", String(version));
      form.append("photo_ids", changed.map((m) => m.target.id).join(","));
      form.append("delivery_metadata", JSON.stringify(deliveryMetadata));
      compressedFiles.forEach((f) => form.append("files", f));

      const uploadRes = await new Promise<{ ok: boolean; status: number; text: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API_BASE}/api/upload/versions`);
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && ev.total > 0) {
              const combinedLoaded = deliveryTotalBytes + ev.loaded;
              setUploadedBytes(combinedLoaded);
              setTotalBytes(combinedTotalBytes);
              setUploadPct(Math.min(100, Math.round((combinedLoaded / combinedTotalBytes) * 100)));
              if (ev.loaded >= ev.total) setServerProcessing(true);
            } else if (ev.loaded > 0) {
              setUploadedBytes(deliveryTotalBytes + ev.loaded);
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
        uploaded?: number;
        message?: string;
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

      // 서버가 200을 반환해도 일부 파일(빈 파일·지원하지 않는 형식 등)은 조용히 스킵할 수 있다.
      // 제출한 사진 수보다 실제 처리된 수가 적으면 성공으로 간주하지 않고 사용자에게 알린다.
      if (typeof uploadData.uploaded === "number" && uploadData.uploaded < changed.length) {
        const failedCount = changed.length - uploadData.uploaded;
        throw new Error(
          uploadData.message ??
            `${changed.length}장 중 ${failedCount}장이 업로드되지 않았습니다. 파일 형식과 용량을 확인한 뒤 다시 시도해주세요.`
        );
      }

      onDelivered(version, changed.map((item) => item.target.id));
    } catch (e) {
      if (deliveryMetadata.length > 0 && uploadToken) {
        await abandonDeliveryVersions({ projectId, version, token: uploadToken, items: deliveryMetadata });
      }
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setSubmitting(false);
    }
  }, [canDeliver, mapping, projectId, version, onDelivered]);

  if (!isOpen) return null;

  const versionLabel = version === 1 ? "보정본" : "V2 재보정본";
  const emptyCount =
    mapping.length > 0
      ? mapping.filter((m) => m.file == null && m.type !== "server").length
      : 0;
  const deliverDisabledReason = overBetaLimit
    ? `베타 기간 최대 보정 횟수(${betaMaxRevisionCount}회)에 도달했습니다.`
    : geminiMatching
      ? "자동 매칭이 끝날 때까지 잠시 기다려주세요."
      : targets.length === 0
        ? "업로드할 대상 사진이 없습니다."
        : mapping.length !== targets.length
          ? "사진 목록을 불러오는 중입니다."
          : totalUploadFileCount === 0
            ? hasExistingRetouches
              ? "추가로 업로드할 파일을 선택해주세요."
              : null
            : null;
  const mobileFileCountNotice = fileCountNotice
    ? uploadedFiles.length > targets.length
      ? `${uploadedFiles.length - targets.length}장은 매칭되지 않습니다.`
      : remainingTargetCount > 0 && uploadedFiles.length > remainingTargetCount
        ? "기존 보정본이 교체될 수 있습니다."
        : totalUploadFileCount > 0
          ? `선택한 ${totalUploadFileCount}장만 업로드됩니다.`
          : null
    : null;
  // RailProgress 회전: 진행률이 의미있게 차오르고 있을 때는 멈춰두고,
  // (a) 송신 시작 직전(0%) (b) lengthComputable이 false인 환경 (c) 서버 처리 중일 때만 회전.
  return (
    <PhotographerPortal>
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting && !deletingExisting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        transition: "background-color 200ms ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",

      }}
    >
      <style>{`
        @keyframes uvp-bar-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes uvp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .uvp-dropzone {
          box-sizing: border-box;
          border: 1px dashed var(--border-strong);
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        .uvp-dropzone:hover, .uvp-dropzone.uvp-over {
          border-color: var(--accent);
          background-color: rgba(var(--accent-rgb), 0.06);
        }
        .uvp-scroll::-webkit-scrollbar { width: 6px; }
        .uvp-scroll::-webkit-scrollbar-track { background: ${SURFACE_1}; }
        .uvp-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--muted-foreground) 42%, var(--surface-raised));
          border-radius: 3px;
        }
        .uvp-scroll::-webkit-scrollbar-thumb:hover {
          background: color-mix(in srgb, var(--muted-foreground) 68%, var(--surface-raised));
        }
        .uvp-sheet:focus { outline: none; }
        @media (max-width: 768px) {
          .uvp-sheet { width: 100% !important; max-width: 100% !important; max-height: calc(100dvh - 24px) !important; }
          .uvp-scroll { padding-top: 8px !important; }
          .uvp-footer { gap: 0 !important; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)) !important; }
          .uvp-file-selection { margin-bottom: 4px !important; }
          .uvp-mapping-section { margin-top: 4px; }
          .uvp-mapping-list { gap: 12px !important; }
          .uvp-mapping-row {
            border-width: 1px !important;
            border-color: transparent !important;
            border-radius: 14px !important;
            background: color-mix(in srgb, var(--surface-raised) 62%, var(--surface)) !important;
          }
          .uvp-mapping-row[data-mapping-state="empty"] {
            border-color: var(--border) !important;
          }
          .uvp-mapping-row[data-needs-review="true"] {
            border-color: color-mix(in srgb, #d97706 48%, var(--border)) !important;
            background: color-mix(in srgb, #f59e0b 5%, var(--surface)) !important;
          }
          .uvp-mapping-grid {
            grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr) !important;
            align-items: start !important;
            column-gap: 8px !important;
            row-gap: 8px !important;
            padding: 12px !important;
          }
          .uvp-source-cell, .uvp-retouched-cell {
            width: 100%;
            align-items: stretch;
            flex-direction: column;
            gap: 6px;
          }
          .uvp-source-thumbnails { width: 100%; gap: 6px; }
          .uvp-source-asset { min-width: 0; flex: 1 1 0%; align-items: stretch; }
          .uvp-source-filename, .uvp-retouch-filename { font-size: 12px; line-height: 16px; }
          .uvp-source-filename, .uvp-retouch-meta, .uvp-retouched-cell > .uvp-retouch-filename { order: -1; }
          .uvp-mapping-thumb {
            width: 100%;
            height: auto;
            aspect-ratio: 4 / 3;
            border-radius: 10px;
          }
          .uvp-panel-mapping-arrow { align-self: start; margin-top: 60px; }
          .uvp-empty-retouch {
            width: 100%;
            min-height: 0;
            aspect-ratio: 4 / 3;
            justify-content: center;
            margin-top: 22px;
            padding: 8px;
            text-align: center;
          }
          .uvp-file-size { display: none; }
          .uvp-mapping-actions { display: none; }
        }
      `}</style>

      <aside
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className={`uvp-sheet ${styles.dialog}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(800px, 100%)",
          maxWidth: "100%",
          background: "var(--surface)",
          border: `1px solid ${BORDER}`,
          borderRadius: "20px",
          color: TEXT_NORMAL,
          display: "flex",
          flexDirection: "column",

          boxShadow: "0 20px 60px rgba(2,56,82,0.18)",
          overflow: "hidden",
          pointerEvents: "auto",
          fontFamily: "var(--font-pretendard, 'Pretendard Variable', 'Pretendard', sans-serif)",
        }}
      >
        <>
        {/* Header */}
        <header data-upload-panel-header className="flex min-h-14 shrink-0 items-center justify-between px-4 py-1.5 md:min-h-0 md:px-8 md:pb-0 md:pt-7">
          <div className="flex min-w-0 items-center gap-3">
            <span data-upload-title-icon className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent max-md:hidden" aria-hidden="true">
              <Upload size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 id={dialogTitleId} className="m-0 text-[24px] font-semibold leading-8 tracking-[-0.72px] text-foreground">
                <span className="md:hidden">{version === 1 ? "보정본 업로드" : "V2 보정본 업로드"}</span>
                <span className="hidden md:inline">{hasExistingRetouches ? "보정본 추가 업로드" : `${versionLabel} 업로드`}</span>
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || deletingExisting}
            aria-label="닫기"
            className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-lg text-subtle-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="uvp-scroll flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-4 md:pb-6 pt-4 md:pt-6">
          {/* targets summary */}
          <div className="mb-4 hidden items-center justify-between gap-3 text-sm md:flex md:flex-wrap">
            <div className="text-muted-foreground">
              <span className="text-subtle-foreground">대상</span>
              <span className="ml-1 font-semibold text-foreground">{targets.length}장</span>
              <span className="mx-2 text-border-strong">·</span>
              <span className="text-subtle-foreground">새 파일</span>
              <span className="ml-1 font-semibold text-foreground">{totalUploadFileCount}장</span>
            </div>
            <div
              className={`text-xs font-medium ${
                totalUploadFileCount === 0
                  ? "text-subtle-foreground"
                  : geminiMatching
                    ? "text-muted-foreground"
                    : needsReviewCount > 0
                      ? "text-amber-600"
                      : emptyCount > 0
                      ? "text-amber-600"
                      : "text-success"
              }`}
            >
              {totalUploadFileCount === 0
                ? null
                : geminiMatching
                  ? "자동 매칭 중"
                  : needsReviewCount > 0
                    ? `${mappedCount}/${targets.length} 준비 · ${needsReviewCount}장 확인 필요`
                    : emptyCount > 0
                    ? `${emptyCount}장 확인 필요 · ${mappedCount}/${targets.length} 매칭`
                    : `${mappedCount}/${targets.length} 준비 완료`}
            </div>
          </div>

          {/* Beta limit warning */}
          {overBetaLimit ? (
            <div className="rounded-2xl bg-rose-500/5 border border-rose-500/30 px-5 py-5 mb-5 flex flex-col items-center gap-2 text-center">
              <AlertCircle size={20} className="text-rose-400" />
              <div className="text-sm text-rose-300 font-semibold">
                베타 기간 최대 보정 횟수({betaMaxRevisionCount}회)에 도달했습니다.
              </div>
              <div className="text-[11px] text-subtle-foreground">
                현재 {existingVersionCount} / {betaMaxRevisionCount}회 사용 중
              </div>
            </div>
          ) : targets.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-subtle-foreground">
              {version === 1
                ? "선택된 사진이 없습니다."
                : "재보정 요청된 사진이 없습니다."}
            </div>
          ) : (
            <>
              {/* File selection: large before selection, compact after selection */}
              <div className="uvp-file-selection mb-5">
                {totalUploadFileCount === 0 && !hasExistingRetouches ? (
                  <div
                    role="button"
                    tabIndex={0}
                    className={`uvp-dropzone${dragOver ? " uvp-over" : ""} cursor-pointer rounded-xl flex min-h-[220px] flex-col items-center justify-center bg-transparent px-7 py-8`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        multiInputRef.current?.click();
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
                    onClick={() => multiInputRef.current?.click()}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong bg-background">
                      <ImageIcon size={24} className="text-accent" strokeWidth={1.5} />
                    </div>
                    <p className="mb-0 mt-4 text-[18px] font-semibold leading-7 tracking-[-0.36px] text-foreground">
                      {hasExistingRetouches ? "추가할 보정본을 올려주세요" : "보정본 파일을 올려주세요"}
                    </p>
                    <p className="m-0 mt-1 text-[13px] leading-5 text-subtle-foreground">
                      끌어다 놓거나 버튼으로 선택하세요
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        multiInputRef.current?.click();
                      }}
                      className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#e94b0d]"
                    >
                      파일 선택
                    </button>
                  </div>
                ) : (
                  <div
                    data-upload-selection-summary
                    className="flex min-h-[88px] items-center gap-4 rounded-xl border px-5 py-4"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-raised)",
                    }}
                  >
                    <div
                      data-upload-selection-icon
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-surface"
                      style={{
                        borderColor:
                          totalUploadFileCount > 0
                            ? "color-mix(in srgb, var(--accent) 30%, var(--border))"
                            : "var(--border)",
                      }}
                    >
                      {totalUploadFileCount > 0 ? (
                        <CheckCircle2 size={22} className="text-accent" />
                      ) : (
                        <ImageIcon size={21} className="text-muted-foreground" strokeWidth={1.5} />
                      )}
                    </div>
                    <div data-upload-selection-copy className="min-w-0 flex-1">
                      <p className="m-0 text-[13px] font-semibold text-foreground md:hidden">
                        {totalUploadFileCount}/{targets.length}장 선택
                        {totalUploadFileCount > 0 ? (
                          <span className="font-normal text-subtle-foreground"> · {formatStoredFileSizeBytes(selectedUploadBytes)}</span>
                        ) : null}
                        {needsReviewCount > 0 ? <span className="font-medium text-amber-700"> · 확인 {needsReviewCount}</span> : null}
                      </p>
                      <p className="m-0 hidden text-sm font-semibold text-foreground md:block">
                        {totalUploadFileCount > 0
                          ? `${totalUploadFileCount}장 파일 선택`
                          : emptyCount > 0
                            ? `남은 보정본 ${emptyCount}장을 추가하세요`
                            : "교체할 보정본을 선택하세요"}
                      </p>
                      <p className="m-0 mt-1 hidden text-[12px] text-subtle-foreground md:block">
                        {totalUploadFileCount > 0
                          ? `총 ${formatStoredFileSizeBytes(selectedUploadBytes)}`
                          : `현재 ${stats.server}장 연결됨`}
                      </p>
                    </div>
                    <div data-upload-selection-actions className="flex shrink-0 items-center gap-2 max-md:[&>button]:min-h-11 max-md:[&>button]:min-w-0 max-md:[&>button]:px-3">
                      {totalUploadFileCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetSelection}
                          className="rounded-lg px-3 py-2 text-[12px] font-medium text-subtle-foreground transition-colors hover:bg-surface hover:text-foreground max-md:hidden"
                        >
                          선택 초기화
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => multiInputRef.current?.click()}
                        className="rounded-lg border border-border bg-surface px-4 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                      >
                        <span className="md:hidden">{totalUploadFileCount > 0 ? "파일 다시 선택" : "파일 선택"}</span>
                        <span className="hidden md:inline">{totalUploadFileCount > 0 ? "다시 선택" : "파일 선택"}</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2.5 hidden items-center gap-1.5 pl-1 text-[11px] text-subtle-foreground md:flex">
                  <Info size={12} strokeWidth={2} />
                  <span>파일명이 같으면 자동 매핑 · 다르면 AI 유사도로 매칭 · 안 되면 직접 선택</span>
                </div>
                {geminiMatching && (
                  <div className="flex items-center gap-1.5 mt-2 pl-1 text-[11px] text-accent">
                    <span
                      aria-hidden
                      className="inline-block w-3 h-3 rounded-full border-2 border-accent/30 border-t-accent"
                      style={{ animation: "uvp-spin 0.9s linear infinite" }}
                    />
                    AI 이미지 유사도 매칭 중…
                  </div>
                )}
                {fileSelectionMessages.length > 0 && (
                  <div
                    className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3 text-[11px] leading-5 text-amber-700"
                    role="status"
                    aria-live="polite"
                  >
                    {fileSelectionMessages.map((message) => (
                      <div key={message} className="flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-1 shrink-0" />
                        <span>{message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {fileCountNotice ? (
                  <>
                    <div className="mt-2 hidden items-start gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3 text-[11px] leading-5 text-amber-700 md:flex" role="status">
                      <Info size={12} className="mt-1 shrink-0" />
                      <span>{fileCountNotice}</span>
                    </div>
                    {mobileFileCountNotice ? (
                      <p data-mobile-selection-note className="m-0 mt-2 text-[11px] leading-4 text-subtle-foreground md:hidden" role="status">
                        {mobileFileCountNotice}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {totalUploadFileCount === 0 && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      aria-expanded={showManualMapping}
                      onClick={() => setShowManualMapping((current) => !current)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                    >
                      <span className="md:hidden">사진별 선택</span>
                      <span className="hidden md:inline">{hasExistingRetouches ? "현재 연결 및 사진별 선택" : "사진별로 직접 선택"}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${showManualMapping ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Mapping result */}
              {mapping.length > 0 && (totalUploadFileCount > 0 || showManualMapping) && (
                <div className="uvp-mapping-section">
                  {totalUploadFileCount > 0 || stats.exact > 0 || stats.fuzzy > 0 || stats.gemini > 0 || stats.geminiLow > 0 ? (
                  <div className="mb-3.5 hidden items-center justify-between gap-3 md:flex">
                    <h3 className="text-sm font-semibold text-foreground m-0">
                      {totalUploadFileCount === 0 ? null : "매칭 결과"}
                    </h3>
                    {(stats.exact > 0 ||
                      stats.fuzzy > 0 ||
                      stats.gemini > 0 ||
                      stats.geminiLow > 0 ||
                      stats.order > 0) && (
                      <div className="flex items-center gap-3 text-[11px]">
                        {stats.exact > 0 && (
                          <StatChip dotColor="bg-border-strong" textColor="text-muted-foreground" label={`파일명 ${stats.exact}`} />
                        )}
                        {stats.fuzzy > 0 && (
                          <StatChip dotColor="bg-border-strong" textColor="text-muted-foreground" label={`유사 ${stats.fuzzy}`} />
                        )}
                        {stats.gemini > 0 && (
                          <StatChip dotColor="bg-border-strong" textColor="text-muted-foreground" label={`AI ${stats.gemini}`} />
                        )}
                        {stats.geminiLow > 0 && (
                          <StatChip dotColor="bg-amber-500" textColor="text-amber-700" label={`AI 확인 ${stats.geminiLow}`} />
                        )}
                        {stats.order > 0 && (
                          <StatChip dotColor="bg-amber-500" textColor="text-amber-700" label={`순서 확인 ${stats.order}`} />
                        )}
                      </div>
                    )}
                  </div>
                  ) : null}

                  <div
                    className="uvp-mapping-columns mb-1.5 hidden items-center px-3.5 text-[11px] font-medium text-subtle-foreground md:grid"
                    style={{ gridTemplateColumns: "minmax(0, 1fr) 20px minmax(0, 1fr) 204px" }}
                    aria-hidden="true"
                  >
                    <span>원본 사진</span><span /><span>업로드 파일</span><span className="text-right">매칭 상태 · 관리</span>
                  </div>

                  <div className="uvp-mapping-list flex flex-col gap-1.5">
                    {/* 매칭 상태가 바뀌어도 행 위치는 원본 사진 순서를 유지한다. */}
                    {mapping.map((m) => (
                      <PanelMappingRow
                        key={m.target.id}
                        target={m.target}
                        file={m.file}
                        type={m.type}
                        similarity={m.similarity}
                        previewUrl={localPreviewMap.get(m.target.id)}
                        onChangeOne={handleChangeOne}
                        onDeleteLocalFile={handleDeleteLocalFile}
                        onDeleteExisting={(target) => {
                          setDeleteExistingError(null);
                          setDeleteCandidate(target);
                        }}
                        allowDeleteExisting={allowDeleteExisting}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer / action bar */}
        {!overBetaLimit && targets.length > 0 ? (
          <footer className="uvp-footer shrink-0 border-t border-border-subtle bg-surface px-8 py-5 flex flex-col gap-3">
            {/* 긴 매칭 목록을 보고 있어도 업로드 오류를 놓치지 않도록 고정 영역에 둔다. */}
            {error && (
              <div className="rounded-lg bg-rose-500/[0.07] px-3.5 py-2.5 text-[12px] text-danger" role="alert">
                {error}
              </div>
            )}
            {/* Actual transfer progress only; matching status belongs to the body. */}
            {submitting && (
              <div>
                <div className="flex items-center justify-between mb-1.5 gap-3">
                  <span className="text-[11px] font-semibold text-muted-foreground">업로드 진행도</span>
                  <span className="text-[11px] text-accent font-medium">
                    {serverProcessing
                      ? "서버 처리 중…"
                      : totalBytes > 0
                        ? `${uploadPct}% · ${formatStoredFileSizeBytes(uploadedBytes)} / ${formatStoredFileSizeBytes(totalBytes)}`
                        : `${uploadPct}%`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden" role="progressbar" aria-label="보정본 업로드 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPct}>
                  <div
                    className="h-full bg-accent relative transition-[width] duration-300"
                    style={{ width: `${uploadPct}%` }}
                  >
                    <div
                      className="absolute inset-0 bg-white/15"
                      style={{ width: "25%", animation: "uvp-bar-scan 2s linear infinite" }}
                    />
                  </div>
                </div>
                {totalUploadFileCount > 0 && (
                  <p className="mt-1.5 text-[10px] text-subtle-foreground">
                    총 {totalUploadFileCount}장
                    {totalBytes > 0 ? ` · 합계 ${formatStoredFileSizeBytes(totalBytes)}` : ""}
                  </p>
                )}
              </div>
            )}

            {/* deliver */}
            <div className="flex flex-col items-stretch md:flex-row md:items-center justify-between gap-3 md:gap-4">
              <p className={`m-0 hidden text-[11px] md:block ${canDeliver ? "text-muted-foreground" : "text-subtle-foreground"}`} role="status">
                {submitting
                  ? `${totalUploadFileCount}장을 안전하게 업로드하고 있습니다.`
                  : canDeliver
                    ? `선택한 보정본 ${totalUploadFileCount}장을 업로드합니다.`
                    : deliverDisabledReason}
              </p>
              <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:[&>button]:min-h-11 max-md:[&>button]:min-w-0 max-md:[&>button]:flex-1 max-md:[&>button]:px-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting || deletingExisting}
                  className="min-w-[104px] rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeliver}
                  disabled={!canDeliver || submitting}
                  title={!canDeliver ? deliverDisabledReason ?? undefined : undefined}
                  className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#e94b0d] disabled:cursor-not-allowed disabled:bg-border disabled:text-subtle-foreground"
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
                      {totalUploadFileCount > 0 ? `${totalUploadFileCount}장 업로드` : "업로드"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </footer>
        ) : null}
        </>

        {/* Hidden file inputs */}
        <input
          ref={multiInputRef}
          type="file"
          multiple
          accept={ACCEPT_IMAGE_TYPES}
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            handleDropFiles(files);
          }}
        />
        <input
          ref={perItemInputRef}
          type="file"
          accept={ACCEPT_IMAGE_TYPES}
          style={{ display: "none" }}
          onChange={(e) => {
            const files = e.currentTarget.files;
            handlePerItemSelect(files);
            e.currentTarget.value = "";
          }}
        />
      </aside>

      <PhotographerConfirmDialog
        open={deleteCandidate !== null}
        onClose={() => {
          if (!deletingExisting) {
            setDeleteCandidate(null);
            setDeleteExistingError(null);
          }
        }}
        onConfirm={() => void handleDeleteExisting()}
        title="보정본을 삭제할까요?"
        description="삭제한 보정본은 복구할 수 없습니다."
        error={deleteExistingError}
        confirmLabel="삭제"
        pendingLabel="삭제 중…"
        pending={deletingExisting}
        tone="danger"
        compact
      />
    </div>
    </PhotographerPortal>
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

// ── Mapping row (compact) ────────────────────────────────────────────────────

function PanelMappingRow({
  target,
  file,
  type,
  similarity,
  previewUrl,
  onChangeOne,
  onDeleteLocalFile,
  onDeleteExisting,
  allowDeleteExisting,
}: {
  target: UploadPanelTarget;
  file: File | null;
  type: MappingType;
  similarity?: number;
  previewUrl?: string;
  onChangeOne: (id: string) => void;
  onDeleteLocalFile: (id: string) => void;
  onDeleteExisting: (target: UploadPanelTarget) => void;
  allowDeleteExisting: boolean;
}) {
  const [origErr, setOrigErr] = useState(false);
  const [v1Err, setV1Err] = useState(false);
  const [retouchErr, setRetouchErr] = useState(false);
  const state =
    type === "exact" || type === "fuzzy" || type === "gemini"
      ? "matched"
      : type === "gemini_low"
        ? "gemini_low"
        : type === "order"
          ? "ordered"
          : type === "server"
            ? "server"
            : "empty";
  const isPendingUpload = file !== null;
  const needsReview = state === "gemini_low" || state === "ordered";
  const borderClass =
    needsReview
      ? "border-amber-400/50"
      : state === "empty"
        ? "border-border-subtle"
        : "border-transparent";
  const fileSizeStr = file && file.size > 0 ? formatStoredFileSizeBytes(file.size) : "";
  const origSrc = viewerImageUrl(target.photo);

  const primaryActionLabel = "파일 변경";
  const primaryActionClass = "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20";
  const mappingStatusLabel =
    type === "exact" ? "파일명 일치"
      : type === "fuzzy" ? "파일명 유사"
        : type === "gemini" ? "AI 매칭"
          : type === "gemini_low" ? `AI 확인 필요${similarity != null ? ` ${Math.round(similarity * 100)}%` : ""}`
            : type === "order" ? "순서 확인 필요"
              : type === "server" ? "업로드됨"
                : "미선택";

  return (
    <div
      data-mapping-state={state}
      data-pending-upload={isPendingUpload ? "true" : "false"}
      data-needs-review={needsReview ? "true" : undefined}
      className={`uvp-mapping-row rounded-xl border ${borderClass} ${needsReview ? "bg-amber-500/[0.035]" : "bg-surface-raised/55"} overflow-hidden transition-colors`}
    >
      <div
        className="uvp-mapping-grid grid items-center gap-2 px-3.5 py-2.5"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 20px minmax(0, 1fr) 204px" }}
      >
        {/* Left: original (+v1 if provided) + filename + comment */}
        <div className="uvp-source-cell flex min-w-0 items-center gap-2.5">
          <div className="uvp-source-thumbnails flex gap-2 shrink-0">
            <div className={`uvp-source-asset flex flex-col items-center gap-0.5 ${target.v1Url ? "max-md:hidden" : ""}`}>
              <span className="text-[12px] font-medium leading-4 text-subtle-foreground max-md:hidden">원본</span>
              <div className="uvp-mapping-thumb flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                {origSrc && !origErr ? (
                  <img
                    src={origSrc}
                    alt=""
                    onError={() => setOrigErr(true)}
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <ImageIcon size={14} className="text-subtle-foreground" />
                )}
              </div>
            </div>
            {target.v1Url ? (
              <div className="uvp-source-asset flex flex-col items-center gap-0.5">
                <span className="text-[12px] font-medium leading-4 text-accent/70 max-md:hidden">V1</span>
                <div className="uvp-mapping-thumb flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-accent/25 bg-background">
                  {!v1Err ? (
                    <img
                      src={target.v1Url}
                      alt=""
                      onError={() => setV1Err(true)}
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <ImageIcon size={14} className="text-subtle-foreground" />
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="uvp-source-filename min-w-0 flex-1">
            <span className="uvp-mobile-column-label mb-0.5 hidden text-[10px] font-semibold text-subtle-foreground max-md:block">원본 사진</span>
            <div
              className="truncate text-[12px] font-medium text-muted-foreground"
              title={target.filename}
            >
              {target.filename}
            </div>
          </div>
        </div>

        <div data-mobile-mapping-arrow className="uvp-panel-mapping-arrow flex justify-center text-subtle-foreground">
          <ArrowRight size={13} />
        </div>

        {/* Right: retouched */}
        {state === "empty" ? (
          <button
            type="button"
            onClick={() => onChangeOne(target.id)}
            aria-label={`${target.filename} 보정본 파일 선택`}
            className="uvp-empty-retouch group/empty flex min-h-12 min-w-0 items-center gap-2.5 rounded-lg border border-dashed border-border-strong bg-surface-raised px-3 text-left text-muted-foreground transition-colors hover:border-accent hover:bg-accent/[0.05] hover:text-accent focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface text-subtle-foreground transition-colors group-hover/empty:text-accent">
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="min-w-0"><span className="mb-0.5 hidden text-[10px] font-semibold text-subtle-foreground max-md:block">업로드 파일</span><span className="block truncate text-[12px] font-semibold">파일 선택</span></span>
          </button>
        ) : state === "server" ? (
          <div className="uvp-retouched-cell flex min-w-0 items-center gap-2.5">
            <div className="uvp-mapping-thumb relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
              {target.serverRetouchUrl && !retouchErr ? (
                <img
                  src={target.serverRetouchUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <ImageIcon size={14} className="text-subtle-foreground" />
              )}
              {allowDeleteExisting && !target.deleteLocked && target.serverVersionId ? (
                <button
                  type="button"
                  onClick={() => onDeleteExisting(target)}
                  aria-label={`${target.filename} 업로드된 보정본 삭제`}
                  data-remove-retouch
                  className="absolute -right-2.5 -top-2.5 z-[1] grid h-11 w-11 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 md:hidden"
                >
                  <span data-remove-retouch-face className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-danger shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
                    <X size={12} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </button>
              ) : null}
            </div>
            <div className="uvp-retouch-meta min-w-0 flex-1">
              <span className="uvp-mobile-column-label mb-0.5 hidden text-[10px] font-semibold text-subtle-foreground max-md:block">업로드 파일</span>
              <div className="uvp-retouch-filename truncate text-[12px] font-medium text-muted-foreground" title={target.filename}>{target.filename}</div>
              <span className="uvp-mobile-status mt-1 hidden text-[10px] text-subtle-foreground max-md:block">{mappingStatusLabel}</span>
            </div>
            <button type="button" onClick={() => onChangeOne(target.id)} aria-label={`${target.filename} 업로드 파일 변경`} className="uvp-mobile-change hidden min-h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-[11px] font-semibold text-muted-foreground max-md:inline-flex">파일 변경</button>
          </div>
        ) : (
          <div className="uvp-retouched-cell flex min-w-0 items-center gap-2.5">
            <div
              className={`uvp-mapping-thumb relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background ${
                state === "gemini_low" ? "border-amber-500/45" : state === "ordered" ? "border-accent/35" : "border-border"
              }`}
            >
              {previewUrl && !retouchErr ? (
                <img
                  src={previewUrl}
                  alt=""
                  onError={() => setRetouchErr(true)}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <ImageIcon size={14} className="text-subtle-foreground" />
              )}
              {file !== null ? (
                <button
                  type="button"
                  onClick={() => onDeleteLocalFile(target.id)}
                  aria-label={`${file.name} 선택한 보정본 삭제`}
                  data-remove-retouch
                  className="absolute -right-2.5 -top-2.5 z-[1] grid h-11 w-11 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 md:hidden"
                >
                  <span data-remove-retouch-face className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-danger shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
                    <X size={12} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </button>
              ) : null}
            </div>
            <div className="uvp-retouch-meta flex-1 min-w-0">
              <span className="uvp-mobile-column-label mb-0.5 hidden text-[10px] font-semibold text-subtle-foreground max-md:block">업로드 파일</span>
              <div className="uvp-retouch-filename text-[12px] font-medium text-muted-foreground truncate" title={file?.name}>
                {file?.name ?? ""}
              </div>
              {fileSizeStr ? (
                <div className="uvp-file-size text-[10.5px] text-subtle-foreground mt-0.5">{fileSizeStr}</div>
              ) : null}
              <span className={`uvp-mobile-status mt-1 hidden text-[10px] font-medium max-md:block ${needsReview ? "text-amber-700" : "text-subtle-foreground"}`}>{mappingStatusLabel}</span>
            </div>
            <button type="button" onClick={() => onChangeOne(target.id)} aria-label={`${target.filename} 업로드 파일 변경`} className="uvp-mobile-change hidden min-h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-[11px] font-semibold text-muted-foreground max-md:inline-flex">파일 변경</button>
          </div>
        )}

        {/* Actions */}
        {state !== "empty" ? (
          <div className="uvp-mapping-actions flex shrink-0 items-center justify-end gap-1.5 pl-2 max-md:hidden">
            <span className={`whitespace-nowrap px-1.5 py-0.5 text-[10px] font-semibold ${needsReview ? "rounded-md bg-amber-500/10 text-amber-700" : "text-subtle-foreground"}`}>{mappingStatusLabel}</span>
            <button
              type="button"
              onClick={() => onChangeOne(target.id)}
              aria-label={primaryActionLabel}
              data-change-file
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors md:min-h-9 ${primaryActionClass}`}
            >
              <span className="md:hidden">변경</span>
              <span className="hidden md:inline">{primaryActionLabel}</span>
            </button>
            {file !== null ? (
              <button
                type="button"
                onClick={() => onDeleteLocalFile(target.id)}
                aria-label={`${file.name} 선택한 보정본 삭제`}
                className="inline-flex h-11 w-11 items-center justify-center gap-1 rounded-md border border-border bg-surface p-0 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 md:h-9 md:w-auto md:whitespace-nowrap md:border-danger/35 md:bg-danger/[0.04] md:px-2.5 md:py-1 md:text-danger md:hover:border-danger/50 md:hover:bg-danger/[0.08] md:hover:text-danger md:focus-visible:ring-danger/20"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                <span className="max-md:sr-only">삭제</span>
              </button>
            ) : null}
            {allowDeleteExisting && !target.deleteLocked && state === "server" && target.serverVersionId ? (
              <button
                type="button"
                onClick={() => onDeleteExisting(target)}
                aria-label={`${target.filename} 업로드된 보정본 삭제`}
                className="inline-flex h-11 w-11 items-center justify-center gap-1 rounded-md border border-border bg-surface p-0 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 md:h-9 md:w-auto md:whitespace-nowrap md:border-danger/35 md:bg-danger/[0.04] md:px-2.5 md:py-1 md:text-danger md:hover:border-danger/50 md:hover:bg-danger/[0.08] md:hover:text-danger md:focus-visible:ring-danger/20"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                <span className="max-md:sr-only">삭제</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {target.comment?.trim() ? (
        <div className="px-3.5 pb-2.5 pt-0.5">
          <PhotoCardComment comment={target.comment} showLabel={false} compact minimal className="!mt-0" />
        </div>
      ) : null}
    </div>
  );
}
