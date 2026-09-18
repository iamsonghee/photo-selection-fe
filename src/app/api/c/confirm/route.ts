import { NextRequest, NextResponse } from "next/server";
import { confirmProjectAdmin } from "@/lib/customer-api-server";
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

    // in-flight DELETE race condition 방지:
    // DB에 남아 있는 항목 중 UI 확정 목록에 없는 것만 제거 (별점·태그·코멘트 보존)
    const { data: existing } = await admin
      .from("selections")
      .select("photo_id")
      .eq("project_id", project_id);

    const confirmedSet = new Set<string>(selected_photo_ids);
    const toDelete = (existing ?? [])
      .map((r: { photo_id: string }) => r.photo_id)
      .filter((id: string) => !confirmedSet.has(id));

    if (toDelete.length > 0) {
      await admin.from("selections").delete().eq("project_id", project_id).in("photo_id", toDelete);
    }

    const { error: selectionError } = await admin.from("selections").upsert(
      uniquePhotoIds.map((photoId) => ({ project_id, photo_id: photoId, is_selected: true })),
      { onConflict: "project_id,photo_id" },
    );
    if (selectionError) throw new Error(selectionError.message);

    await confirmProjectAdmin(admin, project_id);
    await admin.from("project_logs").insert({
      project_id,
      photographer_id: project.photographerId,
      action: "confirmed",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
