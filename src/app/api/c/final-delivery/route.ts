import { NextRequest, NextResponse } from "next/server";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getFinalDeliveryDownloadInfo } from "@/lib/customer-api-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) return NextResponse.json({ error: "token required" }, { status: 400 });
  const pinError = checkPinAuth(req, token);
  if (pinError) return pinError;
  try {
    const info = await getFinalDeliveryDownloadInfo(getAdminClient(), token);
    if (!info) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    return NextResponse.json(info, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[final-delivery]", error);
    return NextResponse.json({ error: "최종 보정본 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}
