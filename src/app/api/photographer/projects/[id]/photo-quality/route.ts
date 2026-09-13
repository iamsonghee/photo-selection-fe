import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  buildQualityFlagMap,
  type GeminiQualityRow,
  type PhotoQualityFlags,
} from "@/lib/photo-quality";

/**
 * GET /api/photographer/projects/[id]/photo-quality
 *
 * 프로젝트 사진들의 Gemini Flash 품질 판정을 `{ [photoId]: flags }`로 돌려준다.
 *
 * **서버 라우트인 이유**: `gemini_quality_assessments`에는 RLS가 걸려 있어 브라우저의 anon 키로는
 * 읽히지 않는다(실측 2026-09-12 — service role 80행 / anon 0행). 작가 갤러리는 클라이언트에서
 * 사진을 불러오므로(`db.ts`의 `getPhotosByProjectId`), 품질만 여기를 거쳐 받는다.
 *
 * 관리자 전용이 아니다 — 품질 표시는 이제 모든 작가가 쓰는 기능이라 세션 + 소유권만 확인한다
 * (같은 이유로 일반 경로가 된 `gemini-analysis` 라우트와 같은 검증).
 */
async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: project } = await admin
      .from("projects")
      .select("id, photographer_id")
      .eq("id", projectId)
      .single();
    if (!project || project.photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("gemini_quality_assessments")
      .select("photo_id, eyes_closed, blur_or_shake, focus_issue, face_occluded, primary_subject_detected, created_at")
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);

    /* 작가는 골라내기 전에 훑어보는 쪽이라 `possible`까지 넓게 잡는다 — 고객은 `likely`만
     * 본다(§photo-quality). 같은 행을 두 기준으로 자르는 판단은 그 모듈 한 곳에만 있다. */
    const flagMap = buildQualityFlagMap(
      (data ?? []) as unknown as GeminiQualityRow[],
      "photographer"
    );

    const quality: Record<string, PhotoQualityFlags> = {};
    for (const [photoId, flags] of flagMap) quality[photoId] = flags;

    return NextResponse.json({ quality, analyzedCount: flagMap.size });
  } catch (e) {
    console.error("[GET photo-quality]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
