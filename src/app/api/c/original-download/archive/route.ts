import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getOriginalArchiveDownloadUrls } from "@/lib/customer-api-server";

/** GET /api/c/original-download/archive?token=X — 준비된 ZIP URL을 클릭 시점에 발급. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const pinErr = checkPinAuth(req, token);
  if (pinErr) return pinErr;

  try {
    const files = await getOriginalArchiveDownloadUrls(getAdminClient(), token);
    if (files === null) {
      return NextResponse.json({ error: "Original download unavailable" }, { status: 404 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "Archive is not ready or has expired" }, { status: 409 });
    }
    return NextResponse.json({ files }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[original-download/archive]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
