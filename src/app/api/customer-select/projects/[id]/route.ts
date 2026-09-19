import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { buildProjectView, resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

export const dynamic = "force-dynamic";

/** GET: 프로젝트 전체 상태(사진·셀렉·참가자) 조회 — 소유자 또는 공유 링크 참가자. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req));
  if (access instanceof NextResponse) return access;
  const { project } = access;

  const [photosRes, selectionsRes, participantsRes] = await Promise.all([
    admin.from("customer_photos").select("id, filename, order_index, thumb_url, preview_url").eq("project_id", id),
    admin.from("customer_selections").select("photo_id, rating, color_tags, comment, is_selected").eq("project_id", id),
    admin.from("customer_project_participants").select("color, nickname, done").eq("project_id", id),
  ]);
  if (photosRes.error || selectionsRes.error || participantsRes.error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  return NextResponse.json(
    {
      project: buildProjectView(project, photosRes.data ?? [], selectionsRes.data ?? [], participantsRes.data ?? []),
      isOwner: access.isOwner,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** PATCH: exported 플래그만 갱신 (소유자·참가자 모두 "전달 완료로 표시" 가능). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req));
  if (access instanceof NextResponse) return access;

  const body = await req.json().catch(() => ({}));
  if (typeof body.exported !== "boolean") {
    return NextResponse.json({ error: "exported(boolean) 필드가 필요합니다." }, { status: 400 });
  }
  const { error } = await admin.from("customer_projects").update({ exported: body.exported }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
