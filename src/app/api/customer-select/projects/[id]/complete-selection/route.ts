import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

/** Selection completion only; neither locks selections nor claims external delivery. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 셀렉을 완료할 수 있어요." }, { status: 403 });
  const { count, error: selectionError } = await admin.from("customer_selections")
    .select("photo_id", { count: "exact", head: true }).eq("project_id", id).eq("is_selected", true);
  if (selectionError) return NextResponse.json({ error: "선택한 사진을 확인하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  if (!count) return NextResponse.json({ error: "사진을 한 장 이상 골라 주세요." }, { status: 400 });
  const completedAt = access.project.selection_completed_at ?? new Date().toISOString();
  const { error } = await admin.from("customer_projects")
    .update({ selection_completed_at: completedAt }).eq("id", id).eq("owner_id", access.project.owner_id);
  if (error) return NextResponse.json({ error: "셀렉 완료 상태를 저장하지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  return NextResponse.json({ selectionCompletedAt: completedAt });
}
