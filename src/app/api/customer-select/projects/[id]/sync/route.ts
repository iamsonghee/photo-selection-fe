import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { buildCustomerCollaborationState, resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;

  const [selections, participants, opinions] = await Promise.all([
    admin.from("customer_selections").select("photo_id, rating, color_tags, comment, is_selected").eq("project_id", id),
    admin.from("customer_project_participants").select("color, nickname, done").eq("project_id", id),
    admin.from("customer_participant_opinions").select("photo_id, participant_color, rating, comment").eq("project_id", id),
  ]);
  if (selections.error || participants.error || opinions.error) {
    return NextResponse.json({ error: "동기화 상태를 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({
    ...buildCustomerCollaborationState(selections.data ?? [], participants.data ?? [], opinions.data ?? []),
    exported: access.project.exported,
    deliveryCount: access.project.delivery_count,
    lastDeliveredAt: access.project.last_delivered_at,
  }, { headers: { "Cache-Control": "no-store" } });
}
