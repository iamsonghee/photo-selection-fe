import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";

// 테스트용 더미 이미지 URLs (공개 CDN, 실제 렌더링 가능)
const DUMMY_THUMB   = "https://picsum.photos/seed/e2e-thumb/400/400";
const DUMMY_PREVIEW = "https://picsum.photos/seed/e2e-prev/1200/900";

type Action = "create_project" | "create_full_project" | "create_editing_project" | "delete_project";

/** 테스트 전용 데이터 세팅 — ENABLE_TEST_LOGIN=true 일 때만 동작 */
export async function POST(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as { action: Action; projectId?: string; photoCount?: number };
  const { action } = body;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: photographer } = await admin
    .from("photographers").select("id").eq("auth_id", user.id).single();
  if (!photographer) return NextResponse.json({ error: "Photographer not found" }, { status: 404 });

  // ── 기본 프로젝트 생성 (preparing, 사진 없음) ──────────────────────────
  if (action === "create_project") {
    const project = await _createProject(admin, photographer.id, 5, "preparing");
    return NextResponse.json({ ok: true, projectId: project.id, accessToken: project.access_token });
  }

  // ── 완전한 고객용 프로젝트 (사진 삽입 + selecting 상태) ──────────────────
  if (action === "create_full_project") {
    const photoCount = body.photoCount ?? 5;
    const requiredCount = Math.min(3, photoCount);

    // 1. 프로젝트 생성
    const project = await _createProject(admin, photographer.id, requiredCount, "preparing");

    // 2. 더미 사진 레코드 삽입
    const photos = Array.from({ length: photoCount }, (_, i) => ({
      project_id: project.id,
      number: i + 1,
      r2_thumb_url:   `${DUMMY_THUMB}?n=${i}`,
      r2_preview_url: `${DUMMY_PREVIEW}?n=${i}`,
      original_filename: `E2E_TEST_${String(i + 1).padStart(3, "0")}.jpg`,
      file_size: 12345,
    }));
    await admin.from("photos").insert(photos);

    // 3. photo_count 업데이트 + 상태 선택 단계로 전환
    await admin.from("projects").update({
      photo_count: photoCount,
      status: "selecting",
    }).eq("id", project.id);

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      accessToken: project.access_token,
      photoCount,
      requiredCount,
    });
  }

  // ── editing 상태 프로젝트 (보정본 업로드 테스트용) ──────────────────────
  if (action === "create_editing_project") {
    const photoCount = body.photoCount ?? 5;
    const requiredCount = Math.min(3, photoCount);

    const project = await _createProject(admin, photographer.id, requiredCount, "preparing");

    const photos = Array.from({ length: photoCount }, (_, i) => ({
      project_id: project.id,
      number: i + 1,
      r2_thumb_url:   `${DUMMY_THUMB}?n=${i}`,
      r2_preview_url: `${DUMMY_PREVIEW}?n=${i}`,
      original_filename: `E2E_TEST_${String(i + 1).padStart(3, "0")}.jpg`,
      file_size: 12345,
    }));
    const { data: insertedPhotos } = await admin.from("photos").insert(photos).select("id");

    // 고객 선택 더미 삽입 (requiredCount 장)
    if (insertedPhotos && insertedPhotos.length > 0) {
      const selections = insertedPhotos.slice(0, requiredCount).map((p: { id: string }) => ({
        project_id: project.id,
        photo_id: p.id,
      }));
      await admin.from("selections").insert(selections);
    }

    // photo_count + status → editing (보정 진행 중)
    await admin.from("projects").update({
      photo_count: photoCount,
      status: "editing",
    }).eq("id", project.id);

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      accessToken: project.access_token,
      photoCount,
      requiredCount,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { projectId } = await req.json() as { projectId: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: photographer } = await admin
    .from("photographers").select("id").eq("auth_id", user.id).single();
  if (!photographer) return NextResponse.json({ error: "Photographer not found" }, { status: 404 });

  await admin.from("selections").delete().eq("project_id", projectId);
  await admin.from("photos").delete().eq("project_id", projectId);
  await admin.from("projects").delete().eq("id", projectId).eq("photographer_id", photographer.id);

  return NextResponse.json({ ok: true });
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────
async function _createProject(
  admin: ReturnType<typeof getAdminClient>,
  photographerId: string,
  requiredCount: number,
  status: string,
) {
  const today = new Date();
  const deadline = new Date(today);
  deadline.setDate(deadline.getDate() + 30);

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      photographer_id: photographerId,
      name: `[E2E] 테스트 프로젝트 ${Date.now()}`,
      customer_name: "E2E 테스트 고객",
      shoot_date: today.toISOString().slice(0, 10),
      deadline: deadline.toISOString().slice(0, 10),
      required_count: requiredCount,
      photo_count: 0,
      status,
    })
    .select("id, access_token")
    .single();

  if (error || !project) throw new Error(error?.message ?? "Project creation failed");
  return project;
}
