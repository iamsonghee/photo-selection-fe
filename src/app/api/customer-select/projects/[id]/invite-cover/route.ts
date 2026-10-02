import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

export const dynamic = "force-dynamic";

/** 초대 화면의 대표 사진만 조회해 전체 프로젝트 조회와 이미지 전송을 겹친다. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;

  const { data: scenes, error: scenesError } = await admin.from("customer_scenes")
    .select("id").eq("project_id", id).order("scene_index");
  if (scenesError) return NextResponse.json({ error: "조회 실패" }, { status: 500 });

  for (const scene of scenes ?? []) {
    const { count, error } = await admin.from("customer_photos")
      .select("id", { count: "exact", head: true }).eq("project_id", id).eq("scene_id", scene.id);
    if (error) return NextResponse.json({ error: "조회 실패" }, { status: 500 });
    if (!count) continue;
    const { data: cover, error: coverError } = await admin.from("customer_photos")
      .select("preview_url, thumb_url").eq("project_id", id).eq("scene_id", scene.id)
      .order("taken_at", { nullsFirst: false }).order("order_index")
      .range(Math.floor(count / 2), Math.floor(count / 2)).maybeSingle();
    if (coverError) return NextResponse.json({ error: "조회 실패" }, { status: 500 });
    return NextResponse.json({ url: cover?.preview_url || cover?.thumb_url || null }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: first, error } = await admin.from("customer_photos")
    .select("preview_url, thumb_url").eq("project_id", id).order("order_index").limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  return NextResponse.json({ url: first?.preview_url || first?.thumb_url || null }, { headers: { "Cache-Control": "no-store" } });
}
