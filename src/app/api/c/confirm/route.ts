import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id, selected_photo_ids } = body;
    if (!token || !project_id) {
      return NextResponse.json(
        { error: "token, project_id required" },
        { status: 400 }
      );
    }
    const auth = await getPinAuthorizedProject(req, token);
    if (auth.error) return auth.error;
    const project = auth.project;
    if (!project || project.id !== project_id) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    if (project.status !== "selecting") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }

    // UI 기준 선택 목록 검증
    if (!Array.isArray(selected_photo_ids) || selected_photo_ids.length !== project.requiredCount) {
      return NextResponse.json(
        {
          error: `선택 갯수가 맞지 않습니다. (전송: ${Array.isArray(selected_photo_ids) ? selected_photo_ids.length : 0}장, 필요: ${project.requiredCount}장)`,
        },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    const uniquePhotoIds = [...new Set(selected_photo_ids as string[])];
    if (uniquePhotoIds.length !== selected_photo_ids.length) {
      return NextResponse.json({ error: "선택 목록에 중복된 사진이 있습니다." }, { status: 400 });
    }
    const { data: ownedPhotos, error: ownedPhotosError } = await admin
      .from("photos")
      .select("id")
      .eq("project_id", project_id)
      .in("id", uniquePhotoIds);
    if (ownedPhotosError) throw new Error(ownedPhotosError.message);
    if ((ownedPhotos ?? []).length !== uniquePhotoIds.length) {
      return NextResponse.json({ error: "프로젝트에 속하지 않은 사진이 포함되어 있습니다." }, { status: 400 });
    }

    const { data: result, error: confirmError } = await admin.rpc("confirm_customer_selection", {
      p_project_id: project_id,
      p_photo_ids: uniquePhotoIds,
    });
    if (confirmError) throw new Error(confirmError.message);
    if (result !== "saved") return NextResponse.json({ error: "프로젝트 상태나 선택 장수가 바뀌었어요. 새로 확인해 주세요." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
