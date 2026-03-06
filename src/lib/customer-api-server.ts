/**
 * 고객 플로우 API용 서버 전용 헬퍼.
 * Service Role 클라이언트로 selections 등 RLS를 우회해 처리.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase-admin";
import type { Project, Photo } from "@/types";
import type { PhotoState } from "@/contexts/SelectionContext";
import type { Database } from "@/types/supabase";

type ProjectsRow = Database["public"]["Tables"]["projects"]["Row"];
type PhotosRow = Database["public"]["Tables"]["photos"]["Row"];
type SelectionsRow = Database["public"]["Tables"]["selections"]["Row"];

function mapProjectRow(row: ProjectsRow): Project {
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
    selected: selectedIds.has(pid),
    tag: photoStates[pid]
      ? { star: photoStates[pid].rating as 1 | 2 | 3 | 4 | 5 | undefined, color: photoStates[pid].color }
      : undefined,
    comment: undefined,
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

/** 프로젝트의 사진 + selections (admin). */
export async function getPhotosWithSelectionsAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{ photos: Photo[]; selectedIds: Set<string>; photoStates: Record<string, PhotoState> }> {
  const [photosRes, selectionsRes] = await Promise.all([
    admin
      .from("photos")
      .select("*")
      .eq("project_id", projectId)
      .order("number", { ascending: true }),
    admin.from("selections").select("*").eq("project_id", projectId),
  ]);
  if (photosRes.error) throw new Error(photosRes.error.message);
  if (selectionsRes.error) throw new Error(selectionsRes.error.message);

  const rows = (photosRes.data ?? []) as PhotosRow[];
  const selections = (selectionsRes.data ?? []) as SelectionsRow[];
  const selectedIds = new Set(selections.map((s) => s.photo_id));
  const photoStates: Record<string, PhotoState> = {};
  for (const s of selections) {
    photoStates[s.photo_id] = {
      rating: (s.rating as 1 | 2 | 3 | 4 | 5) ?? undefined,
      color: (s.color_tag as PhotoState["color"]) ?? undefined,
      comment: s.comment ?? undefined,
    };
  }
  const photos = rows.map((row) => mapPhotoRow(row, selectedIds, photoStates));
  return { photos, selectedIds, photoStates };
}

export async function upsertSelectionAdmin(
  admin: SupabaseClient,
  params: {
    project_id: string;
    photo_id: string;
    rating?: number | null;
    color_tag?: string | null;
    comment?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from("selections").upsert(
    {
      project_id: params.project_id,
      photo_id: params.photo_id,
      rating: params.rating ?? null,
      color_tag: params.color_tag ?? null,
      comment: params.comment ?? null,
    },
    { onConflict: "project_id,photo_id" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteSelectionAdmin(
  admin: SupabaseClient,
  projectId: string,
  photoId: string
): Promise<void> {
  const { error } = await admin
    .from("selections")
    .delete()
    .eq("project_id", projectId)
    .eq("photo_id", photoId);
  if (error) throw new Error(error.message);
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
