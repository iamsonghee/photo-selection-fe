import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Project, Photo, ProjectStatus } from "@/types";
import type { PhotoState } from "@/contexts/SelectionContext";
import type { Database } from "@/types/supabase";

type PhotoVersionRow = Database["public"]["Tables"]["photo_versions"]["Row"];
type VersionReviewRow = Database["public"]["Tables"]["version_reviews"]["Row"];

/** DB projects row → app Project */
function mapProjectRow(row: Database["public"]["Tables"]["projects"]["Row"]): Project {
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
    confirmedAt: row.confirmed_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** DB photos row → app Photo (with optional selection state) */
function mapPhotoRow(
  row: Database["public"]["Tables"]["photos"]["Row"],
  selectedIds?: Set<string>,
  photoStates?: Record<string, PhotoState>
): Photo {
  const pid = row.id;
  const selected = selectedIds?.has(pid);
  const state = photoStates?.[pid];
  return {
    id: row.id,
    projectId: row.project_id,
    orderIndex: row.number,
    url: row.r2_thumb_url,
    originalFilename: row.original_filename ?? null,
    photographerMemo: row.memo ?? undefined,
    selected,
    tag: state ? { star: state.rating as 1 | 2 | 3 | 4 | 5 | undefined, color: state.color } : undefined,
    comment: undefined,
  };
}

/** 로그인한 auth user id로 photographers.id 조회 (프로젝트 생성 시 사용) */
export async function getPhotographerIdByAuthId(authId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", authId)
    .limit(1)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(supabaseErrorMessage(error));
  }
  return data?.id ?? null;
}

export type ProjectLogAction = "created" | "uploaded" | "selecting" | "confirmed" | "editing";

export interface ProjectLogItem {
  id: string;
  projectId: string;
  projectName: string;
  action: ProjectLogAction;
  createdAt: string;
}

/** 활동 로그 최근 N건 (project_logs 테이블 없으면 빈 배열 반환) */
export async function getProjectLogsRecent(
  photographerId: string,
  limit = 10
): Promise<ProjectLogItem[]> {
  const { data, error } = await supabase
    .from("project_logs")
    .select("id, project_id, action, created_at")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  if (!data?.length) return [];

  return data.map((row: { id: string; project_id: string; action: ProjectLogAction; created_at: string }) => ({
    id: row.id,
    projectId: row.project_id,
    projectName: "프로젝트",
    action: row.action,
    createdAt: row.created_at,
  }));
}

/** Supabase/PostgREST 에러에서 읽을 수 있는 문자열 추출 (속성이 비열거형이어도 동작) */
function supabaseErrorMessage(err: { message?: string; details?: string; hint?: string; code?: string }): string {
  const parts = [
    err.message,
    err.details,
    err.hint,
    err.code ? `[${err.code}]` : "",
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return Object.getOwnPropertyNames(err)
    .map((k) => `${k}: ${(err as Record<string, unknown>)[k]}`)
    .join(", ") || "Unknown error";
}

/** 작가 대시보드: photographer_id로 프로젝트 목록 조회 */
export async function getProjectsByPhotographerId(
  photographerId: string
): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("photographer_id", photographerId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapProjectRow);
}

/** 프로젝트 ID로 단건 조회 */
export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? mapProjectRow(data) : null;
}

/** access_token으로 프로젝트 조회 (고객 플로우) */
export async function getProjectByAccessToken(
  token: string
): Promise<Project | null> {
  if (!token?.trim()) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("access_token", token)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? mapProjectRow(data) : null;
}

/**
 * 프로젝트 생성 → id 반환.
 * INSERT 실패 시 error.message를 담아 throw.
 * RLS: Supabase 대시보드 → Table Editor → projects → RLS에서 INSERT 정책이 있어야 함.
 */
export async function createProject(params: {
  name: string;
  customer_name: string;
  shoot_date: string;
  deadline: string;
  required_count: number;
  photographer_id: string;
}): Promise<string> {
  const accessToken = crypto.randomUUID();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: params.name,
      customer_name: params.customer_name,
      shoot_date: params.shoot_date,
      deadline: params.deadline,
      required_count: params.required_count,
      photo_count: 0,
      status: "preparing",
      photographer_id: params.photographer_id,
      access_token: accessToken,
    })
    .select("id")
    .single();

  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data?.id) throw new Error("Project created but no id returned");
  return data.id;
}

/** 프로젝트 수정 (name, customer_name, shoot_date, deadline, required_count, status 등) */
export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    customer_name: string;
    shoot_date: string;
    deadline: string;
    required_count: number;
    status: ProjectStatus;
    confirmed_at: string | null;
    delivered_at: string | null;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) payload.name = patch.name;
  if (patch.customer_name != null) payload.customer_name = patch.customer_name;
  if (patch.shoot_date != null) payload.shoot_date = patch.shoot_date;
  if (patch.deadline != null) payload.deadline = patch.deadline;
  if (patch.required_count != null) payload.required_count = patch.required_count;
  if (patch.status != null) payload.status = patch.status;
  if (patch.confirmed_at !== undefined) payload.confirmed_at = patch.confirmed_at;
  if (patch.delivered_at !== undefined) payload.delivered_at = patch.delivered_at;

  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  if (error) throw error;
}

/** 프로젝트의 사진 목록 조회 */
export async function getPhotosByProjectId(projectId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("project_id", projectId)
    .order("number", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) =>
    mapPhotoRow(row as Database["public"]["Tables"]["photos"]["Row"])
  );
}

/** 프로젝트의 사진 목록 + 선택/태그 상태 (고객 갤러리용) */
export async function getPhotosWithSelections(
  projectId: string
): Promise<{ photos: Photo[]; selectedIds: Set<string>; photoStates: Record<string, PhotoState> }> {
  const [photosRes, selectionsRes] = await Promise.all([
    supabase.from("photos").select("*").eq("project_id", projectId).order("number", { ascending: true }),
    supabase.from("selections").select("*").eq("project_id", projectId),
  ]);

  if (photosRes.error) throw photosRes.error;
  if (selectionsRes.error) throw selectionsRes.error;

  const rows = (photosRes.data ?? []) as Database["public"]["Tables"]["photos"]["Row"][];
  const selections = selectionsRes.data ?? [];
  const selectedIds = new Set(selections.map((s: { photo_id: string }) => s.photo_id));
  const photoStates: Record<string, PhotoState> = {};
  for (const s of selections as Array<{ photo_id: string; rating: number | null; color_tag: string | null; comment: string | null }>) {
    photoStates[s.photo_id] = {
      rating: (s.rating as 1 | 2 | 3 | 4 | 5) ?? undefined,
      color: (s.color_tag as PhotoState["color"]) ?? undefined,
      comment: s.comment ?? undefined,
    };
  }

  const photos = rows.map((row) => mapPhotoRow(row, selectedIds, photoStates));
  return { photos, selectedIds, photoStates };
}

/** selection 추가(이미 있으면 무시 또는 업데이트) */
export async function upsertSelection(params: {
  project_id: string;
  photo_id: string;
  rating?: number | null;
  color_tag?: string | null;
  comment?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("selections").upsert(
    {
      project_id: params.project_id,
      photo_id: params.photo_id,
      rating: params.rating ?? null,
      color_tag: params.color_tag ?? null,
      comment: params.comment ?? null,
    },
    { onConflict: "project_id,photo_id" } as { onConflict?: string }
  );
  if (error) throw error;
}

/** selection 삭제 (선택 해제) */
export async function deleteSelection(
  projectId: string,
  photoId: string
): Promise<void> {
  const { error } = await supabase
    .from("selections")
    .delete()
    .eq("project_id", projectId)
    .eq("photo_id", photoId);
  if (error) throw error;
}

/** 최종확정: status → confirmed, confirmed_at 설정 */
export async function confirmProject(projectId: string): Promise<void> {
  await updateProject(projectId, {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });
}

// ---------- 보정본 검토 (photo_versions, version_reviews) ----------

export interface PhotoVersionRecord {
  id: string;
  photoId: string;
  version: 1 | 2;
  r2Url: string;
  photographerMemo: string | null;
  createdAt: string;
}

export interface VersionReviewRecord {
  id: string;
  photoVersionId: string;
  photoId: string;
  status: "approved" | "revision_requested";
  customerComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function mapPhotoVersionRow(row: PhotoVersionRow): PhotoVersionRecord {
  return {
    id: row.id,
    photoId: row.photo_id,
    version: row.version as 1 | 2,
    r2Url: row.r2_url,
    photographerMemo: row.photographer_memo ?? null,
    createdAt: row.created_at,
  };
}

function mapVersionReviewRow(row: VersionReviewRow): VersionReviewRecord {
  return {
    id: row.id,
    photoVersionId: row.photo_version_id,
    photoId: row.photo_id,
    status: row.status,
    customerComment: row.customer_comment ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
  };
}

/** 프로젝트의 선택된 사진에 대한 photo_versions 조회 (photos JOIN). version 필터 optional */
export async function getPhotoVersionsByProjectId(
  projectId: string,
  version?: 1 | 2
): Promise<PhotoVersionRecord[]> {
  const { data: selections } = await supabase
    .from("selections")
    .select("photo_id")
    .eq("project_id", projectId);
  const photoIds = (selections?.data ?? []).map((s: { photo_id: string }) => s.photo_id);
  if (photoIds.length === 0) return [];

  let query = supabase
    .from("photo_versions")
    .select("*")
    .in("photo_id", photoIds);
  if (version != null) query = query.eq("version", version);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapPhotoVersionRow(row as PhotoVersionRow));
}

/** 프로젝트 내 선택된 사진의 version_reviews 조회 (photo_versions JOIN 후 photo_id로 photos.project_id 필터) */
export async function getVersionReviewsByProjectId(
  projectId: string
): Promise<VersionReviewRecord[]> {
  const photoIds = await getSelectedPhotoIds(projectId);
  if (photoIds.length === 0) return [];

  const { data: pvRows, error: pvError } = await supabase
    .from("photo_versions")
    .select("id, photo_id")
    .in("photo_id", photoIds);
  if (pvError) throw pvError;
  const pvIds = (pvRows ?? []).map((r: { id: string }) => r.id);
  if (pvIds.length === 0) return [];

  const { data, error } = await supabase
    .from("version_reviews")
    .select("*")
    .in("photo_version_id", pvIds);
  if (error) throw error;
  return (data ?? []).map((row) => mapVersionReviewRow(row as VersionReviewRow));
}

async function getSelectedPhotoIds(projectId: string): Promise<string[]> {
  const { data } = await supabase
    .from("selections")
    .select("photo_id")
    .eq("project_id", projectId);
  return (data ?? []).map((s: { photo_id: string }) => s.photo_id);
}

/** photo_versions 일괄 INSERT */
export async function createPhotoVersions(
  versions: Array<{
    photo_id: string;
    version: 1 | 2;
    r2_url: string;
    photographer_memo?: string | null;
  }>
): Promise<void> {
  if (versions.length === 0) return;
  const rows = versions.map((v) => ({
    photo_id: v.photo_id,
    version: v.version,
    r2_url: v.r2_url,
    photographer_memo: v.photographer_memo ?? null,
  }));
  const { error } = await supabase.from("photo_versions").insert(rows);
  if (error) throw error;
}

/** version_reviews UPSERT (photo_version_id 기준) */
export async function upsertVersionReview(params: {
  photo_version_id: string;
  photo_id: string;
  status: "approved" | "revision_requested";
  customer_comment?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("version_reviews").upsert(
    {
      photo_version_id: params.photo_version_id,
      photo_id: params.photo_id,
      status: params.status,
      customer_comment: params.customer_comment ?? null,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "photo_version_id" } as { onConflict?: string }
  );
  if (error) throw error;
}

/** 고객 검토 최종 제출: version_reviews 일괄 INSERT 후 project status 업데이트 (admin 클라이언트 사용) */
export async function submitVersionReviews(
  admin: SupabaseClient,
  projectId: string,
  reviews: Array<{
    photo_version_id: string;
    photo_id: string;
    status: "approved" | "revision_requested";
    customer_comment?: string | null;
  }>
): Promise<{ status: ProjectStatus }> {
  const now = new Date().toISOString();
  const rows = reviews.map((r) => ({
    photo_version_id: r.photo_version_id,
    photo_id: r.photo_id,
    status: r.status,
    customer_comment: r.customer_comment ?? null,
    reviewed_at: now,
  }));
  const { error: insertError } = await admin.from("version_reviews").upsert(rows, {
    onConflict: "photo_version_id",
  });
  if (insertError) {
    console.error("[submitVersionReviews] version_reviews upsert", insertError);
    throw new Error(`검토 저장 실패: ${insertError.message}`);
  }

  const hasRevision = reviews.some((r) => r.status === "revision_requested");
  const newStatus: ProjectStatus = hasRevision ? "editing_v2" : "delivered";
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
  };
  if (newStatus === "delivered") updatePayload.delivered_at = now;

  let updateError: { message: string } | null = null;
  const { error: err } = await admin
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);
  updateError = err;

  // delivered_at 컬럼이 없을 수 있음(마이그레이션 미적용) → 제외하고 재시도
  if (updateError && newStatus === "delivered" && /delivered_at|column/i.test(updateError.message)) {
    const fallbackPayload = { status: newStatus, updated_at: now };
    const { error: err2 } = await admin.from("projects").update(fallbackPayload).eq("id", projectId);
    if (!err2) return { status: newStatus };
    updateError = err2;
  }

  if (updateError) {
    console.error("[submitVersionReviews] projects update", updateError);
    throw new Error(`프로젝트 상태 변경 실패: ${updateError.message}`);
  }
  return { status: newStatus };
}
