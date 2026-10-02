import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";
import { extractR2Key } from "@/lib/r2-key-server";
import { callPresignApi } from "@/lib/presign-server";

const MAX_BATCH = 5;

/**
 * GET /api/c/presign-preview?token=X&photoIds=id1,id2,...
 *
 * 뷰어에서 현재 사진과 인접한 고화질 preview URL을 한 번에 발급합니다.
 * 응답: { presignedUrls: { [photoId]: { url: string, expiresAt: number } } }
 * 기존 photoId 단건 요청과 { url, expiresAt } 응답도 하위 호환으로 유지합니다.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  if (!auth.project) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  // 초대 첫 화면은 전체 사진 목록보다 먼저 대표 사진을 요청한다.
  if (req.nextUrl.searchParams.get("cover") === "1") {
    try {
      const admin = getAdminClient();
      const coverId = auth.project.coverPhotoId;
      const cover = coverId ? await admin.from("photos").select("r2_preview_url").eq("project_id", auth.project.id).eq("id", coverId).maybeSingle() : null;
      if (cover?.error) throw cover.error;
      let previewUrl = cover?.data?.r2_preview_url;
      if (!previewUrl) {
        const first = await admin.from("photos").select("r2_preview_url").eq("project_id", auth.project.id).order("number").limit(1).maybeSingle();
        if (first.error) throw first.error;
        previewUrl = first.data?.r2_preview_url;
      }
      if (!previewUrl) return NextResponse.json({ error: "No preview URL" }, { status: 404 });
      const key = extractR2Key(previewUrl);
      const { urls } = await callPresignApi([key]);
      return NextResponse.json({ url: urls[key] ?? null });
    } catch (e) {
      console.error("[presign-preview cover]", e);
      return NextResponse.json({ error: "Presign failed" }, { status: 500 });
    }
  }

  const singlePhotoId = req.nextUrl.searchParams.get("photoId")?.trim() ?? "";
  const photoIdsParam = req.nextUrl.searchParams.get("photoIds")?.trim() ?? "";
  const photoIds = [...new Set(
    (photoIdsParam || singlePhotoId)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )];
  if (photoIds.length === 0) {
    return NextResponse.json({ error: "photoId or photoIds required" }, { status: 400 });
  }
  if (photoIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_BATCH} photoIds per request` },
      { status: 400 }
    );
  }

  try {
    const admin = getAdminClient();

    // photo 조회 (이 프로젝트 소속인지 검증 포함)
    const { data: photos, error } = await admin
      .from("photos")
      .select("id, r2_preview_url")
      .eq("project_id", auth.project.id)
      .in("id", photoIds);

    if (error) {
      console.error("[presign-preview] DB error", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (singlePhotoId && (!photos || photos.length === 0)) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    type PhotoRow = { id: string; r2_preview_url: string | null };
    const keyByPhotoId: Record<string, string> = {};
    for (const row of (photos ?? []) as PhotoRow[]) {
      if (!row.r2_preview_url) continue;
      try {
        keyByPhotoId[row.id] = extractR2Key(row.r2_preview_url);
      } catch (e) {
        console.warn("[presign-preview] extractR2Key failed for", row.id, e);
      }
    }

    const keys = [...new Set(Object.values(keyByPhotoId))];
    if (keys.length === 0) {
      if (singlePhotoId) {
        return NextResponse.json({ error: "No preview URL" }, { status: 404 });
      }
      return NextResponse.json({ presignedUrls: {} });
    }

    const { urls, expiresAt } = await callPresignApi(keys);
    const presignedUrls: Record<string, { url: string; expiresAt: number }> = {};
    for (const [photoId, key] of Object.entries(keyByPhotoId)) {
      const url = urls[key];
      if (url) presignedUrls[photoId] = { url, expiresAt };
    }

    if (singlePhotoId && !photoIdsParam) {
      const single = presignedUrls[singlePhotoId];
      if (!single) return NextResponse.json({ error: "Presign failed" }, { status: 500 });
      return NextResponse.json(single);
    }
    return NextResponse.json({ presignedUrls });
  } catch (e) {
    console.error("[presign-preview]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
