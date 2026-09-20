/**
 * 고객 직접 셀렉 서비스 전용 서버 헬퍼. 소유자는 Supabase Auth 세션(쿠키), 공유 링크
 * 참가자는 share_token으로 접근한다 — customer-api-server.ts(PIN 인증)와는 별도 모델이라
 * 그 파일의 헬퍼를 재사용하지 않는다(단계 0 분석 결과).
 */
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { customerShareCookieName } from "@/lib/customer-select-share-auth";
import type { ColorTag, Photo, StarRating } from "@/types";

export async function getCurrentCustomerAuthId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export interface CustomerProjectRow {
  id: string;
  owner_id: string;
  name: string;
  shoot_type: string | null;
  shoot_date: string | null;
  selection_deadline: string | null;
  studio_name: string | null;
  target_count: number;
  photo_count: number;
  share_token: string;
  exported: boolean;
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
    .select("id, owner_id, name, shoot_type, shoot_date, selection_deadline, studio_name, target_count, photo_count, share_token, exported, retouch_done")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }
  const authId = await getCurrentCustomerAuthId();
  if (authId && authId === project.owner_id) {
    return { project, isOwner: true };
  }
  if (shareToken && shareToken === project.share_token) {
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

export function toPhoto(row: CustomerPhotoRow, projectId: string, quality?: CustomerQualityRow): Photo {
  return {
    id: row.id,
    projectId,
    orderIndex: row.order_index,
    url: row.thumb_url ?? "",
    previewUrl: row.preview_url,
    originalFilename: row.filename,
    similarityGroupId: row.similarity_group_id,
    isBlurry: quality ? [quality.blur_or_shake, quality.focus_issue].some((value) => value === "possible" || value === "likely") : null,
    faceDetected: quality?.primary_subject_detected ?? null,
    eyesClosed: quality ? quality.eyes_closed === "possible" || quality.eyes_closed === "likely" : null,
  };
}

/** mock-store.tsx의 MockProject 형태와 최대한 맞춰서, 화면 컴포넌트를 그대로 재사용한다. */
export function buildProjectView(
  project: CustomerProjectRow,
  photos: CustomerPhotoRow[],
  selections: CustomerSelectionRow[],
  participants: CustomerParticipantRow[],
  quality: CustomerQualityRow[] = []
) {
  const selectionByPhoto = new Map(selections.map((s) => [s.photo_id, s]));
  const selectedIds: string[] = [];
  const photoStates: Record<string, { rating?: StarRating; color?: ColorTag[]; comment?: string }> = {};
  for (const sel of selections) {
    if (sel.is_selected) selectedIds.push(sel.photo_id);
    photoStates[sel.photo_id] = {
      rating: (sel.rating ?? undefined) as StarRating | undefined,
      color: (sel.color_tags ?? []) as ColorTag[],
      comment: sel.comment ?? undefined,
    };
  }
  const participantDone: Record<string, boolean> = {};
  const participantNicknames: Record<string, string> = {};
  for (const p of participants) {
    participantDone[p.color] = p.done;
    participantNicknames[p.color] = p.nickname;
  }
  void selectionByPhoto;
  const qualityByPhoto = new Map(quality.map((row) => [row.photo_id, row]));
  return {
    id: project.id,
    name: project.name,
    shootType: project.shoot_type ?? "",
    shootDate: project.shoot_date,
    selectionDeadline: project.selection_deadline,
    studioName: project.studio_name,
    target: project.target_count,
    photoCount: project.photo_count,
    uploaded: project.photo_count > 0,
    photos: photos
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => toPhoto(p, project.id, qualityByPhoto.get(p.id))),
    selectedIds,
    photoStates,
    participantDone,
    participantNicknames,
    exported: project.exported,
    shareToken: project.share_token,
  };
}
