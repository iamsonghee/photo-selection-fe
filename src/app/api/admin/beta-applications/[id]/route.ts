import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import type { BetaApplicationStatus } from "@/lib/admin-db";

const STATUSES: BetaApplicationStatus[] = ["applied", "reviewing", "on_hold", "approved", "rejected"];

/** PATCH /api/admin/beta-applications/[id] — 상태/관리자 메모/연락완료 변경 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status: nextStatus, admin_note: nextNote, contacted: nextContacted } = body ?? {};

  if (nextStatus !== undefined && !STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (nextContacted !== undefined && typeof nextContacted !== "boolean") {
    return NextResponse.json({ error: "invalid contacted" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nextStatus !== undefined) payload.status = nextStatus;
  if (nextNote !== undefined) payload.admin_note = nextNote || null;
  if (nextContacted !== undefined) payload.contacted = nextContacted;

  const admin = getAdminClient();
  const { error } = await admin.from("beta_applications").update(payload).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
