import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";

/** PATCH /api/admin/projects/[id]/pin — 관리자 전용 PIN 재설정/제거 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const accessPin = body?.access_pin;

  if (accessPin !== null && !(typeof accessPin === "string" && /^\d{4}$/.test(accessPin))) {
    return NextResponse.json({ error: "PIN은 4자리 숫자이거나 null이어야 합니다." }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from("projects")
    .update({ access_pin: accessPin, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ access_pin: accessPin });
}
