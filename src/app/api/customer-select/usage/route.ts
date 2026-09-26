import { NextResponse } from "next/server";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_PHOTO_LIMIT } from "@/app/customer-select/_lib/upload-limit";

export async function GET() {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await getAdminClient()
    .from("customer_projects")
    .select("photo_count")
    .eq("owner_id", ownerId);
  if (error) return NextResponse.json({ error: "사진 이용량을 불러오지 못했습니다." }, { status: 500 });

  const photoCount = (data ?? []).reduce((sum, project) => sum + Math.max(0, project.photo_count ?? 0), 0);
  return NextResponse.json({
    photoCount,
    limit: CUSTOMER_PHOTO_LIMIT,
    remaining: Math.max(0, CUSTOMER_PHOTO_LIMIT - photoCount),
  }, { headers: { "Cache-Control": "no-store" } });
}
