import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";

/** POST: 새 고객 셀렉 프로젝트 생성. 로그인한 소유자만 가능. */
export async function POST(req: NextRequest) {
  const authId = await getCurrentCustomerAuthId();
  if (!authId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const shootType = typeof body.shootType === "string" ? body.shootType : null;
  const target = Number.isFinite(body.target) && body.target > 0 ? Math.floor(body.target) : 30;
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "프로젝트 이름을 확인해주세요." }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("customer_projects")
    .insert({ owner_id: authId, name, shoot_type: shootType, target_count: target })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "생성 실패" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
