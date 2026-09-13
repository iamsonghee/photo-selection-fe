import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getOriginalDownloadInfo } from "@/lib/customer-api-server";

/**
 * GET /api/c/original-download?token=X
 *
 * 납품용 원본 다운로드 상태(파일 수/총 용량/만료일/ZIP 상태) 조회.
 * 폴링 경로이므로 R2 presigned URL은 발급하지 않는다. URL은 실제 다운로드 시
 * /archive 또는 /files 하위 API에서 온디맨드로 발급한다.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const pinErr = await checkPinAuth(req, token);
  if (pinErr) return pinErr;

  try {
    const admin = getAdminClient();
    const info = await getOriginalDownloadInfo(admin, token);
    if (!info) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    return NextResponse.json(info, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[original-download]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
