import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 공유 링크를 관리할 수 있습니다." }, { status: 403 });

  const { action } = await req.json().catch(() => ({})) as { action?: "disable" | "rotate" };
  if (action === "disable") {
    const { error } = await admin.from("customer_projects").update({ sharing_enabled: false }).eq("id", id).eq("owner_id", access.project.owner_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sharingEnabled: false, shareToken: access.project.share_token });
  }
  if (action === "rotate") {
    const shareToken = randomBytes(18).toString("hex");
    const { error } = await admin.from("customer_projects").update({ share_token: shareToken, sharing_enabled: true }).eq("id", id).eq("owner_id", access.project.owner_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sharingEnabled: true, shareToken });
  }
  return NextResponse.json({ error: "지원하지 않는 공유 링크 작업입니다." }, { status: 400 });
}
