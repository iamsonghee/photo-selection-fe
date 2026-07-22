/**
 * 고객 플로우 API용 서버 전용 헬퍼.
 * Service Role 클라이언트로 selections 등 RLS를 우회해 처리.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase-admin";
import type { Project, Photo, PhotoGroupInfo, ProjectStatus } from "@/types";
import { parseColorTags } from "@/types";
import type { PhotoState } from "@/contexts/SelectionContext";
import type { Database } from "@/types/supabase";

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
    accessPin: (row as any).access_pin ?? null,
    confirmedAt: row.confirmed_at ?? undefined,
    deliveredAt: (row as { delivered_at?: string | null }).delivered_at ?? undefined,
    customerCancelCount: r.customer_cancel_count ?? 0,
    maxRevisionCount: (r.max_revision_count ?? 0) as 0 | 1 | 2,
    revisionRound: r.revision_round ?? 0,
    reviewDeadline: r.review_deadline ?? null,
    clipAnalysisStatus:
      (row as { clip_analysis_status?: "processing" | "completed" | "failed" | null })
        .clip_analysis_status ?? null,
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
    isBlurry: (row as { is_blurry?: boolean | null }).is_blurry ?? null,
    faceDetected: (row as { face_detected?: boolean | null }).face_detected ?? null,
    eyesClosed: (row as { eyes_closed?: boolean | null }).eyes_closed ?? null,
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
  // Supabase PostgREST 기본 limit=1000 우회(src/lib/db.ts와 동일 패턴) — BETA_MAX=3000이므로
  // photos/selections는 3페이지를 병렬 요청한다. 안 하면 1000장 넘는 프로젝트에서 고객 갤러리/
  // 뷰어의 전체 장수·뒷 순번 사진들이 통째로 잘려서 안 보이는 문제가 생긴다.
  const PAGE = 1000;
  const [photoPages, selectionPages, groupsRes] = await Promise.all([
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
    Promise.all(
      [0, 1, 2].map((i) =>
        admin
          .from("selections")
          .select("*")
          .eq("project_id", projectId)
          .range(i * PAGE, (i + 1) * PAGE - 1)
      )
    ),
    admin
      .from("photo_groups")
      .select("id, representative_photo_id, photo_count")
      .eq("project_id", projectId),
  ]);
  for (const p of photoPages) if (p.error) throw new Error(p.error.message);
  for (const s of selectionPages) if (s.error) throw new Error(s.error.message);
  if (groupsRes.error) throw new Error(groupsRes.error.message);

  const rows = photoPages.flatMap((p) => (p.data ?? []) as PhotosRow[]);
  const selections = selectionPages.flatMap((s) => (s.data ?? []) as SelectionsRow[]);
  // is_selected로 명시적으로 선택된 사진만 카운트한다.
  // 별점/컬러태그/코멘트만 남긴 행은 selections 테이블에 존재하지만 "선택"은 아니다.
  const selectedIds = new Set(
    selections.filter((s) => s.is_selected).map((s) => s.photo_id)
  );
  const photoStates: Record<string, PhotoState> = {};
  for (const s of selections) {
    const parsedColor = parseColorTags(s.color_tag as string | null);
    photoStates[s.photo_id] = {
      rating: (s.rating as 1 | 2 | 3 | 4 | 5) ?? undefined,
      color: parsedColor.length ? parsedColor : undefined,
      comment: s.comment ?? undefined,
    };
  }
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
    rating?: number | null;
    color_tag?: string | null;
    comment?: string | null;
    /** 생략 시 기존 선택 상태를 그대로 둔다 (별점/코멘트만 남기는 경우 등). */
    is_selected?: boolean;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    project_id: params.project_id,
    photo_id: params.photo_id,
    rating: params.rating ?? null,
    color_tag: params.color_tag ?? null,
    comment: params.comment ?? null,
  };
  if (params.is_selected !== undefined) {
    payload.is_selected = params.is_selected;
  }
  const { error } = await admin
    .from("selections")
    .upsert(payload, { onConflict: "project_id,photo_id" });
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
