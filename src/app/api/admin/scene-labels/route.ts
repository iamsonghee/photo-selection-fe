import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { LEGACY_AI_SETTINGS, loadSceneReview } from "@/lib/admin-scene-review";
import type { LabeledScene } from "@/lib/scene-label-score";

/**
 * POST /api/admin/scene-labels — 관리자 전용. 장면 검수 정답을 저장(프로젝트당 한 건, 덮어쓰기).
 * 그 시점의 AI 장면과, 그 장면을 만든 장면 실행의 설정(clip-service가 실행에 남긴 기준값·이름 목록·모델·프롬프트 버전)을
 * 함께 남겨 나중에 설정끼리 채점한다. 서비스 화면의 장면은 바꾸지 않는다.
 */
export async function POST(req: NextRequest) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { projectId?: unknown; scenes?: unknown; note?: unknown };
  if (typeof body.projectId !== "string" || !Array.isArray(body.scenes)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const scenes: LabeledScene[] = [];
  for (const raw of body.scenes) {
    const scene = raw as { name?: unknown; photoIds?: unknown };
    const name = typeof scene.name === "string" && scene.name.trim() ? scene.name.trim().slice(0, 40) : null;
    if (!Array.isArray(scene.photoIds) || !scene.photoIds.length || !scene.photoIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "장면마다 사진이 한 장 이상 있어야 합니다." }, { status: 400 });
    }
    scenes.push({ name, photoIds: scene.photoIds as string[] });
  }

  const review = await loadSceneReview(body.projectId);
  if (!review) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  // 정답은 프로젝트 사진 전체를 빠짐없이, 겹치지 않게 나눈 것이어야 한다(채점이 같은 사진 집합을 전제).
  const labeled = scenes.flatMap((scene) => scene.photoIds);
  const all = new Set(review.photos.map((photo) => photo.id));
  if (labeled.length !== all.size || new Set(labeled).size !== labeled.length || labeled.some((id) => !all.has(id))) {
    return NextResponse.json({ error: "사진 목록이 바뀌었어요. 새로고침한 뒤 다시 검수해 주세요." }, { status: 409 });
  }

  const admin = getAdminClient();
  const { data: run } = await admin.from("customer_ai_runs").select("settings").eq("project_id", review.project.id)
    .eq("kind", "scene").eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await admin.from("customer_scene_labels").upsert({
    project_id: review.project.id,
    shoot_type: review.project.shootType,
    scenes,
    ai_scenes: review.aiScenes,
    ai_settings: run?.settings ?? { ...LEGACY_AI_SETTINGS, catalog: review.catalog },
    note: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
    labeled_by: auth.email,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
