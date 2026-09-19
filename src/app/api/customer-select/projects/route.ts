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
  const shootDate = optionalDate(body.shootDate);
  const selectionDeadline = optionalDate(body.selectionDeadline);
  const studioName = typeof body.studioName === "string" ? body.studioName.trim() || null : null;
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "프로젝트 이름을 확인해주세요." }, { status: 400 });
  }
  if (shootDate === undefined || selectionDeadline === undefined || (studioName?.length ?? 0) > 100) {
    return NextResponse.json({ error: "일정 또는 작가·스튜디오명을 확인해주세요." }, { status: 400 });
  }
  if (shootDate && selectionDeadline && selectionDeadline < shootDate) {
    return NextResponse.json({ error: "셀렉 마감일은 촬영일 이후로 설정해주세요." }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("customer_projects")
    .insert({ owner_id: authId, name, shoot_type: shootType, target_count: target, shoot_date: shootDate, selection_deadline: selectionDeadline, studio_name: studioName })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "생성 실패" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}
