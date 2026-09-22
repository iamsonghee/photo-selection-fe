import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { isProjectShootType } from "@/lib/project-shoot-types";

/** POST: 새 고객 셀렉 프로젝트 생성. 로그인한 소유자만 가능. */
export async function POST(req: NextRequest) {
  const authId = await getCurrentCustomerAuthId();
  if (!authId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const shootType = isProjectShootType(body.shootType) ? body.shootType : null;
  const target = Number.isFinite(body.target) && body.target > 0 ? Math.floor(body.target) : 30;
  const shootDate = optionalDate(body.shootDate);
  const selectionDeadline = optionalDate(body.selectionDeadline);
  const studioName = typeof body.studioName === "string" ? body.studioName.trim() || null : null;
  const photographerName = optionalText(body.photographerName, 100);
  const shootRegion = optionalText(body.shootRegion, 100);
  const shootLocation = optionalText(body.shootLocation, 150);
  if (!name || name.length > 60 || !shootType) {
    return NextResponse.json({ error: "프로젝트 이름과 촬영 종류를 확인해주세요." }, { status: 400 });
  }
  if (shootDate === undefined || selectionDeadline === undefined || (studioName?.length ?? 0) > 100 || photographerName === undefined || shootRegion === undefined || shootLocation === undefined) {
    return NextResponse.json({ error: "촬영 정보를 확인해주세요." }, { status: 400 });
  }
  if (shootDate && selectionDeadline && selectionDeadline < shootDate) {
    return NextResponse.json({ error: "셀렉 마감일은 촬영일 이후로 설정해주세요." }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("customer_projects")
    .insert({ owner_id: authId, name, shoot_type: shootType, target_count: target, shoot_date: shootDate, selection_deadline: selectionDeadline, studio_name: studioName, photographer_name: photographerName, shoot_region: shootRegion, shoot_location: shootLocation })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "생성 실패" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length <= maxLength ? text || null : undefined;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}
