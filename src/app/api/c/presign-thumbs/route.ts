import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { extractR2Key } from "@/lib/r2-key-server";
import { callPresignApi } from "@/lib/presign-server";

const MAX_BATCH = 200;

/**
 * GET /api/c/presign-thumbs?token=X&photoIds=id1,id2,...
 *
 * PIN 인증된 고객이 갤러리 썸네일 presigned URL을 배치로 가져옵니다.
 * 응답: { presignedUrls: { [photoId]: { url: string, expiresAt: number } } }
 * R2 key는 응답에 포함하지 않습니다.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const pinErr = checkPinAuth(req, token);
  if (pinErr) return pinErr;

  const photoIdsParam = req.nextUrl.searchParams.get("photoIds");
  if (!photoIdsParam?.trim()) {
    return NextResponse.json({ error: "photoIds required" }, { status: 400 });
  }

  const photoIds = [...new Set(
    photoIdsParam.split(",").map((id) => id.trim()).filter(Boolean)
  )];

  if (photoIds.length === 0) {
    return NextResponse.json({ presignedUrls: {} });
  }
  if (photoIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_BATCH} photoIds per request` },
      { status: 400 }
    );
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

    // photo_id → r2_thumb_url 조회 (이 프로젝트 소속만)
    const { data: photos, error } = await admin
      .from("photos")
      .select("id, r2_thumb_url")
      .eq("project_id", project.id)
      .in("id", photoIds);

    if (error) {
      console.error("[presign-thumbs] DB error", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    type PhotoRow = { id: string; r2_thumb_url: string | null };
    const rows = (photos ?? []) as PhotoRow[];

    // R2 key 추출
    const keyByPhotoId: Record<string, string> = {};
    for (const row of rows) {
      if (!row.r2_thumb_url) continue;
      try {
        keyByPhotoId[row.id] = extractR2Key(row.r2_thumb_url);
      } catch (e) {
        console.warn("[presign-thumbs] extractR2Key failed for", row.id, e);
      }
    }

    const keys = Object.values(keyByPhotoId);
    if (keys.length === 0) {
      return NextResponse.json({ presignedUrls: {} });
    }

    // FastAPI presign 호출
    const { urls, expiresAt } = await callPresignApi(keys);

    // key → photoId 역매핑하여 응답 구성 (key는 클라이언트에 노출하지 않음)
    const keyToPhotoId: Record<string, string> = {};
    for (const [photoId, key] of Object.entries(keyByPhotoId)) {
      keyToPhotoId[key] = photoId;
    }

    const presignedUrls: Record<string, { url: string; expiresAt: number }> = {};
    for (const [key, url] of Object.entries(urls)) {
      const photoId = keyToPhotoId[key];
      if (photoId) {
        presignedUrls[photoId] = { url, expiresAt };
      }
    }

    return NextResponse.json({ presignedUrls });
  } catch (e) {
    console.error("[presign-thumbs]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
