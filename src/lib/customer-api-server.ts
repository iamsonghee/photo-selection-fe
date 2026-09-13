/**
 * 고객 플로우 API용 서버 전용 헬퍼.
 * Service Role 클라이언트로 selections 등 RLS를 우회해 처리.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getAdminClient } from "@/lib/supabase-admin";
import type { Project, Photo, PhotoGroupInfo, ProjectStatus, ColorTag } from "@/types";
import type { PhotoState } from "@/contexts/SelectionContext";
import type { Database } from "@/types/supabase";
import { callPresignApi } from "@/lib/presign-server";
import { buildContentDisposition } from "@/lib/content-disposition-server";

const ORIGINAL_DOWNLOAD_WINDOW_DAYS = 30;
const FINAL_DELIVERY_DOWNLOAD_WINDOW_DAYS = 30;

type ProjectsRow = Database["public"]["Tables"]["projects"]["Row"];
type PhotosRow = Database["public"]["Tables"]["photos"]["Row"];
type SelectionsRow = Database["public"]["Tables"]["selections"]["Row"];

function mapProjectRow(row: ProjectsRow): Project {
  const r = row as ProjectsRow & {
    customer_cancel_count?: number | null;
    max_revision_count?: number | null;
    revision_round?: number | null;
    review_deadline?: string | null;
  };
  return {
    id: row.id,
    name: row.name,
    photographerId: row.photographer_id,
    customerName: row.customer_name,
    shootDate: row.shoot_date,
    deadline: row.deadline,
    requiredCount: row.required_count,
    photoCount: row.photo_count ?? 0,
    status: row.status as ProjectStatus,
    accessToken: row.access_token,
    accessPin: (row as { access_pin?: string | null }).access_pin ?? null,
    confirmedAt: row.confirmed_at ?? undefined,
    deliveredAt: (row as { delivered_at?: string | null }).delivered_at ?? undefined,
    customerCancelCount: r.customer_cancel_count ?? 0,
    maxRevisionCount: (r.max_revision_count ?? 0) as 0 | 1 | 2,
    revisionRound: r.revision_round ?? 0,
    reviewDeadline: r.review_deadline ?? null,
    clipAnalysisStatus:
      (row as { clip_analysis_status?: "processing" | "completed" | "failed" | null })
        .clip_analysis_status ?? null,
    includeOriginal: (row as { include_original?: boolean | null }).include_original ?? false,
    originalArchiveStatus:
      (row as { original_archive_status?: "pending" | "processing" | "ready" | "failed" | null })
        .original_archive_status ?? null,
    originalDownloadStartedAt:
      (row as { original_download_started_at?: string | null }).original_download_started_at ?? null,
    coverPhotoId: (row as { cover_photo_id?: string | null }).cover_photo_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPhotoRow(
  row: PhotosRow,
  selectedIds: Set<string>,
  photoStates: Record<string, PhotoState>
): Photo {
  const pid = row.id;
  return {
    id: row.id,
    projectId: row.project_id,
    orderIndex: row.number,
    url: row.r2_thumb_url,
    previewUrl: row.r2_preview_url ?? row.r2_thumb_url,
    originalFilename: row.original_filename ?? null,
    selected: selectedIds.has(pid),
    tag: photoStates[pid]
      ? { star: photoStates[pid].rating as 1 | 2 | 3 | 4 | 5 | undefined, color: photoStates[pid].color }
      : undefined,
    comment: undefined,
    similarityGroupId: (row as { similarity_group_id?: string | null }).similarity_group_id ?? null,
    /* ⚠️ **고객에게는 품질 판정(눈감음·흐림)을 내려보내지 않는다 — 의도적으로 비운 것이다.**
     * (2026-09-12 결정. 예전에 `photos.is_blurry`를 읽었고, 잠시 Gemini Flash를 읽도록 바꿨다가 되돌렸다.)
     *
     * 이유:
     *  - AI 오판의 비용을 **작가가** 진다. 의도적 아웃포커싱·패닝·감성 컷을 "흐림"으로 찍으면
     *    고객이 좋은 사진을 스스로 지운다. 고객 기준을 `likely`로 좁혀도 방향은 그대로다.
     *  - 작가가 고객에게 보내는 화면에 작가 작업물의 결함을 표시하는 셈이라 상품에 흠집을 낸다.
     *  - 이 판정의 목적은 애초에 **작가가 보내기 전에 거르는 것**이다. 걸렀다면 고객 화면에
     *    표시할 게 없어야 정상이다.
     *
     * 선은 "AI냐 아니냐"가 아니라 **정리냐 흠결 판정이냐**다 — 유사컷 묶기(중립적 정리)는
     * 고객도 쓰지만, 눈감음·흐림(품질 흠결)은 작가 전용이다.
     *
     * 그래서 고객 갤러리의 품질 배지·`흐림만`/`눈감음만` 필터는 **값이 없어 렌더되지 않는다**.
     * 되살리려면 이 세 필드를 `buildQualityFlagMap(..., "customer")`로 채우면 된다(§6.7).
     */
    isBlurry: null,
    faceDetected: null,
    eyesClosed: null,
  };
}

/** access_token으로 프로젝트 조회 (admin). 없으면 null */
export async function getProjectByToken(
  admin: SupabaseClient,
  token: string
): Promise<Project | null> {
  if (!token?.trim()) return null;
  const { data, error } = await admin
    .from("projects")
    .select("*")
    .eq("access_token", token)
    .single();
  if (error || !data) return null;
  return mapProjectRow(data as ProjectsRow);
}

/** 같은 RSC 요청 안에서 layout/page가 수행하는 동일 프로젝트 조회를 한 번으로 합친다. */
export const getProjectByTokenCached = cache(async (token: string): Promise<Project | null> => {
  return getProjectByToken(getAdminClient(), token);
});

// Supabase PostgREST 기본 limit=1000 우회(src/lib/db.ts와 동일 패턴) — BETA_MAX=3000이므로
// photos/selections는 3페이지를 병렬 요청한다. 안 하면 1000장 넘는 프로젝트에서 고객 갤러리/
// 뷰어의 전체 장수·뒷 순번 사진들이 통째로 잘려서 안 보이는 문제가 생긴다.
const PAGE = 1000;

async function fetchSelectionsAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<SelectionsRow[]> {
  const selectionPages = await Promise.all(
    [0, 1, 2].map((i) =>
      admin
        .from("selections")
        .select("*")
        .eq("project_id", projectId)
        .range(i * PAGE, (i + 1) * PAGE - 1)
    )
  );
  for (const s of selectionPages) if (s.error) throw new Error(s.error.message);
  return selectionPages.flatMap((s) => (s.data ?? []) as SelectionsRow[]);
}

function buildSelectionState(selections: SelectionsRow[]): {
  selectedIds: Set<string>;
  photoStates: Record<string, PhotoState>;
} {
  // is_selected로 명시적으로 선택된 사진만 카운트한다.
  // 별점/컬러태그/코멘트만 남긴 행은 selections 테이블에 존재하지만 "선택"은 아니다.
  const selectedIds = new Set(
    selections.filter((s) => s.is_selected).map((s) => s.photo_id)
  );
  const photoStates: Record<string, PhotoState> = {};
  for (const s of selections) {
    const colorTags = ((s as { color_tags?: ColorTag[] | null }).color_tags ?? []) as ColorTag[];
    photoStates[s.photo_id] = {
      rating: (s.rating as 1 | 2 | 3 | 4 | 5) ?? undefined,
      color: colorTags.length ? colorTags : undefined,
      comment: s.comment ?? undefined,
    };
  }
  return { selectedIds, photoStates };
}

/** selections만 조회(사진/그룹 제외) — 폴링 등 경량 재조회용. */
export async function getSelectionsOnlyAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{ selectedIds: Set<string>; photoStates: Record<string, PhotoState> }> {
  return buildSelectionState(await fetchSelectionsAdmin(admin, projectId));
}

/** 프로젝트의 사진 + selections + AI 유사컷 그룹 (admin). */
export async function getPhotosWithSelectionsAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{
  photos: Photo[];
  selectedIds: Set<string>;
  photoStates: Record<string, PhotoState>;
  photoGroups: PhotoGroupInfo[];
}> {
  const [photoPages, selections, groupsRes] = await Promise.all([
    Promise.all(
      [0, 1, 2].map((i) =>
        admin
          .from("photos")
          .select("*")
          .eq("project_id", projectId)
          .order("number", { ascending: true })
          .range(i * PAGE, (i + 1) * PAGE - 1)
      )
    ),
    fetchSelectionsAdmin(admin, projectId),
    admin
      .from("photo_groups")
      .select("id, representative_photo_id, photo_count")
      .eq("project_id", projectId),
  ]);
  for (const p of photoPages) if (p.error) throw new Error(p.error.message);
  if (groupsRes.error) throw new Error(groupsRes.error.message);

  const rows = photoPages.flatMap((p) => (p.data ?? []) as PhotosRow[]);
  const { selectedIds, photoStates } = buildSelectionState(selections);
  const photos = rows.map((row) => mapPhotoRow(row, selectedIds, photoStates));
  const groupRows = (groupsRes.data ?? []) as {
    id: string;
    representative_photo_id: string;
    photo_count: number;
  }[];
  const photoGroups: PhotoGroupInfo[] = groupRows.map((g) => ({
    id: g.id,
    representativePhotoId: g.representative_photo_id,
    photoCount: g.photo_count,
  }));
  return { photos, selectedIds, photoStates, photoGroups };
}

export async function upsertSelectionAdmin(
  admin: SupabaseClient,
  params: {
    project_id: string;
    photo_id: string;
    /** 생략 시(undefined) 기존 값을 그대로 둔다. null이면 명시적으로 지운다. */
    rating?: number | null;
    /** 생략 시(undefined) 기존 값을 그대로 둔다. null이면 명시적으로 지운다. */
    color_tag?: string | null;
    /** 생략 시(undefined) 기존 값을 그대로 둔다. null이면 명시적으로 지운다. */
    comment?: string | null;
    /** 생략 시 기존 선택 상태를 그대로 둔다 (별점/코멘트만 남기는 경우 등). */
    is_selected?: boolean;
  }
): Promise<void> {
  // 제공되지 않은 필드는 payload에서 아예 제외한다 — PostgREST upsert는
  // payload에 실제로 있는 컬럼만 DO UPDATE SET에 반영하므로, 이렇게 해야
  // 다른 세션이 그 사이 저장한 다른 필드 값을 덮어쓰지 않는다.
  const payload: Record<string, unknown> = {
    project_id: params.project_id,
    photo_id: params.photo_id,
  };
  if (params.rating !== undefined) payload.rating = params.rating;
  if (params.color_tag !== undefined) payload.color_tag = params.color_tag;
  if (params.comment !== undefined) payload.comment = params.comment;
  if (params.is_selected !== undefined) {
    payload.is_selected = params.is_selected;
  }
  const { error } = await admin
    .from("selections")
    .upsert(payload, { onConflict: "project_id,photo_id" });
  if (error) throw new Error(error.message);
}

/**
 * photo_id가 실제로 project_id 소속인지 검증한다. 기존에는 token→project만 확인하고
 * photo_id는 검증하지 않아, 유효한 고객 링크만 있으면 요청 본문의 photo_id를 다른
 * 프로젝트 사진으로 바꿔 그 프로젝트의 선택 상태/별점/코멘트/색상을 저장할 수 있는
 * 접근 통제 결함이 있었다 — is_selected/rating/comment/color 전부 공통으로 이 검증을 거친다.
 */
export async function assertPhotoBelongsToProject(
  admin: SupabaseClient,
  photoId: string,
  projectId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("photos")
    .select("id")
    .eq("id", photoId)
    .eq("project_id", projectId)
    .maybeSingle();
  return !error && !!data;
}

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

/**
 * 색상 하나를 원자적으로 add/remove하는 RPC 호출. 클라이언트가 전체 배열을 계산해서
 * 통째로 교체(UPSERT)하던 기존 방식은 두 세션이 동시에 서로 다른 색을 추가하면 한쪽이
 * 완전히 유실되는 lost-update가 있었다 — DB의 array_append/array_remove를 단일
 * INSERT...ON CONFLICT...DO UPDATE 안에서 실행해 행 단위 잠금으로 원자성을 보장한다.
 */
export async function toggleSelectionColorAdmin(
  admin: SupabaseClient,
  params: { project_id: string; photo_id: string; color: ColorTag; add: boolean }
): Promise<ColorTag[]> {
  if (!VALID_COLORS.includes(params.color)) {
    throw new Error(`invalid color: ${params.color}`);
  }
  const { data, error } = await admin.rpc("toggle_selection_color", {
    p_project_id: params.project_id,
    p_photo_id: params.photo_id,
    p_color: params.color,
    p_add: params.add,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ColorTag[];
}

export async function confirmProjectAdmin(admin: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await admin
    .from("projects")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/** 확정 취소: status → selecting (고객이 확정 취소 시, admin 전용) */
export async function cancelConfirmAdmin(admin: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await admin
    .from("projects")
    .update({
      status: "selecting",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/** token 유효성 검사: 프로젝트 존재하고 project_id 일치 시 해당 프로젝트 반환, 아니면 null */
export async function validateTokenAndProject(
  token: string,
  projectId: string
): Promise<Project | null> {
  const admin = getAdminClient();
  const project = await getProjectByToken(admin, token);
  if (!project || project.id !== projectId) return null;
  return project;
}

// ---------- 보정본 검토 데이터 (GET /api/c/review) ----------

export interface ReviewPhotoItem {
  id: string;
  photoVersionId: string;
  originalFilename: string;
  originalUrl: string;
  versionUrl: string;
  versionThumbUrl: string;
  orderIndex: number;
  /** 이미 제출된 검토가 있으면 */
  existingReview?: { status: "approved" | "revision_requested"; customerComment: string | null };
}

export interface ReviewDataResponse {
  project: Project;
  photos: ReviewPhotoItem[];
}

/** access_token으로 프로젝트 + 현재 버전의 photo_versions + version_reviews 조회 */
export async function getReviewDataByToken(
  admin: SupabaseClient,
  token: string
): Promise<ReviewDataResponse | null> {
  const project = await getProjectByToken(admin, token);
  if (!project) return null;
  if (project.status !== "reviewing_v1" && project.status !== "reviewing_v2") return null;

  const version = project.status === "reviewing_v2" ? 2 : 1;

  const { data: selections } = await admin
    .from("selections")
    .select("photo_id")
    .eq("project_id", project.id);
  const photoIds = (selections ?? []).map((s: { photo_id: string }) => s.photo_id);
  if (photoIds.length === 0) return { project, photos: [] };

  const { data: photosRows, error: photosErr } = await admin
    .from("photos")
    .select("id, number, r2_thumb_url, r2_preview_url, original_filename")
    .in("id", photoIds)
    .order("number", { ascending: true });
  if (photosErr || !photosRows?.length) return { project, photos: [] };

  const { data: pvRowsRaw, error: pvErr } = await admin
    .from("photo_versions")
    .select("id, photo_id, r2_url, r2_thumb_url, created_at")
    .in("photo_id", photoIds)
    .eq("version", version)
    .order("created_at", { ascending: false });
  if (pvErr) return { project, photos: [] };

  // 사진당 동일 version 행이 여러 개면(재업로드) 최신 행만 사용. 무작위 행이면
  // 고객 검토가 옛 photo_version_id에만 쌓여 '전부 확정'처럼 보일 수 있다.
  const pvByPhotoId = new Map<
    string,
    { id: string; photo_id: string; r2_url: string; r2_thumb_url: string | null }
  >();
  for (const r of pvRowsRaw ?? []) {
    const row = r as {
      photo_id: string;
      id: string;
      r2_url: string;
      r2_thumb_url: string | null;
    };
    if (pvByPhotoId.has(row.photo_id)) continue;
    pvByPhotoId.set(row.photo_id, row);
  }
  const pvIds = [...pvByPhotoId.values()].map((r) => r.id);

  const { data: reviewRows } = await admin
    .from("version_reviews")
    .select("photo_version_id, status, customer_comment")
    .in("photo_version_id", pvIds);
  const reviewByPvId = new Map(
    (reviewRows ?? []).map((r: { photo_version_id: string; status: string; customer_comment: string | null }) => [
      r.photo_version_id,
      { status: r.status as "approved" | "revision_requested", customerComment: r.customer_comment },
    ])
  );

  const photos: ReviewPhotoItem[] = [];
  for (const row of photosRows as Array<{
    id: string;
    number: number;
    r2_thumb_url: string;
    r2_preview_url: string | null;
    original_filename: string | null;
  }>) {
    const pv = pvByPhotoId.get(row.id);
    if (!pv) continue;
    const existing = reviewByPvId.get(pv.id);
    photos.push({
      id: row.id,
      photoVersionId: pv.id,
      originalFilename: (row.original_filename ?? "").trim() || String(row.number),
      originalUrl: row.r2_preview_url ?? row.r2_thumb_url,
      versionUrl: pv.r2_url,
      versionThumbUrl: pv.r2_thumb_url ?? pv.r2_url,
      orderIndex: row.number,
      existingReview: existing,
    });
  }
  photos.sort((a, b) => a.orderIndex - b.orderIndex);

  return { project, photos };
}

// ---------- 납품용 원본 다운로드 (GET /api/c/original-download) ----------

export interface OriginalDownloadFile {
  photoId: string;
  filename: string;
  byteSize: number;
  /** 고객 셀렉 단계에서 현재 선택된 사진인지 여부. 다운로드 체크 상태와는 별개다. */
  isSelected: boolean;
}

export interface OriginalArchiveDownloadFile {
  partNumber: number;
  fileCount: number;
  byteSize: number;
}

export interface PresignedOriginalDownloadFile {
  photoId: string;
  filename: string;
  byteSize: number;
  url: string;
}

export interface PresignedOriginalArchiveDownloadFile extends OriginalArchiveDownloadFile {
  url: string;
}

export interface OriginalDownloadInfo {
  /** 원본 포함 프로젝트라면 ZIP 준비 중에도 진입점을 노출한다. */
  visible: boolean;
  available: boolean;
  expired: boolean;
  preparing: boolean;
  failed: boolean;
  fileCount: number;
  totalBytes: number;
  expiresAt: string | null;
  files: OriginalDownloadFile[];
  archivePreparing: boolean;
  archiveFailed: boolean;
  archiveBlocked: boolean;
  incompleteOriginalCount: number;
  archiveFiles: OriginalArchiveDownloadFile[];
  archiveProcessedFiles: number;
  archiveProcessedBytes: number;
  archiveUploadedBytes: number;
  archiveStartedAt: string | null;
}

/**
 * access_token으로 납품용 원본 다운로드 상태와 파일 메타데이터를 조회한다.
 * 이 경로에서는 presign을 수행하지 않는다. 개별 원본과 ZIP URL은 사용자가
 * 실제 다운로드할 때 getOriginalFileDownloadUrls/getOriginalArchiveDownloadUrls로 발급한다.
 */
export async function getOriginalDownloadInfo(
  admin: SupabaseClient,
  token: string
): Promise<OriginalDownloadInfo | null> {
  const project = await getProjectByToken(admin, token);
  if (!project) return null;

  if (!project.includeOriginal) {
    return {
      visible: false,
      available: false,
      expired: false,
      preparing: false,
      failed: false,
      fileCount: 0,
      totalBytes: 0,
      expiresAt: null,
      files: [],
      archivePreparing: false,
      archiveFailed: false,
      archiveBlocked: false,
      incompleteOriginalCount: 0,
      archiveFiles: [],
      archiveProcessedFiles: 0,
      archiveProcessedBytes: 0,
      archiveUploadedBytes: 0,
      archiveStartedAt: null,
    };
  }

  if (!project.originalDownloadStartedAt) {
    return {
      visible: true,
      available: false,
      expired: false,
      preparing: true,
      failed: false,
      fileCount: 0,
      totalBytes: 0,
      expiresAt: null,
      files: [],
      archivePreparing: false,
      archiveFailed: false,
      archiveBlocked: false,
      incompleteOriginalCount: 0,
      archiveFiles: [],
      archiveProcessedFiles: 0,
      archiveProcessedBytes: 0,
      archiveUploadedBytes: 0,
      archiveStartedAt: null,
    };
  }

  const startedAt = new Date(project.originalDownloadStartedAt);
  const expiresAt = new Date(startedAt.getTime() + ORIGINAL_DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const expired = Date.now() > expiresAt.getTime();

  // PostgREST의 기본 1,000행 제한을 넘길 수 있어 최대 베타 한도(3,000장)까지 나눈다.
  const [pages, selectionPages] = await Promise.all([
    Promise.all([0, 1, 2].map((i) =>
      admin.from("photos")
        .select("id, original_filename, original_compressed_size, original_status")
        .eq("project_id", project.id)
        .order("number", { ascending: true })
        .range(i * 1000, (i + 1) * 1000 - 1)
    )),
    Promise.all([0, 1, 2].map((i) =>
      admin.from("selections")
        .select("photo_id")
        .eq("project_id", project.id)
        .eq("is_selected", true)
        .range(i * 1000, (i + 1) * 1000 - 1)
    )),
  ]);
  for (const page of pages) if (page.error) throw new Error(page.error.message);
  for (const page of selectionPages) if (page.error) throw new Error(page.error.message);
  type OriginalRow = { id: string; original_filename: string | null; original_compressed_size: number | null; original_status: string | null };
  type SelectionRow = { photo_id: string };
  const allOriginals = pages.flatMap((page) => page.data ?? []) as OriginalRow[];
  const selectedPhotoIds = new Set(
    (selectionPages.flatMap((page) => page.data ?? []) as SelectionRow[]).map((selection) => selection.photo_id),
  );
  const originals = allOriginals.filter((file) => file.original_status === "completed");
  const incompleteOriginalCount = allOriginals.length - originals.length;
  const fileCount = originals.length;
  const totalBytes = originals.reduce((sum, file) => sum + (file.original_compressed_size ?? 0), 0);
  const archiveBlocked = project.originalArchiveStatus === null && incompleteOriginalCount > 0;

  if (expired || originals.length === 0) {
    return {
      visible: true,
      available: false,
      expired,
      preparing: false,
      failed: false,
      fileCount,
      totalBytes,
      expiresAt: expiresAt.toISOString(),
      files: [],
      archivePreparing: false,
      archiveFailed: false,
      archiveBlocked,
      incompleteOriginalCount,
      archiveFiles: [],
      archiveProcessedFiles: 0,
      archiveProcessedBytes: 0,
      archiveUploadedBytes: 0,
      archiveStartedAt: null,
    };
  }

  const files: OriginalDownloadFile[] = originals
    .map((file) => ({
      photoId: file.id,
      filename: file.original_filename || "photo",
      byteSize: file.original_compressed_size ?? 0,
      isSelected: selectedPhotoIds.has(file.id),
    }));

  const archivePreparing = !archiveBlocked && project.originalArchiveStatus !== "ready" && project.originalArchiveStatus !== "failed";
  const archiveFailed = project.originalArchiveStatus === "failed";
  let archiveFiles: OriginalArchiveDownloadFile[] = [];
  let archiveProcessedFiles = 0;
  let archiveProcessedBytes = 0;
  let archiveUploadedBytes = 0;
  let archiveStartedAt: string | null = null;
  if (!archiveBlocked) {
    let { data: partsRaw, error: partsError } = await admin
      .from("original_archive_parts")
      .select("part_number, file_count, byte_size, status, processed_file_count, processed_bytes, processing_started_at, created_at")
      .eq("project_id", project.id)
      .is("deleted_at", null)
      .order("part_number", { ascending: true });
    // FE가 진행률 마이그레이션보다 먼저 실행된 배포 구간에서도 기존 다운로드 CTA와
    // ready ZIP을 숨기지 않는다. 진행률만 0으로 폴백하고 마이그레이션 적용 후 자동 활성화한다.
    if (partsError?.code === "42703") {
      const legacyParts = await admin
        .from("original_archive_parts")
        .select("part_number, file_count, byte_size, status, processing_started_at, created_at")
        .eq("project_id", project.id)
        .is("deleted_at", null)
        .order("part_number", { ascending: true });
      partsRaw = (legacyParts.data ?? []).map((part) => ({
        ...part,
        processed_file_count: 0,
        processed_bytes: 0,
      })) as typeof partsRaw;
      partsError = legacyParts.error;
    }
    if (partsError) throw new Error(partsError.message);
    type PartRow = {
      part_number: number;
      file_count: number;
      byte_size: number;
      status: string;
      processed_file_count: number;
      processed_bytes: number;
      processing_started_at: string | null;
      created_at: string;
    };
    const parts = (partsRaw ?? []) as PartRow[];
    archiveProcessedFiles = parts.reduce((sum, part) => sum + (
      part.status === "completed" ? part.file_count : Math.min(part.file_count, Math.max(0, part.processed_file_count ?? 0))
    ), 0);
    archiveProcessedBytes = parts.reduce((sum, part) => sum + (
      part.status === "completed" ? part.byte_size : Math.min(part.byte_size, Math.max(0, part.processed_bytes ?? 0))
    ), 0);
    archiveUploadedBytes = parts.reduce((sum, part) => sum + (part.status === "completed" ? part.byte_size : 0), 0);
    archiveStartedAt = parts
      .map((part) => part.processing_started_at ?? part.created_at)
      .filter(Boolean)
      .sort()[0] ?? null;
    archiveFiles = parts.filter((part) => part.status === "completed").map((part) => ({
      partNumber: part.part_number,
      fileCount: part.file_count,
      byteSize: part.byte_size,
    }));
  }

  return {
    visible: true,
    available: files.length > 0,
    expired: false,
    preparing: false,
    failed: false,
    fileCount,
    totalBytes,
    expiresAt: expiresAt.toISOString(),
    files,
    archivePreparing,
    archiveFailed,
    archiveBlocked,
    incompleteOriginalCount,
    archiveFiles,
    archiveProcessedFiles,
    archiveProcessedBytes,
    archiveUploadedBytes,
    archiveStartedAt,
  };
}

function isOriginalDownloadExpired(startedAt: string): boolean {
  return Date.now() > new Date(startedAt).getTime() + ORIGINAL_DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** 사용자가 선택한 개별 원본에 대해서만 1시간 presigned URL을 발급한다. */
export async function getOriginalFileDownloadUrls(
  admin: SupabaseClient,
  token: string,
  requestedPhotoIds: string[]
): Promise<PresignedOriginalDownloadFile[] | null> {
  const project = await getProjectByToken(admin, token);
  if (!project?.includeOriginal || !project.originalDownloadStartedAt) return null;
  if (isOriginalDownloadExpired(project.originalDownloadStartedAt)) return [];

  const photoIds = [...new Set(requestedPhotoIds.filter((id) => typeof id === "string" && id.trim()))].slice(0, 3000);
  if (photoIds.length === 0) return [];

  type OriginalRow = {
    id: string;
    r2_original_url: string | null;
    original_filename: string | null;
    original_compressed_size: number | null;
  };
  const pages = await Promise.all(Array.from({ length: Math.ceil(photoIds.length / 200) }, (_, i) =>
    admin.from("photos")
      .select("id, r2_original_url, original_filename, original_compressed_size")
      .eq("project_id", project.id)
      .eq("original_status", "completed")
      .in("id", photoIds.slice(i * 200, (i + 1) * 200))
  ));
  for (const page of pages) if (page.error) throw new Error(page.error.message);
  const byId = new Map((pages.flatMap((page) => page.data ?? []) as OriginalRow[]).map((row) => [row.id, row]));
  const originals = photoIds.flatMap((id) => {
    const row = byId.get(id);
    return row?.r2_original_url ? [row] : [];
  });

  const dispositions: Record<string, string> = {};
  for (const file of originals) {
    dispositions[file.r2_original_url!] = buildContentDisposition(file.original_filename || "photo");
  }
  const presignBatches = await Promise.all(Array.from({ length: Math.ceil(originals.length / 200) }, (_, i) => {
    const batch = originals.slice(i * 200, (i + 1) * 200);
    return callPresignApi(batch.map((file) => file.r2_original_url!), dispositions);
  }));
  const urls = Object.assign({}, ...presignBatches.map((batch) => batch.urls)) as Record<string, string>;

  return originals.flatMap((file) => {
    const url = urls[file.r2_original_url!];
    return url ? [{
      photoId: file.id,
      filename: file.original_filename || "photo",
      byteSize: file.original_compressed_size ?? 0,
      url,
    }] : [];
  });
}

/** ZIP이 ready인 시점에 완료된 파트에 대해서만 1시간 presigned URL을 발급한다. */
export async function getOriginalArchiveDownloadUrls(
  admin: SupabaseClient,
  token: string
): Promise<PresignedOriginalArchiveDownloadFile[] | null> {
  const project = await getProjectByToken(admin, token);
  if (!project?.includeOriginal || !project.originalDownloadStartedAt) return null;
  if (isOriginalDownloadExpired(project.originalDownloadStartedAt) || project.originalArchiveStatus !== "ready") return [];

  const { data: partsRaw, error } = await admin
    .from("original_archive_parts")
    .select("part_number, r2_key, file_count, byte_size")
    .eq("project_id", project.id)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("part_number", { ascending: true });
  if (error) throw new Error(error.message);
  type PartRow = { part_number: number; r2_key: string; file_count: number; byte_size: number };
  const parts = (partsRaw ?? []) as PartRow[];
  const dispositions: Record<string, string> = {};
  for (const part of parts) {
    dispositions[part.r2_key] = buildContentDisposition(`${project.name}_전체원본_${part.part_number}.zip`);
  }
  const presignBatches = await Promise.all(Array.from({ length: Math.ceil(parts.length / 200) }, (_, i) => {
    const batch = parts.slice(i * 200, (i + 1) * 200);
    return callPresignApi(batch.map((part) => part.r2_key), dispositions);
  }));
  const urls = Object.assign({}, ...presignBatches.map((batch) => batch.urls)) as Record<string, string>;

  return parts.flatMap((part) => {
    const url = urls[part.r2_key];
    return url ? [{
      partNumber: part.part_number,
      fileCount: part.file_count,
      byteSize: part.byte_size,
      url,
    }] : [];
  });
}

export type FinalDeliveryArchiveFile = {
  partNumber: number;
  fileCount: number;
  byteSize: number;
  url?: string;
};

export type FinalDeliveryPreviewFile = {
  photoId: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
};

export type FinalDeliveryDownloadInfo = {
  visible: boolean;
  expired: boolean;
  preparing: boolean;
  failed: boolean;
  fileCount: number;
  totalBytes: number;
  expiresAt: string | null;
  files: FinalDeliveryArchiveFile[];
  /** 최종 ZIP에 고정된 보정본의 검토용 이미지. 원본 크기 납품 파일 URL은 노출하지 않는다. */
  previewFiles: FinalDeliveryPreviewFile[];
};

/** 최종 확정된 검토 회차의 원본 크기 보정본 ZIP 상태. */
export async function getFinalDeliveryDownloadInfo(
  admin: SupabaseClient,
  token: string,
): Promise<FinalDeliveryDownloadInfo | null> {
  const { data: project, error } = await admin.from("projects")
    .select("id,status,delivered_at,active_final_delivery_archive_id")
    .eq("access_token", token).single();
  if (error || !project) return null;
  const row = project as { id: string; status: string; delivered_at: string | null; active_final_delivery_archive_id: string | null };
  if (row.status !== "delivered" || !row.delivered_at || !row.active_final_delivery_archive_id) {
    return { visible: false, expired: false, preparing: false, failed: false, fileCount: 0, totalBytes: 0, expiresAt: null, files: [], previewFiles: [] };
  }
  const expiresAt = new Date(new Date(row.delivered_at).getTime() + FINAL_DELIVERY_DOWNLOAD_WINDOW_DAYS * 86400000);
  const expired = Date.now() > expiresAt.getTime();
  const { data: archive, error: archiveError } = await admin.from("final_delivery_archives")
    .select("id,status,file_count,byte_size,manifest")
    .eq("id", row.active_final_delivery_archive_id).eq("project_id", row.id).single();
  if (archiveError || !archive) return { visible: false, expired, preparing: false, failed: false, fileCount: 0, totalBytes: 0, expiresAt: expiresAt.toISOString(), files: [], previewFiles: [] };
  const a = archive as {
    id: string;
    status: string;
    file_count: number;
    byte_size: number;
    manifest: Array<{ photo_id?: string; key?: string; filename?: string }> | null;
  };
  let files: FinalDeliveryArchiveFile[] = [];
  if (!expired && a.status === "ready") {
    const { data: parts, error: partsError } = await admin.from("final_delivery_archive_parts")
      .select("part_number,file_count,byte_size")
      .eq("archive_id", a.id).eq("status", "completed").is("deleted_at", null)
      .order("part_number", { ascending: true });
    if (partsError) throw new Error(partsError.message);
    files = (parts ?? []).map((part: { part_number: number; file_count: number; byte_size: number }) => ({
      partNumber: part.part_number, fileCount: part.file_count, byteSize: part.byte_size,
    }));
  }
  const manifest = Array.isArray(a.manifest) ? a.manifest : [];
  const deliveryKeys = manifest.flatMap((entry) => typeof entry.key === "string" && entry.key ? [entry.key] : []);
  const previewRows: Array<{
    photo_id: string;
    r2_delivery_url: string;
    r2_url: string;
    r2_thumb_url: string | null;
    delivery_filename: string | null;
  }> = [];
  for (let offset = 0; offset < deliveryKeys.length; offset += 200) {
    const { data: batch } = await admin.from("photo_versions")
      .select("photo_id,r2_delivery_url,r2_url,r2_thumb_url,delivery_filename")
      .in("r2_delivery_url", deliveryKeys.slice(offset, offset + 200));
    previewRows.push(...((batch ?? []) as typeof previewRows));
  }
  const previewByDeliveryKey = new Map(previewRows.map((preview) => [preview.r2_delivery_url, preview]));
  const previewFiles = manifest.flatMap((entry) => {
    const preview = entry.key ? previewByDeliveryKey.get(entry.key) : undefined;
    if (!preview?.r2_url) return [];
    return [{
      photoId: preview.photo_id,
      filename: entry.filename || preview.delivery_filename || "최종 보정본",
      url: preview.r2_url,
      thumbnailUrl: preview.r2_thumb_url || preview.r2_url,
    }];
  });
  return {
    visible: true, expired, preparing: !expired && (a.status === "pending" || a.status === "processing"),
    failed: a.status === "failed", fileCount: a.file_count, totalBytes: a.byte_size,
    expiresAt: expiresAt.toISOString(), files, previewFiles,
  };
}

export async function getFinalDeliveryArchiveDownloadUrls(
  admin: SupabaseClient,
  token: string,
): Promise<FinalDeliveryArchiveFile[] | null> {
  const { data: project, error } = await admin.from("projects")
    .select("id,name,status,delivered_at,active_final_delivery_archive_id")
    .eq("access_token", token).single();
  if (error || !project) return null;
  const p = project as { id: string; name: string; status: string; delivered_at: string | null; active_final_delivery_archive_id: string | null };
  if (p.status !== "delivered" || !p.delivered_at || !p.active_final_delivery_archive_id) return [];
  if (Date.now() > new Date(p.delivered_at).getTime() + FINAL_DELIVERY_DOWNLOAD_WINDOW_DAYS * 86400000) return [];
  const { data: archive } = await admin.from("final_delivery_archives").select("status")
    .eq("id", p.active_final_delivery_archive_id).eq("project_id", p.id).single();
  if (!archive || (archive as { status: string }).status !== "ready") return [];
  const { data: parts, error: partsError } = await admin.from("final_delivery_archive_parts")
    .select("part_number,r2_key,file_count,byte_size")
    .eq("archive_id", p.active_final_delivery_archive_id).eq("status", "completed")
    .is("deleted_at", null).order("part_number", { ascending: true });
  if (partsError) throw new Error(partsError.message);
  type Part = { part_number: number; r2_key: string; file_count: number; byte_size: number };
  const rows = (parts ?? []) as Part[];
  const dispositions: Record<string, string> = {};
  for (const part of rows) dispositions[part.r2_key] = buildContentDisposition(
    `${p.name}_최종보정본${rows.length > 1 ? `_part${part.part_number}` : ""}.zip`,
  );
  const signed = await callPresignApi(rows.map((part) => part.r2_key), dispositions);
  return rows.flatMap((part) => signed.urls[part.r2_key] ? [{
    partNumber: part.part_number, fileCount: part.file_count, byteSize: part.byte_size,
    url: signed.urls[part.r2_key],
  }] : []);
}
