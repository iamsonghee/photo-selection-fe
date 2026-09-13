import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

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

/**
 * DELETE /api/photographer/photos/[photoId]/group — "묶음에서 제외".
 * 사진 자체는 지우지 않고 유사컷 그룹 소속만 해제한다(remove_photo_from_group RPC).
 * delete_photo_and_resolve_group과 달리 clip-service의 sync-groups는 호출하지 않는다 —
 * 임베딩 기반 재계산이 방금 작가가 명시적으로 제외한 사진을 다시 합쳐버릴 수 있기 때문이다.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;
  if (!photoId) return NextResponse.json({ error: "Missing photoId" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: photo, error: photoErr } = await admin
      .from("photos")
      .select("id, project_id")
      .eq("id", photoId)
      .single();
    if (photoErr || !photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

    const projectId = (photo as { project_id: string }).project_id;
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, status")
      .eq("id", projectId)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const status = (project as { status: string }).status;
    if (status !== "preparing" && status !== "selecting") {
      return NextResponse.json(
        { error: "preparing/selecting 상태에서만 그룹에서 제외할 수 있습니다." },
        { status: 403 }
      );
    }

    const { data: groupResult, error: rpcErr } = await admin.rpc("remove_photo_from_group", {
      p_photo_id: photoId,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    return NextResponse.json({ photoId, group: groupResult ?? null });
  } catch (e) {
    console.error("[DELETE photo group]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
