import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { customerPhotoLimit, getCurrentCustomerAuthUser } from "@/lib/customer-select-server";

export async function GET() {
  const user = await getCurrentCustomerAuthUser();
  const ownerId = user?.id;
  if (!ownerId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await getAdminClient()
    .from("customer_projects")
    .select("photo_count")
    .eq("owner_id", ownerId);
  if (error) return NextResponse.json({ error: "사진 이용량을 불러오지 못했습니다." }, { status: 500 });

  const photoCount = (data ?? []).reduce((sum, project) => sum + Math.max(0, project.photo_count ?? 0), 0);
  const limit = customerPhotoLimit(user.email);
  return NextResponse.json({
    photoCount,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - photoCount),
  }, { headers: { "Cache-Control": "no-store" } });
}
