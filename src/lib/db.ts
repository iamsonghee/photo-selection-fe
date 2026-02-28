import { supabase } from "@/lib/supabase";
import type { Project, Photo } from "@/types";
import type { PhotoState } from "@/contexts/SelectionContext";
import type { Database } from "@/types/supabase";

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
    status: row.status,
    accessToken: row.access_token,
    confirmedAt: row.confirmed_at ?? undefined,
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

/** 프로젝트 수정 (name, customer_name, shoot_date, deadline, required_count) */
export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    customer_name: string;
    shoot_date: string;
    deadline: string;
    required_count: number;
    status: "preparing" | "selecting" | "confirmed" | "editing";
    confirmed_at: string | null;
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
