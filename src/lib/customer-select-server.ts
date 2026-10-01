/**
 * 고객 직접 셀렉 서비스 전용 서버 헬퍼. 소유자는 Supabase Auth 세션(쿠키), 공유 링크
 * 참가자는 share_token으로 접근한다 — customer-api-server.ts(PIN 인증)와는 별도 모델이라
 * 그 파일의 헬퍼를 재사용하지 않는다(단계 0 분석 결과).
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { customerShareCookieName } from "@/lib/customer-select-share-auth";
import type { ColorTag, Photo, StarRating } from "@/types";

export async function getCurrentCustomerAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentCustomerAuthId(): Promise<string | null> {
  return (await getCurrentCustomerAuthUser())?.id ?? null;
}

export interface CustomerProjectRow {
  id: string;
  owner_id: string;
  name: string;
  shoot_type: string | null;
  shoot_date: string | null;
  selection_deadline: string | null;
  studio_name: string | null;
  photographer_name: string | null;
  shoot_region: string | null;
  shoot_location: string | null;
  target_count: number;
  photo_count: number;
  share_token: string;
  sharing_enabled: boolean;
  exported: boolean;
  delivery_count: number;
  last_delivered_at: string | null;
  retouch_done: boolean;
}

/** 소유자(세션) 또는 참가자(share_token) 중 하나라도 맞으면 프로젝트를 반환한다. */
export async function resolveCustomerProjectAccess(
  admin: SupabaseClient,
  projectId: string,
  shareToken: string | null
): Promise<{ project: CustomerProjectRow; isOwner: boolean } | NextResponse> {
  const { data: project, error } = await admin
    .from("customer_projects")
    .select("id, owner_id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, share_token, sharing_enabled, exported, delivery_count, last_delivered_at, retouch_done")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }
  const authId = await getCurrentCustomerAuthId();
  if (authId && authId === project.owner_id) {
    return { project, isOwner: true };
  }
  if (project.sharing_enabled && shareToken && shareToken === project.share_token) {
    return { project, isOwner: false };
  }
  return NextResponse.json({ error: "이 프로젝트에 접근할 권한이 없습니다." }, { status: 403 });
}

export function shareTokenFromRequest(req: NextRequest, projectId: string): string | null {
  return (
    req.nextUrl.searchParams.get("share_token") ??
    req.headers.get("x-share-token") ??
    req.cookies.get(customerShareCookieName(projectId))?.value ??
    null
  );
}

interface CustomerPhotoRow {
  id: string;
  filename: string;
  order_index: number;
  thumb_url: string | null;
  preview_url: string | null;
  similarity_group_id: string | null;
  taken_at?: string | null;
}

interface CustomerQualityRow {
  photo_id: string;
  eyes_closed: string;
  blur_or_shake: string;
  focus_issue: string;
  primary_subject_detected: boolean | null;
}

interface CustomerSelectionRow {
  photo_id: string;
  rating: number | null;
  color_tags: string[];
  comment: string | null;
  is_selected: boolean;
}

interface CustomerParticipantRow {
  color: string;
  nickname: string;
  done: boolean;
}

interface CustomerParticipantOpinionRow {
  photo_id: string;
  participant_color: string;
  rating: number | null;
}

export function buildCustomerCollaborationState(
  selections: CustomerSelectionRow[],
  participants: CustomerParticipantRow[],
  opinions: CustomerParticipantOpinionRow[]
) {
  const selectedIds: string[] = [];
  const photoStates: Record<string, { rating?: StarRating; color?: ColorTag[]; comment?: string }> = {};
  for (const selection of selections) {
    if (selection.is_selected) selectedIds.push(selection.photo_id);
    photoStates[selection.photo_id] = {
      rating: (selection.rating ?? undefined) as StarRating | undefined,
      color: (selection.color_tags ?? []) as ColorTag[],
      comment: selection.comment ?? undefined,
    };
  }
  const participantDone: Record<string, boolean> = {};
  const participantNicknames: Record<string, string> = {};
  for (const participant of participants) {
    participantDone[participant.color] = participant.done;
    participantNicknames[participant.color] = participant.nickname;
  }
  const participantOpinions: Record<string, Record<string, { rating?: StarRating }>> = {};
  for (const opinion of opinions) {
    participantOpinions[opinion.photo_id] ??= {};
    participantOpinions[opinion.photo_id][opinion.participant_color] = {
      rating: (opinion.rating ?? undefined) as StarRating | undefined,
    };
  }
  return { selectedIds, photoStates, participantOpinions, participantDone, participantNicknames };
}

export function toPhoto(row: CustomerPhotoRow, projectId: string, quality?: CustomerQualityRow): Photo {
  return {
    id: row.id,
    projectId,
    orderIndex: row.order_index,
    url: row.thumb_url ?? "",
    previewUrl: row.preview_url,
    originalFilename: row.filename,
    similarityGroupId: row.similarity_group_id,
    takenAt: row.taken_at ?? null,
    isBlurry: quality ? [quality.blur_or_shake, quality.focus_issue].some((value) => value === "possible" || value === "likely") : null,
    faceDetected: quality?.primary_subject_detected ?? null,
    // 눈 감음은 "likely"만 — 웃거나 윙크한 의도된 표정이 "possible"로 많이 잡힌다(실제 60장 중 10장).
    eyesClosed: quality ? quality.eyes_closed === "likely" : null,
  };
}

/** AI 장면(clip-service가 촬영 시각 공백으로 나누고 이름을 붙여 저장). photoIds는 촬영 시각순. */
export type AiScene = { name: string | null; start: string | null; end: string | null; photoIds: string[] };
type CustomerSceneRow = { id: string; scene_index: number; name: string | null; start_at: string | null; end_at: string | null };

export function toAiScenes(scenes: CustomerSceneRow[], assignments: { id: string; scene_id: string | null }[], photos: CustomerPhotoRow[]): AiScene[] | null {
  if (!scenes.length) return null;
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  const order = (id: string) => photoById.get(id);
  return scenes.slice().sort((a, b) => a.scene_index - b.scene_index).map((scene) => ({
    name: scene.name,
    start: scene.start_at,
    end: scene.end_at,
    photoIds: assignments.filter((row) => row.scene_id === scene.id && photoById.has(row.id)).map((row) => row.id)
      .sort((a, b) => (order(a)!.taken_at ?? "￿").localeCompare(order(b)!.taken_at ?? "￿") || order(a)!.order_index - order(b)!.order_index),
  }));
}

/** mock-store.tsx의 MockProject 형태와 최대한 맞춰서, 화면 컴포넌트를 그대로 재사용한다. */
export function buildProjectView(
  project: CustomerProjectRow,
  photos: CustomerPhotoRow[],
  selections: CustomerSelectionRow[],
  participants: CustomerParticipantRow[],
  quality: CustomerQualityRow[] = [],
  opinions: CustomerParticipantOpinionRow[] = [],
  aiScenes: AiScene[] | null = null,
) {
  const collaboration = buildCustomerCollaborationState(selections, participants, opinions);
  const qualityByPhoto = new Map(quality.map((row) => [row.photo_id, row]));
  return {
    id: project.id,
    name: project.name,
    shootType: project.shoot_type ?? "",
    shootDate: project.shoot_date,
    selectionDeadline: project.selection_deadline,
    studioName: project.studio_name,
    photographerName: project.photographer_name,
    shootRegion: project.shoot_region,
    shootLocation: project.shoot_location,
    target: project.target_count,
    photoCount: project.photo_count,
    uploaded: project.photo_count > 0,
    photos: photos
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => toPhoto(p, project.id, qualityByPhoto.get(p.id))),
    ...collaboration,
    exported: project.exported,
    deliveryCount: project.delivery_count,
    lastDeliveredAt: project.last_delivered_at,
    onlineParticipants: [],
    participantViews: {},
    realtimeKey: createHash("sha256").update(project.share_token).digest("hex"),
    shareToken: project.share_token,
    shareEnabled: project.sharing_enabled,
    aiScenes,
  };
}
