import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { extractR2Key } from "@/lib/r2-key-server";
import { callPresignApi } from "@/lib/presign-server";

/**
 * GET /api/c/presign-preview?token=X&photoId=Y
 *
 * 뷰어에서 고화질 preview 이미지 1장의 presigned URL을 가져옵니다.
 * 응답: { url: string, expiresAt: number }
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const pinErr = checkPinAuth(req, token);
  if (pinErr) return pinErr;

  const photoId = req.nextUrl.searchParams.get("photoId");
  if (!photoId?.trim()) {
    return NextResponse.json({ error: "photoId required" }, { status: 400 });
  }

  try {
    const admin = getAdminClient();

    // token → project 확인
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("access_token", token)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    // photo 조회 (이 프로젝트 소속인지 검증 포함)
    const { data: photo, error } = await admin
      .from("photos")
      .select("id, r2_preview_url")
      .eq("id", photoId)
      .eq("project_id", project.id)
      .single();

    if (error || !photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    type PhotoRow = { id: string; r2_preview_url: string | null };
    const row = photo as PhotoRow;

    if (!row.r2_preview_url) {
      return NextResponse.json({ error: "No preview URL" }, { status: 404 });
    }

    let key: string;
    try {
      key = extractR2Key(row.r2_preview_url);
    } catch (e) {
      console.error("[presign-preview] extractR2Key failed", e);
      return NextResponse.json({ error: "Invalid R2 URL" }, { status: 500 });
    }

    const { urls, expiresAt } = await callPresignApi([key]);
    const url = urls[key];

    if (!url) {
      return NextResponse.json({ error: "Presign failed" }, { status: 500 });
    }

    return NextResponse.json({ url, expiresAt });
  } catch (e) {
    console.error("[presign-preview]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
