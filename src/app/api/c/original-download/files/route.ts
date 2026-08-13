import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getOriginalFileDownloadUrls } from "@/lib/customer-api-server";

/** POST /api/c/original-download/files?token=X — 선택한 개별 원본 URL만 온디맨드 발급. */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const pinErr = checkPinAuth(req, token);
  if (pinErr) return pinErr;

  try {
    const body = await req.json().catch(() => ({}));
    const photoIds = Array.isArray(body?.photoIds) ? body.photoIds : [];
    if (photoIds.length === 0 || photoIds.length > 3000 || photoIds.some((id: unknown) => typeof id !== "string")) {
      return NextResponse.json({ error: "photoIds must contain 1 to 3000 ids" }, { status: 400 });
    }

    const files = await getOriginalFileDownloadUrls(getAdminClient(), token, photoIds);
    if (files === null) {
      return NextResponse.json({ error: "Original download unavailable" }, { status: 404 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "Files are unavailable or have expired" }, { status: 409 });
    }
    return NextResponse.json({ files });
  } catch (e) {
    console.error("[original-download/files]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
