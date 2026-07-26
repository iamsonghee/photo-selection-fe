import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";

const STATUSES = ["new", "reviewing", "resolved"] as const;

/** PATCH /api/admin/feedback/[id] — 상태 변경 (신규 → 확인중 → 해결됨) */
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
  const status = body?.status;

  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { error } = await admin.from("feedback").update({ status }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status });
}
