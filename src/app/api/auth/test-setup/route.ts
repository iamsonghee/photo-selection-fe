import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { IMPLEMENTED_SURVEY_TYPES, type SurveyType } from "@/lib/beta-survey";
import type { ProjectStatus } from "@/types";

// 테스트용 더미 이미지 URLs (공개 CDN, 실제 렌더링 가능)
const DUMMY_THUMB   = "https://picsum.photos/seed/e2e-thumb/400/400";
const DUMMY_PREVIEW = "https://picsum.photos/seed/e2e-prev/1200/900";

type Action =
  | "create_project"
  | "create_full_project"
  | "create_editing_project"
  | "delete_project"
  // 베타 설문(5단계, plan/beta-system.md §7) E2E용 — 실 워크플로우를 거치지 않고
  // 트리거/재노출 상태를 직접 조작하기 위한 액션. 진짜 배송 흐름을 재현하는 게 아니라
  // "이미 delivered인 첫 프로젝트가 있을 때" 상태만 필요하므로 이 방식이 안전하다.
  | "first_project_status"
  | "second_project_status"
  | "set_project_status"
  | "reset_beta_survey"
  | "backdate_survey_later"
  | "insert_project_log";

/** 테스트 전용 데이터 세팅 — ENABLE_TEST_LOGIN=true 일 때만 동작 */
export async function POST(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    action: Action;
    projectId?: string;
    photoCount?: number;
    status?: ProjectStatus;
    surveyType?: SurveyType;
    logAction?: string;
  };
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

  // ── 첫 생성 프로젝트의 id/status 조회(② 설문 트리거 확인용) ──────────────
  if (action === "first_project_status") {
    const { data } = await admin
      .from("projects")
      .select("id, status")
      .eq("photographer_id", photographer.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ ok: true, projectId: data?.id ?? null, status: data?.status ?? null });
  }

  // ── 생성 순서 기준 두 번째 프로젝트의 id/status 조회(③ 설문 트리거 확인용) ──
  // 두 번째 프로젝트가 아직 없으면(테스트 계정에 프로젝트가 1개뿐) 테스트용으로 하나 생성한다.
  if (action === "second_project_status") {
    const { data } = await admin
      .from("projects")
      .select("id, status")
      .eq("photographer_id", photographer.id)
      .order("created_at", { ascending: true })
      .range(1, 1);
    if (data && data.length > 0) {
      return NextResponse.json({ ok: true, projectId: data[0].id, status: data[0].status, created: false });
    }
    const project = await _createProject(admin, photographer.id, 3, "preparing");
    return NextResponse.json({ ok: true, projectId: project.id, status: "preparing", created: true });
  }

  // ── 프로젝트 status 직접 변경(테스트 후 원복 포함) ───────────────────────
  if (action === "set_project_status") {
    if (!body.projectId || !body.status) {
      return NextResponse.json({ error: "projectId, status required" }, { status: 400 });
    }
    const { error } = await admin
      .from("projects")
      .update({ status: body.status })
      .eq("id", body.projectId)
      .eq("photographer_id", photographer.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── beta_survey_responses 행 삭제(테스트 케이스 간 초기화) ───────────────
  if (action === "reset_beta_survey") {
    if (!body.surveyType || !IMPLEMENTED_SURVEY_TYPES.includes(body.surveyType)) {
      return NextResponse.json({ error: "invalid surveyType" }, { status: 400 });
    }
    await admin
      .from("beta_survey_responses")
      .delete()
      .eq("photographer_id", photographer.id)
      .eq("survey_type", body.surveyType);
    return NextResponse.json({ ok: true });
  }

  // ── project_logs에 이벤트 직접 삽입(마이크로 설문 트리거 테스트용) ────────
  // 실제 업로드/셀렉 확정 플로우를 거치지 않고 "uploaded"/"confirmed" 이벤트가
  // 있었던 것처럼 만들어 원본 업로드 후/셀렉 회신받았을 때 마이크로 설문을 검증한다.
  if (action === "insert_project_log") {
    if (!body.projectId || !body.logAction) {
      return NextResponse.json({ error: "projectId, logAction required" }, { status: 400 });
    }
    const { error } = await admin.from("project_logs").insert({
      project_id: body.projectId,
      photographer_id: photographer.id,
      action: body.logAction,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── "나중에" 24시간 쿨다운을 과거로 당겨 재노출 조건을 즉시 통과시킴 ──────
  if (action === "backdate_survey_later") {
    if (!body.surveyType || !IMPLEMENTED_SURVEY_TYPES.includes(body.surveyType)) {
      return NextResponse.json({ error: "invalid surveyType" }, { status: 400 });
    }
    const { error } = await admin
      .from("beta_survey_responses")
      .update({ later_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("photographer_id", photographer.id)
      .eq("survey_type", body.surveyType);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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
