import "server-only";
import { getAdminClient } from "@/lib/supabase-admin";
import { customerSceneCatalog } from "@/lib/customer-shoot-scenes";
import type { LabeledScene } from "@/lib/scene-label-score";

/** 장면 검수(/admin/scenes)용 서버 조회. 서비스 화면 데이터는 읽기만 하고, 정답은 customer_scene_labels에만 쓴다. */

export type ReviewPhoto = { id: string; thumbUrl: string | null; takenAt: string | null; filename: string };
export type SceneLabelRow = { project_id: string; shoot_type: string | null; scenes: LabeledScene[]; ai_scenes: LabeledScene[] | null; note: string | null; labeled_by: string; updated_at: string };

// clip-service `ai_settings`에 함께 남기는 현재 AI 설정 — 기준값을 바꾸면 여기도 바꾼다(채점 비교용 기록).
export const CURRENT_AI_SETTINGS = { gapMinutes: 3, qualityPromptVersion: "v1-people" } as const;

const PAGE = 1000; // PostgREST 기본 최대 행 수

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** clip-service capture_order와 같은 순서: 촬영 시각(없으면 뒤로), 같으면 업로드 순 */
function byCaptureOrder<T extends { taken_at: string | null; order_index: number }>(a: T, b: T) {
  return (a.taken_at === null ? 1 : 0) - (b.taken_at === null ? 1 : 0) || (a.taken_at ?? "").localeCompare(b.taken_at ?? "") || a.order_index - b.order_index;
}

export async function loadSceneReview(projectId: string) {
  const admin = getAdminClient();
  const { data: project } = await admin.from("customer_projects").select("id, name, shoot_type, photo_count, created_at").eq("id", projectId).maybeSingle();
  if (!project) return null;
  type PhotoRow = { id: string; thumb_url: string | null; taken_at: string | null; order_index: number; filename: string; scene_id: string | null };
  const photos = (await allRows<PhotoRow>((from, to) => admin.from("customer_photos").select("id, thumb_url, taken_at, order_index, filename, scene_id").eq("project_id", projectId).order("order_index").range(from, to))).sort(byCaptureOrder);
  const { data: sceneRows } = await admin.from("customer_scenes").select("id, scene_index, name").eq("project_id", projectId).order("scene_index");
  const { data: label, error: labelError } = await admin.from("customer_scene_labels").select("*").eq("project_id", projectId).maybeSingle();

  // AI 장면: 장면 순서대로 그 장면 사진을 촬영 순서로. 어느 장면에도 없는 사진(정리 뒤 새로 올림)은 이름 없는 마지막 장면.
  let aiScenes: LabeledScene[] | null = null;
  if (sceneRows?.length) {
    aiScenes = sceneRows.map((scene) => ({ name: scene.name, photoIds: photos.filter((photo) => photo.scene_id === scene.id).map((photo) => photo.id) })).filter((scene) => scene.photoIds.length);
    const rest = photos.filter((photo) => !photo.scene_id || !sceneRows.some((scene) => scene.id === photo.scene_id)).map((photo) => photo.id);
    if (rest.length) aiScenes.push({ name: null, photoIds: rest });
  }
  return {
    project: { id: project.id as string, name: project.name as string, shootType: (project.shoot_type as string | null) ?? null, createdAt: project.created_at as string },
    photos: photos.map((photo): ReviewPhoto => ({ id: photo.id, thumbUrl: photo.thumb_url, takenAt: photo.taken_at, filename: photo.filename })),
    aiScenes,
    label: (label as SceneLabelRow | null) ?? null,
    labelTableMissing: Boolean(labelError),
    catalog: customerSceneCatalog(project.shoot_type as string | null),
  };
}

export async function loadSceneReviewList() {
  const admin = getAdminClient();
  const { data: projects } = await admin.from("customer_projects").select("id, name, shoot_type, photo_count, created_at").gt("photo_count", 0).order("created_at", { ascending: false });
  const ids = (projects ?? []).map((project) => project.id as string);
  // ponytail: 장면 수는 최근 프로젝트 200개까지만 센다(조회 주소 길이·행 수 한도). 베타 규모를 넘으면 집계 뷰로 바꾼다.
  const [{ data: scenes }, labels] = await Promise.all([
    ids.length ? admin.from("customer_scenes").select("project_id").in("project_id", ids.slice(0, 200)) : Promise.resolve({ data: [] as { project_id: string }[] }),
    admin.from("customer_scene_labels").select("project_id, scenes, ai_scenes, labeled_by, updated_at"),
  ]);
  const sceneCount = new Map<string, number>();
  (scenes ?? []).forEach((row) => sceneCount.set(row.project_id, (sceneCount.get(row.project_id) ?? 0) + 1));
  const labelOf = new Map(((labels.data ?? []) as Pick<SceneLabelRow, "project_id" | "scenes" | "ai_scenes" | "labeled_by" | "updated_at">[]).map((row) => [row.project_id, row]));
  return {
    labelTableMissing: Boolean(labels.error),
    projects: (projects ?? []).map((project) => ({
      id: project.id as string,
      name: project.name as string,
      shootType: (project.shoot_type as string | null) ?? null,
      photoCount: project.photo_count as number,
      createdAt: project.created_at as string,
      aiSceneCount: sceneCount.get(project.id as string) ?? 0,
      label: labelOf.get(project.id as string) ?? null,
    })),
  };
}
