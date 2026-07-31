import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { getOriginalDownloadInfo } from "@/lib/customer-api-server";

/**
 * GET /api/c/original-download?token=X
 *
 * 납품용 원본 다운로드 정보(파일 수/총 용량/만료일/다운로드 URL) 조회.
 * include_original=false이거나 아카이브가 준비되지 않은 프로젝트는 visible=false를 반환해
 * 고객 화면에서 다운로드 진입점 자체를 숨기도록 한다. 30일 만료 후에는 presign을 수행하지
 * 않고 파일 수/총 용량만 반환한다(다운로드 불가 안내용).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const pinErr = checkPinAuth(req, token);
  if (pinErr) return pinErr;

  try {
    const admin = getAdminClient();
    const info = await getOriginalDownloadInfo(admin, token);
    if (!info) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    return NextResponse.json(info);
  } catch (e) {
    console.error("[original-download]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
