import { NextRequest, NextResponse } from "next/server";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getFinalDeliveryArchiveDownloadUrls } from "@/lib/customer-api-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) return NextResponse.json({ error: "token required" }, { status: 400 });
  const pinError = checkPinAuth(req, token);
  if (pinError) return pinError;
  try {
    const files = await getFinalDeliveryArchiveDownloadUrls(getAdminClient(), token);
    if (files === null) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (files.length === 0) return NextResponse.json({ error: "Archive is not ready or has expired" }, { status: 409 });
    return NextResponse.json({ files }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[final-delivery/archive]", error);
    return NextResponse.json({ error: "최종 보정본 다운로드를 준비하지 못했습니다." }, { status: 500 });
  }
}
