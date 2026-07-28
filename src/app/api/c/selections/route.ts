import { NextRequest, NextResponse } from "next/server";
import {
  validateTokenAndProject,
  upsertSelectionAdmin,
  getSelectionsOnlyAdmin,
} from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id, photo_id, rating, color_tag, comment, is_selected } = body;
    if (!token || !project_id || !photo_id) {
      return NextResponse.json(
        { error: "token, project_id, photo_id required" },
        { status: 400 }
      );
    }
    const pinErr = checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    if (project.status !== "selecting" && project.status !== "preparing") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }
    const admin = getAdminClient();
    // rating/color_tag/comment는 body에 키 자체가 없으면 undefined로 들어와
    // upsertSelectionAdmin이 해당 필드를 건드리지 않는다 — 필드 하나만 바뀌어도
    // 로컬에 캐시된 다른 필드 값 전체를 재전송하던 과거 방식이 다른 세션의
    // 변경사항을 덮어쓰는 문제가 있어, 실제로 바뀐 필드만 보내는 것을 전제로 한다.
    await upsertSelectionAdmin(admin, {
      project_id,
      photo_id,
      rating,
      color_tag,
      comment,
      is_selected: typeof is_selected === "boolean" ? is_selected : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/selections POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** 폴링용 경량 조회 — selections만 반환(사진/그룹은 GET /api/c/photos에서 별도 조회). */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!token?.trim() || !projectId?.trim()) {
      return NextResponse.json(
        { error: "token, project_id required" },
        { status: 400 }
      );
    }
    const pinErr = checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, projectId);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    const admin = getAdminClient();
    const { selectedIds, photoStates } = await getSelectionsOnlyAdmin(admin, projectId);
    return NextResponse.json({
      selectedIds: Array.from(selectedIds),
      photoStates,
    });
  } catch (e) {
    console.error("[api/c/selections GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
