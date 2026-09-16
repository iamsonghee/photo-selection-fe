import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: photographer } = await supabase.from("photographers").select("id").eq("auth_id", session.user.id).maybeSingle();
  const { data: project } = await admin.from("projects").select("photographer_id, status").eq("id", id).maybeSingle();
  if (!photographer || !project || project.photographer_id !== photographer.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (project.status !== "preparing") {
    return NextResponse.json({ error: "고객에게 셀렉을 요청하기 전까지만 추천을 수정할 수 있습니다." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const photoIds = Array.isArray(body.photo_ids)
    ? [...new Set(body.photo_ids.filter((value: unknown): value is string => typeof value === "string"))]
    : null;
  if (!photoIds) return NextResponse.json({ error: "photo_ids required" }, { status: 400 });
  if (photoIds.length > 0) {
    const { data: owned, error: ownedError } = await admin.from("photos").select("id").eq("project_id", id).in("id", photoIds);
    if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 });
    if ((owned ?? []).length !== photoIds.length) {
      return NextResponse.json({ error: "프로젝트에 속하지 않은 사진이 포함되어 있습니다." }, { status: 400 });
    }
  }

  const { data: updated, error } = await admin.rpc("replace_photographer_recommendations", {
    p_project_id: id,
    p_photographer_id: photographer.id,
    p_photo_ids: photoIds,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated });
}
