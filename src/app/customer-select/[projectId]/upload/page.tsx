"use client";

/**
 * S4 — 사진 업로드. 원본 파일명은 유지하되, 전송 전 브라우저에서 해상도·용량을 줄인다 —
 * 작가 업로드 화면이 쓰는 압축 유틸(upload-client-compress.ts)이 identity 비의존이라
 * 그대로 재사용한다(단계 0 분석 결과). 압축된 결과만 BE로 전송, 썸네일·프리뷰 생성은 BE 담당.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CUSTOMER_PHOTO_LIMIT as MAX_PHOTOS, uploadLimitError } from "../../_lib/upload-limit";
import { CheckCircle2, SlidersHorizontal, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { OriginalPhotoViewer } from "@/components/photographer/OriginalPhotoViewer";
import { PhotoUploadTile } from "@/components/photographer/PhotoUploadTile";
import { PhotoSortSelect } from "@/components/photographer/PhotoSortSelect";
import { ProjectAssetMobileIconButton, ProjectAssetMobileSheet, ProjectAssetToolbarSummary } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { readTakenAt } from "@/lib/exif-taken-at";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { getPhotoDisplayName, matchesFilenameQuery } from "@/lib/gallery-filter";
import { estimateUploadRemainingSeconds, formatUploadRemainingTime, type UploadTimingSample } from "@/lib/upload-time-estimate";
import { useCollapsibleAssetHeaderController } from "@/hooks/useCollapsibleAssetHeader";
import type { Photo } from "@/types";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";

// 사진(File)마다 한 번 정한 업로드 ID를 재시도에도 그대로 보낸다 — 서버가 응답을 못 돌려줬어도
// 이미 저장된 사진은 같은 ID라 다시 저장되지 않는다.
const clientUploadIds = new WeakMap<File, string>();
function clientUploadId(file: File) {
  let id = clientUploadIds.get(file);
  if (!id) clientUploadIds.set(file, id = crypto.randomUUID());
  return id;
}
import { CUSTOMER_GALLERY_GRID } from "../../_lib/photo-grid";
import { ProjectStepHeader } from "../../_lib/ProjectStepHeader";
import { rememberGroupSimilar, setAsideKey, startAiTidy } from "../select/AiTidySheet";
import { UploadDoneSheet } from "./UploadDoneSheet";
import { useCustomerSelectStore } from "../../_lib/real-store";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";

const BATCH_SIZE = 20;
// ponytail: 작가 화면의 PC/모바일 적응형 동시성 대신 보수적인 고정값 하나만 쓴다.
// 단말별 실측에서 병목이 확인되면 그때 분리한다.
const COMPRESS_POOL_SIZE = 3;
// 한 묶음의 서버 처리가 이보다 오래 걸리면 멈춘 게 아니라는 안내를 보여준다.
const SLOW_BATCH_NOTICE_MS = 10_000;

type DeleteImpact = {
  photoCount: number;
  finalSelections: number;
  likes: number;
  ratings: number;
  comments: number;
  aiPhotos: number;
  retouchedVersions: number;
};

type AccountUsage = { photoCount: number; limit: number; remaining: number };

async function getAccountUsage(): Promise<AccountUsage> {
  const response = await fetch("/api/customer-select/usage", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "사진 이용량을 확인하지 못했어요.");
  return data as AccountUsage;
}

export default function CustomerUploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated, refresh } = useCustomerSelectStore();
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [checkingCapacity, setCheckingCapacity] = useState(false);
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const [needsReselection, setNeedsReselection] = useState(false);
  const uploadStartingRef = useRef(false);
  const [uploadPhase, setUploadPhase] = useState<"compressing" | "uploading" | null>(null);
  const [slowBatch, setSlowBatch] = useState(false);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // AI 정리 시트: 열린 이유가 "정리하고 고르기"면 시작 후 고르기로 이동한다.
  // 업로드를 마치면 완료 안내(다음 단계: AI 정리하고 고르기 / 더 올리기)를 띄운다 — 업로드 화면을 고르는 화면으로 착각하지 않게.
  const [doneOpen, setDoneOpen] = useState(false);
  const [aiSheetError, setAiSheetError] = useState<string | null>(null);
  // 방금 올린 장수. 업로드가 끝나면 모달 대신 하단 바에서 AI 정리와 다음 단계를 함께 제안한다.
  const [justUploaded, setJustUploaded] = useState(0);
  // 전체 삭제로 연 확인 창인지 — 제목을 "사진을 모두 삭제할까요?"로 바꾼다.
  const [deleteAll, setDeleteAll] = useState(false);
  const [aiStarting, setAiStarting] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  // 기본은 촬영 시간순 — 장면·유사컷이 모두 촬영 시각 기준이라 빠진 구간이나 섞인 사진이 바로 보인다.
  const [sort, setSort] = useState<"taken-asc" | "order-asc" | "order-desc" | "name-asc">("taken-asc");
  const [nameFilter, setNameFilter] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  // 업로드 중에 더 끌어다 놓거나 고른 사진: 버리지 않고 모아 두었다가 지금 업로드가 끝나면 이어서 올린다.
  const queueRef = useRef<File[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const deleteSelectedPhotosRef = useRef<() => Promise<void>>(async () => {});
  const uploadAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const uploadTimingSamplesRef = useRef<UploadTimingSample[]>([]);
  const aiPollingRef = useRef(false);
  const { handleScroll: handleGalleryScroll } = useCollapsibleAssetHeaderController({ compactOnly: true });
  // 올리기·고르기·보내기 단계를 오갈 때 헤더 높이가 바뀌지 않게 항상 얇은 헤더를 쓴다.
  const compactUploadHeader = true;

  useEffect(() => () => {
    uploadAbortRef.current?.abort();
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(query.matches);
      setSelectedPhotoIds(new Set());
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void getAccountUsage().then(setAccountUsage).catch(() => undefined);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void Promise.all(["scene", "similarity", "quality"].map(async (kind) => {
      const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`);
      return response.ok ? (await response.json()).status as string | null : null;
    })).then((statuses) => {
      const processingKinds = ["scene", "similarity", "quality"].filter((_, index) => statuses[index] === "processing");
      if (processingKinds.length > 0) {
        setAiAnalyzing(true);
        void pollAiAnalysis(processingKinds);
      }
    }).catch(() => undefined);
    // pollAiAnalysis only depends on the current project and store refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, projectId]);

  function clearPendingPreviews() {
    previewUrlsRef.current.forEach(URL.revokeObjectURL);
    previewUrlsRef.current = [];
    setPendingPhotos([]);
  }

  /** carriedUploaded/carriedFailed: 대기열을 이어 올릴 때 앞 묶음의 결과(완료 안내·다시 시도 목록을 합쳐 보여준다). */
  async function handleFiles(selectedFiles: File[], carriedUploaded = 0, carriedFailed: File[] = []) {
    if (selectedFiles.length === 0) return;
    if (uploading || uploadStartingRef.current) {
      queueRef.current.push(...selectedFiles);
      setQueuedCount(queueRef.current.length);
      return;
    }
    uploadStartingRef.current = true;
    setCheckingCapacity(true);
    setNeedsReselection(false);
    try {
      const [, usage] = await Promise.all([refresh(), getAccountUsage()]);
      setAccountUsage(usage);
      const limitError = uploadLimitError(usage.photoCount, selectedFiles.length);
      if (limitError) {
        setError(limitError);
        setNeedsReselection(true);
        return;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "사진 수를 확인하지 못했어요.");
      return;
    } finally {
      uploadStartingRef.current = false;
      setCheckingCapacity(false);
    }
    setUploading(true);
    setJustUploaded(0);
    setError(null);
    setRetryFiles([]);
    setTotal(selectedFiles.length);
    setProgress(0);
    setUploadPhase("compressing");
    setEstimatedRemainingSeconds(null);
    uploadTimingSamplesRef.current = [];
    clearPendingPreviews();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    cancelRequestedRef.current = false;
    // 촬영 시각을 미리보기 만들 때 먼저 읽는다(파일 앞부분만 읽어 빠름) — 기본 정렬이 촬영 시간순이라
    // 시각 없는 미리보기는 맨 뒤에 붙었다가 업로드 후 제자리로 튀었다. 같은 값을 업로드에도 쓴다(압축이 EXIF를 지움).
    const takenAtAll = await Promise.all(selectedFiles.map(readTakenAt));
    const pending = selectedFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return {
        id: `pending-${crypto.randomUUID()}`,
        projectId,
        orderIndex: project.photoCount + index,
        url,
        previewUrl: url,
        originalFilename: file.name,
        sourceFileSize: file.size,
        takenAt: takenAtAll[index].takenAt,
        takenAtSource: takenAtAll[index].source,
        isPending: true,
        isUploading: false,
      } satisfies Photo;
    });
    setPendingPhotos(pending);

    const {
      data: { session },
    } = await createClient().auth.getSession();
    const authHeader: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    let uploaded = 0;
    const failedFiles: File[] = [];
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const batchStartedAt = performance.now();
      const rawBatch = selectedFiles.slice(i, i + BATCH_SIZE);
      const batchIds = new Set(pending.slice(i, i + BATCH_SIZE).map((photo) => photo.id));
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: true } : photo));

      let batch: File[];
      setUploadPhase("compressing");
      const takenAt = takenAtAll.slice(i, i + BATCH_SIZE);
      try {
        batch = await compressImagesInParallel(
          rawBatch,
          controller.signal,
          COMPRESS_POOL_SIZE,
          { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
        );
      } catch {
        batch = rawBatch; // 압축 실패 시 원본 그대로 업로드(작가 화면과 동일한 폴백 원칙)
      }

      const formData = new FormData();
      formData.append("project_id", projectId);
      batch.forEach((f) => formData.append("files", f));
      formData.append("taken_at", JSON.stringify(takenAt.map((item) => item.takenAt)));
      formData.append("taken_at_source", JSON.stringify(takenAt.map((item) => item.source)));
      formData.append("client_upload_ids", JSON.stringify(rawBatch.map(clientUploadId)));
      formData.append("original_filenames", JSON.stringify(rawBatch.map((file) => file.name))); // 압축하면 `이름.jpg`로 바뀐다
      setUploadPhase("uploading");
      const slowTimer = window.setTimeout(() => setSlowBatch(true), SLOW_BATCH_NOTICE_MS);
      try {
        const res = await fetch("/api/customer-select/upload/photos", { method: "POST", headers: authHeader, body: formData, signal: controller.signal })
          .finally(() => { window.clearTimeout(slowTimer); setSlowBatch(false); });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = data.detail;
          const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
          throw new Error(msg ?? "업로드 실패");
        }
        const data = await res.json() as { uploaded?: number; rejected?: string[]; rejected_indices?: number[] };
        // 실패는 배치 내 위치로 받는다 — 같은 이름의 파일이 여럿일 수 있다. 이름은 구 BE 응답 호환용.
        const rejectedIndices = new Set(data.rejected_indices ?? []);
        const rejectedNames = new Set(data.rejected_indices ? [] : data.rejected ?? []);
        const rejectedFiles = rawBatch.filter((file, index) => rejectedIndices.has(index) || rejectedNames.has(file.name));
        failedFiles.push(...rejectedFiles);
        uploaded += data.uploaded ?? Math.max(0, batch.length - rejectedFiles.length);
      } catch (e) {
        // 중단·오류 때는 대기 중이던 사진도 다시 시도 목록에 넣는다(아무것도 잃지 않게).
        const remainingFiles = [...carriedFailed, ...failedFiles, ...selectedFiles.slice(i), ...queueRef.current.splice(0)];
        setQueuedCount(0);
        setRetryFiles(remainingFiles);
        setError(cancelRequestedRef.current
          ? `업로드를 중단했습니다. 남은 ${remainingFiles.length.toLocaleString()}장을 다시 시도할 수 있어요.`
          : e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
        setUploading(false);
        setUploadPhase(null);
        setEstimatedRemainingSeconds(null);
        uploadAbortRef.current = null;
        await Promise.all([refresh(), getAccountUsage().then(setAccountUsage)]);
        clearPendingPreviews();
        return;
      }
      uploadTimingSamplesRef.current = [
        ...uploadTimingSamplesRef.current,
        { milliseconds: performance.now() - batchStartedAt, photoCount: rawBatch.length },
      ].slice(-3);
      setEstimatedRemainingSeconds(estimateUploadRemainingSeconds(
        uploadTimingSamplesRef.current,
        selectedFiles.length - i - rawBatch.length
      ));
      setProgress(uploaded);
      setPendingPhotos((current) => current.map((photo) => batchIds.has(photo.id) ? { ...photo, isUploading: false } : photo));
    }
    await Promise.all([refresh(), getAccountUsage().then(setAccountUsage)]);
    clearPendingPreviews();
    setUploading(false);
    setUploadPhase(null);
    setEstimatedRemainingSeconds(null);
    uploadAbortRef.current = null;
    const allUploaded = carriedUploaded + uploaded;
    const allFailed = [...carriedFailed, ...failedFiles];
    // 업로드 중에 더 넣은 사진이 있으면 이어서 올린다(용량 확인·압축·촬영 시각 읽기를 그대로 다시 거친다).
    const queued = queueRef.current.splice(0);
    setQueuedCount(0);
    if (queued.length) {
      void handleFiles(queued, allUploaded, allFailed);
      return;
    }
    setRetryFiles(allFailed);
    if (allFailed.length > 0) {
      setError(`${allUploaded.toLocaleString()}장은 업로드했고 ${allFailed.length.toLocaleString()}장은 처리하지 못했습니다.`);
    } else if (allUploaded > 0) {
      setJustUploaded(allUploaded);
      setDoneOpen(true);
    }
  }

  function goSelect() {
    router.push(`/customer-select/${projectId}/select`);
  }

  function cancelUpload() {
    cancelRequestedRef.current = true;
    uploadAbortRef.current?.abort();
  }

  /** 완료 안내에서 누를 때만 AI 정리를 기본값(장면·유사컷·흔들림)으로 시작하고 고르기로 간다. 시작하지 못하면 안내에 이유를 보여준다. */
  async function startTidy() {
    setAiStarting(true);
    setAiSheetError(null);
    try {
      // 고르기 화면 보기 설정도 AI 정리 시트의 기본값과 같게: 유사컷 묶기·흔들림 빼기 켬.
      rememberGroupSimilar(projectId, true);
      try { localStorage.setItem(setAsideKey(projectId), "1"); } catch {}
      // 하나라도 시작하지 못하면 이 안내에 머문다 — 다시 누르면 진행 중인 작업은 넘어가고 실패한 작업만 다시 시작된다.
      const { error } = await startAiTidy(projectId, ["scene", "similarity", "quality"], project.shootType);
      if (error) throw new Error(error);
      router.push(`/customer-select/${projectId}/select`);
    } catch (e) {
      setAiSheetError(e instanceof Error && e.message ? e.message : "인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setAiStarting(false);
    }
  }

  async function pollAiAnalysis(kinds: string[]) {
    if (aiPollingRef.current) return;
    aiPollingRef.current = true;
    try {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        const statuses = await Promise.all(kinds.map(async (kind) => {
          const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`);
          if (!response.ok) return "failed";
          return (await response.json()).status as string | null;
        }));
        if (statuses.every((status) => status !== "processing")) {
          setAiAnalyzing(false);
          await refresh();
          if (statuses.includes("failed")) setError("일부 AI 분석을 완료하지 못했습니다.");
          return;
        }
      }
      setAiAnalyzing(false);
    } finally {
      aiPollingRef.current = false;
    }
  }

  /** 삭제 영향(찜·메모·AI 분석 등)을 확인하고 확인 창을 띄운다. 기본은 고른 사진, 전체 삭제는 올린 사진 전부. */
  async function requestDeleteSelectedPhotos(ids?: string[]) {
    const photoIds = ids ?? [...selectedPhotoIds];
    if (!photoIds.length || checkingDelete) return;
    setDeleteAll(Boolean(ids));
    setCheckingDelete(true);
    setError(null);
    try {
      const response = await fetch(`/api/customer-select/projects/${projectId}/delete-impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_ids: photoIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "삭제 영향을 확인하지 못했습니다.");
      setPendingDeleteIds(photoIds);
      setDeleteImpact(data as DeleteImpact);
      setDeleteError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 영향을 확인하지 못했습니다.");
    } finally {
      setCheckingDelete(false);
    }
  }

  async function deleteSelectedPhotos() {
    if (!pendingDeleteIds.length || !deleteImpact) return;
    setDeleting(true);
    setDeleteError(null);
    const {
      data: { session },
    } = await createClient().auth.getSession();
    try {
      const res = await fetch("/api/customer-select/upload/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ project_id: projectId, photo_ids: pendingDeleteIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "사진 삭제 실패");
      setSelectedPhotoIds(new Set());
      setPendingDeleteIds([]);
      setDeleteImpact(null);
      await Promise.all([refresh(), getAccountUsage().then(setAccountUsage)]);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "사진을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }
  deleteSelectedPhotosRef.current = requestDeleteSelectedPhotos;

  useEffect(() => {
    if (uploading || deleting || doneOpen || viewerPhotoId) return;
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPhotoIds(new Set(project.photos.map((photo) => photo.id)));
        return;
      }
      if (hasShortcutModifier(event)) return;
      if (event.key === "Escape" && selectedPhotoIds.size) {
        event.preventDefault();
        setSelectedPhotoIds(new Set());
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedPhotoIds.size) {
        event.preventDefault();
        void deleteSelectedPhotosRef.current();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [doneOpen, deleting, project.photos, selectedPhotoIds, uploading, viewerPhotoId]);

  useEffect(() => {
    if (!uploading) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [uploading]);

  const displayName = project.name || "이름 없는 프로젝트";
  const displayedPhotos = useMemo(() => [...project.photos, ...pendingPhotos], [project.photos, pendingPhotos]);
  const sortedPhotos = useMemo(() => [...displayedPhotos].sort((a, b) => {
    // 촬영 시각 없는 사진(카톡·캡처 등)은 뒤로. 시각 문자열은 같은 형식(카메라 현지 시각)이라 문자열 비교로 충분하다.
    if (sort === "taken-asc") return (a.takenAt ?? "\uffff").localeCompare(b.takenAt ?? "\uffff") || a.orderIndex - b.orderIndex;
    if (sort === "order-desc") return b.orderIndex - a.orderIndex;
    if (sort === "name-asc") return (a.originalFilename ?? "").localeCompare(b.originalFilename ?? "", "ko", { numeric: true });
    return a.orderIndex - b.orderIndex;
  }), [displayedPhotos, sort]);
  const visiblePhotos = useMemo(
    () => nameFilter.trim() ? sortedPhotos.filter((photo) => matchesFilenameQuery(getPhotoDisplayName(photo), nameFilter)) : sortedPhotos,
    [nameFilter, sortedPhotos]
  );
  const viewerPhotos = visiblePhotos.filter((photo) => !photo.isPending);
  const viewerIndex = viewerPhotoId ? viewerPhotos.findIndex((photo) => photo.id === viewerPhotoId) : -1;
  const deleteImpactItems = deleteImpact ? [
    deleteImpact.finalSelections && `최종 선택 ${deleteImpact.finalSelections.toLocaleString()}건`,
    deleteImpact.likes && `찜 ${deleteImpact.likes.toLocaleString()}건`,
    deleteImpact.ratings && `별점 ${deleteImpact.ratings.toLocaleString()}건`,
    deleteImpact.comments && `의견 ${deleteImpact.comments.toLocaleString()}건`,
    deleteImpact.aiPhotos && `AI 분석 ${deleteImpact.aiPhotos.toLocaleString()}장`,
    deleteImpact.retouchedVersions && `보정본 ${deleteImpact.retouchedVersions.toLocaleString()}개`,
  ].filter(Boolean) as string[] : [];
  const uploadStatus = uploading ? (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <svg className="size-[22px] shrink-0 -rotate-90" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="50.27" strokeDashoffset={50.27 * (1 - (total ? progress / total : 0))} />
      </svg>
      <div>
        <p className="text-sm font-bold text-foreground">{uploadPhase === "compressing" ? "사진 압축 중" : "사진 업로드 중"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{progress.toLocaleString()} / {total.toLocaleString()}장 · {total ? Math.round((progress / total) * 100) : 0}% · {estimatedRemainingSeconds === null ? "예상 시간 계산 중" : formatUploadRemainingTime(estimatedRemainingSeconds)}{queuedCount ? ` · 대기 ${queuedCount.toLocaleString()}장` : ""}</p>
        {slowBatch ? <p className="mt-1 text-xs font-semibold text-foreground">서버에서 사진을 정리하고 있어요. 인터넷이 느리면 조금 더 걸릴 수 있어요.</p> : null}
      </div>
    </div>
  ) : undefined;

  // 장면은 촬영 시각으로 나눈다(src/lib/customer-scenes.ts: 20장 이상·시각 있는 사진 80% 이상일 때만).
  // 카톡으로 받은 사진·캡처본은 시각이 빠져 있다. 고르는 데는 문제없으니 다시 올리라고 하지 않고, 어떻게 보이는지만 알린다.
  const untimedCount = project.photos.filter((photo) => !photo.takenAt).length;
  const scenesBlocked = project.photos.length >= 20 && untimedCount > project.photos.length * 0.2;
  const showUploadDone = justUploaded > 0 && !uploading && retryFiles.length === 0 && selectedPhotoIds.size === 0;
  const uploadDone = showUploadDone ? (
    <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-5" role="status">
      <p className="flex items-center gap-1.5 text-sm font-bold text-foreground"><CheckCircle2 size={16} className="text-primary" aria-hidden />{justUploaded.toLocaleString()}장 올렸어요</p>
    </div>
  ) : undefined;

  if (!hydrated) {
    return (
      <CustomerSelectShell viewportLocked>
        <main className="grid flex-1 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></main>
      </CustomerSelectShell>
    );
  }

  return (
    <CustomerSelectShell
      viewportLocked
      compactHeader={compactUploadHeader}
      compactTitle={<ProjectStepHeader projectId={projectId} name={displayName} step="upload" />}
      headerMeta={<div className="flex items-baseline gap-2 text-[12px] text-muted-foreground" aria-label="전체 사진 이용량"><span>전체 이용량</span><strong className="text-[13px] font-semibold tabular-nums text-foreground">{accountUsage ? `${accountUsage.photoCount.toLocaleString()} / ${MAX_PHOTOS.toLocaleString()}장` : "확인 중"}</strong></div>}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void handleFiles(files);
        }} />

        <header data-upload-header-mode={compactUploadHeader ? "compact" : "expanded"} className="shrink-0 border-b border-border-subtle bg-surface">
          <div className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-0 md:min-h-[52px] md:px-8 md:py-1">
            <>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 md:flex-none md:justify-start">
                <ProjectAssetToolbarSummary label={nameFilter.trim() ? "검색 결과" : "사진"} count={`${visiblePhotos.length.toLocaleString()}장`} meta={displayedPhotos.length > 0 ? <span className="max-md:hidden">{uploading ? `${progress.toLocaleString()} / ${total.toLocaleString()}장 처리 중` : "드래그하거나 체크해 여러 장 선택"}</span> : undefined} />
                <div className="flex shrink-0 items-center md:hidden">
                  <ProjectAssetMobileIconButton className="relative" onClick={() => setMobileToolsOpen(true)} aria-label="검색 및 정렬 설정" aria-haspopup="dialog" aria-expanded={mobileToolsOpen}>
                    <SlidersHorizontal size={18} aria-hidden />
                    {nameFilter.trim() || sort !== "taken-asc" ? <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-white">{Number(Boolean(nameFilter.trim())) + Number(sort !== "taken-asc")}</span> : null}
                  </ProjectAssetMobileIconButton>
                </div>
              </div>
              <div className="hidden min-w-0 items-center gap-1.5 md:flex">
                <FilenameSearchInput value={nameFilter} onChange={setNameFilter} placeholder="파일명 검색" className="max-md:flex-1" style={{ "--fsi-width": "220px" } as React.CSSProperties} />
                <PhotoSortSelect value={sort} onChange={setSort} options={[{ value: "taken-asc", label: "촬영 시간순" }, { value: "order-asc", label: "업로드 순" }, { value: "order-desc", label: "최근 순" }, { value: "name-asc", label: "파일명 순" }]} />
                {project.photos.length > 0 ? <button type="button" disabled={uploading || deleting || checkingDelete} onClick={() => void requestDeleteSelectedPhotos(project.photos.map((photo) => photo.id))} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground hover:bg-danger/8 hover:text-danger disabled:opacity-40">전체 삭제</button> : null}
              </div>
            </>
          </div>
        </header>

        {checkingCapacity ? <p role="status" className="px-5 py-2 text-sm text-muted-foreground">업로드 가능한 장수를 확인하고 있어요…</p> : null}
        {error ? <div role="alert" className="hidden shrink-0 border-b border-danger/20 bg-danger/8 px-8 py-2.5 text-[13px] font-semibold text-danger md:block">{error}{needsReselection ? <button type="button" onClick={() => inputRef.current?.click()} className="ml-3 min-h-11 underline">파일 다시 선택</button> : null}</div> : null}

        <main
          ref={galleryScrollRef}
          tabIndex={-1}
          aria-label="업로드 사진 갤러리"
          className="relative min-h-0 flex-1 overflow-y-auto bg-background"
          onPointerDownCapture={(event) => {
            if (event.target instanceof Element && !event.target.closest("article, button, input, select, a")) event.currentTarget.focus({ preventScroll: true });
          }}
          onScroll={handleGalleryScroll}
          onDragEnter={(event) => { event.preventDefault(); if (!isMobile) setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!isMobile) void handleFiles(Array.from(event.dataTransfer.files)); }}
        >
          {error ? <div role="alert" className="sticky top-2 z-30 mx-3 flex items-center justify-between gap-2 rounded-lg border border-danger/20 bg-surface px-3 py-2 text-[12px] font-semibold text-danger shadow-md md:hidden"><span className="min-w-0">{error}</span>{needsReselection ? <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 px-1 py-2 underline">다시 선택</button> : null}</div> : null}
          {dragActive ? <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-background/90 text-center shadow-lg"><span><UploadCloud className="mx-auto mb-3 text-accent" size={30} /><strong className="text-base text-foreground">{uploading ? "놓으면 지금 업로드가 끝난 뒤 이어서 올려요" : "여기에 놓아 사진 추가"}</strong></span></div> : null}
          {displayedPhotos.length === 0 ? (
            <div className="grid min-h-full place-items-center p-5">
              <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-[260px] w-full max-w-[720px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface text-center transition-colors hover:border-accent/45 hover:bg-surface-raised/45">
                <span className="grid size-14 place-items-center rounded-2xl bg-customer-soft text-primary"><UploadCloud size={26} strokeWidth={1.8} /></span>
                <span><strong className="block text-[16px] text-foreground"><span className="md:hidden">사진을 선택하세요</span><span className="hidden md:inline">사진을 끌어다 놓거나 선택하세요</span></strong><small className="mt-1.5 block text-[13px] text-muted-foreground">JPG · PNG · WebP · HEIC · 최대 {MAX_PHOTOS.toLocaleString()}장</small><small className="mt-2 block px-4 text-[13px] text-muted-foreground">고르기용 사진만 저장해요. 원본 파일은 직접 보관해 주세요.</small>{accountUsage ? <small className="mt-1 block text-[13px] font-semibold text-foreground">{accountUsage.remaining.toLocaleString()}장 더 올릴 수 있어요</small> : null}</span>
              </button>
            </div>
          ) : visiblePhotos.length === 0 ? (
            <div className="grid min-h-full place-items-center p-5 text-center text-sm text-muted-foreground">
              <div><strong className="block text-foreground">검색 결과가 없어요</strong><button type="button" className="mt-3 font-semibold text-accent" onClick={() => setNameFilter("")}>검색 초기화</button></div>
            </div>
          ) : (
            <PhotographerPhotoGallery
              scrollRef={galleryScrollRef}
              photos={visiblePhotos}
              viewMode="grid"
              thumbQueue={thumbQueue}
              readonly
              selectedPhotoIds={selectedPhotoIds}
              selectionOnHover={!isMobile}
              mobileSelectionVisible={!uploading}
              onToggleSelected={(photoId) => setSelectedPhotoIds((current) => {
                const next = new Set(current);
                if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
                return next;
              })}
              onPhotoLongPress={uploading ? undefined : (photoId) => {
                if (!isMobile) return;
                setSelectedPhotoIds((current) => {
                  const next = new Set(current);
                  if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
                  return next;
                });
              }}
              onDragSelectionChange={isMobile ? undefined : setSelectedPhotoIds}
              onEmptyClick={() => setSelectedPhotoIds(new Set())}
              minCellWidth={CUSTOMER_GALLERY_GRID.desktopMinCell}
              mobileMinCols={CUSTOMER_GALLERY_GRID.mobileCols}
              mobileGridGap={CUSTOMER_GALLERY_GRID.mobileGap}
              desktopPaddingX={32}
              mobileSquareMedia
              squareMedia
              compact={isMobile}
              showFilename={false}
              leadingCell={<PhotoUploadTile isUploading={uploading || checkingCapacity} progress={total ? Math.round((progress / total) * 100) : 0} serverWorking={checkingCapacity} hasPhotos={displayedPhotos.length > 0} onClick={() => inputRef.current?.click()} />}
              onPhotoClick={(index) => { const photo = visiblePhotos[index]; if (photo && !photo.isPending) setViewerPhotoId(photo.id); }}
            />
          )}
        </main>

        <PhotographerPageActionBar
          className="shrink-0"
          viewportFixed
          compactMobile
          leading={uploadStatus ?? uploadDone}
          mobileLeading={uploadStatus ?? uploadDone}
          actions={uploading ? <PhotographerLightButton size="work-panel" variant="secondary" onClick={cancelUpload}>업로드 중단</PhotographerLightButton> : <>
            {retryFiles.length > 0 ? <PhotographerLightButton size="work-panel" variant="secondary" onClick={() => void handleFiles(retryFiles)}>실패 {retryFiles.length.toLocaleString()}장 다시 시도</PhotographerLightButton> : null}
            {selectedPhotoIds.size > 0 ? <PhotographerLightButton size="work-panel" variant="danger" pending={checkingDelete} pendingLabel="확인 중" onClick={() => void requestDeleteSelectedPhotos()}><Trash2 size={16} />선택 삭제 ({selectedPhotoIds.size.toLocaleString()})</PhotographerLightButton> : null}
            {selectedPhotoIds.size === 0 ? <PhotographerLightButton size="work-panel" disabled={project.photoCount === 0 || deleting || checkingCapacity} onClick={goSelect}>사진 고르기 →</PhotographerLightButton> : null}
          </>}
        />

        <ProjectAssetMobileSheet
          open={mobileToolsOpen}
          onClose={() => setMobileToolsOpen(false)}
          title="사진 찾기"
          titleId="customer-upload-mobile-tools-title"
          closeLabel="검색 및 정렬 설정 닫기"
          headerAction={<button type="button" disabled={!nameFilter.trim() && sort === "taken-asc"} onClick={() => { setNameFilter(""); setSort("taken-asc"); }} className="h-9 px-2 text-[12px] font-medium text-muted-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-40">초기화</button>}
        >
          <div className="space-y-5 py-5">
            <section aria-labelledby="customer-upload-mobile-search-title">
              <h3 id="customer-upload-mobile-search-title" className="mb-2 text-[14px] font-semibold text-foreground">파일명 검색</h3>
              <FilenameSearchInput value={nameFilter} onChange={setNameFilter} placeholder="파일명 검색" autoFocus style={{ "--fsi-height": "48px", "--fsi-radius": "8px" } as React.CSSProperties} />
            </section>
            <section className="border-t border-border-subtle pt-5" aria-labelledby="customer-upload-mobile-sort-title">
              <h3 id="customer-upload-mobile-sort-title" className="mb-2 text-[14px] font-semibold text-foreground">정렬</h3>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="사진 정렬 방식">
                {([['taken-asc', '촬영 시간순'], ['order-asc', '업로드 순'], ['order-desc', '최근 순'], ['name-asc', '파일명 순']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)} className={`h-11 rounded-lg border text-[14px] font-semibold transition-colors ${sort === value ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-foreground"}`}>{label}</button>)}
              </div>
            </section>
          </div>
          {project.photos.length > 0 ? <button type="button" disabled={uploading || deleting || checkingDelete} onClick={() => { setMobileToolsOpen(false); void requestDeleteSelectedPhotos(project.photos.map((photo) => photo.id)); }} className="mb-3 h-11 w-full rounded-lg border border-danger/25 text-[14px] font-semibold text-danger disabled:opacity-40">올린 사진 전체 삭제</button> : null}
          <button type="button" onClick={() => setMobileToolsOpen(false)} className="h-12 w-full rounded-lg bg-accent text-[15px] font-bold text-white hover:bg-[var(--accent-hover)]">완료</button>
        </ProjectAssetMobileSheet>
      </div>

      {viewerIndex >= 0 ? <OriginalPhotoViewer photos={viewerPhotos} activeIndex={viewerIndex} onActiveIndexChange={(index) => setViewerPhotoId(viewerPhotos[index]?.id ?? null)} onClose={() => setViewerPhotoId(null)} /> : null}

      {doneOpen && justUploaded > 0 ? <UploadDoneSheet
        projectId={projectId}
        uploaded={justUploaded}
        shootType={project.shootType}
        untimedCount={untimedCount}
        scenesBlocked={scenesBlocked}
        aiAnalyzing={aiAnalyzing}
        starting={aiStarting}
        error={aiSheetError}
        onTidy={() => void startTidy()}
        onSelect={goSelect}
        onMore={() => { setDoneOpen(false); inputRef.current?.click(); }}
        onClose={() => setDoneOpen(false)}
      /> : null}

      {deleteImpact ? <SelectionConfirmDialog
        title={deleteAll ? "올린 사진을 모두 삭제할까요?" : "이 사진들을 삭제할까요?"}
        description={<>{deleteImpact.photoCount.toLocaleString()}장의 사진이 삭제됩니다.{deleteImpactItems.length ? <><br />연결된 {deleteImpactItems.join(" · ")}도 함께 삭제되며 되돌릴 수 없어요.</> : <> 되돌릴 수 없어요.</>}</>}
        confirmLabel="삭제하기"
        busyLabel="삭제 중…"
        confirming={deleting}
        error={deleteError}
        danger
        onCancel={() => { if (!deleting) { setDeleteImpact(null); setPendingDeleteIds([]); setDeleteError(null); } }}
        onConfirm={deleteSelectedPhotos}
      /> : null}
    </CustomerSelectShell>
  );
}
