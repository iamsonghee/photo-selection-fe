import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";

const FIELDS = [
  "general_max_projects",
  "general_max_photos_per_project",
  "beta_max_projects_total",
  "beta_max_photos_per_project",
  "beta_max_revision_count",
  "beta_default_duration_days",
] as const;

/** PATCH /api/admin/settings — 관리자 전용, 이용 한도 값을 즉시 반영되도록 갱신 */
export async function PATCH(req: NextRequest) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, number> = {};
  for (const field of FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return NextResponse.json({ error: `${field}는 1 이상의 정수여야 합니다.` }, { status: 400 });
    }
    update[field] = value;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .update({ ...update, updated_at: new Date().toISOString(), updated_by: auth.email })
    .eq("id", 1)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "저장 실패" }, { status: 500 });
  }

  return NextResponse.json(data);
}
