import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getProjectByToken } from "@/lib/customer-api-server";

export type ReviewResultPhoto = {
  photoId: string;
  originalFilename: string | null;
  thumbUrl: string | null;
  reviewStatus: "approved" | "revision_requested" | null;
  customerComment: string | null;
  orderIndex: number;
};

/**
 * GET /api/c/review-result?token=
 * editing_v2 / reviewing_v2 / delivered 상태에서 v1 검토 결과를 반환.
 * 확정된 장 / 재보정 요청된 장 + 코멘트 포함.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const admin = getAdminClient();
    const project = await getProjectByToken(admin, token);
    if (!project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    // v1 검토 결과가 존재하는 상태에서만 반환
    const reviewableStatuses = ["editing_v2", "reviewing_v2", "delivered"];
    if (!reviewableStatuses.includes(project.status)) {
      return NextResponse.json({ photos: [] });
    }

    // 셀렉된 photo_id 목록
    const { data: selections } = await admin
      .from("selections")
      .select("photo_id")
      .eq("project_id", project.id);
    const photoIds = (selections ?? []).map((s: { photo_id: string }) => s.photo_id);
    if (!photoIds.length) return NextResponse.json({ photos: [] });

    // 사진 기본 정보
    const { data: photosRows } = await admin
      .from("photos")
      .select("id, number, r2_thumb_url, original_filename")
      .in("id", photoIds)
      .order("number", { ascending: true });

    // v1 photo_versions
    const { data: pvRows } = await admin
      .from("photo_versions")
      .select("id, photo_id")
      .in("photo_id", photoIds)
      .eq("version", 1);
    const pvByPhotoId = new Map(
      (pvRows ?? []).map((r: { id: string; photo_id: string }) => [r.photo_id, r.id])
    );
    const pvIds = (pvRows ?? []).map((r: { id: string }) => r.id);

    // v1 version_reviews
    const { data: reviewRows } = await admin
      .from("version_reviews")
      .select("photo_version_id, status, customer_comment")
      .in("photo_version_id", pvIds);
    const reviewByPvId = new Map(
      (reviewRows ?? []).map((r: { photo_version_id: string; status: string; customer_comment: string | null }) => [
        r.photo_version_id,
        { status: r.status as "approved" | "revision_requested", customerComment: r.customer_comment },
      ])
    );

    const photos: ReviewResultPhoto[] = (photosRows ?? []).map((row: {
      id: string; number: number; r2_thumb_url: string; original_filename: string | null;
    }) => {
      const pvId = pvByPhotoId.get(row.id);
      const review = pvId ? reviewByPvId.get(pvId) : undefined;
      return {
        photoId: row.id,
        originalFilename: row.original_filename,
        thumbUrl: row.r2_thumb_url,
        reviewStatus: review?.status ?? null,
        customerComment: review?.customerComment ?? null,
        orderIndex: row.number,
      };
    });

    return NextResponse.json({ photos });
  } catch (e) {
    console.error("[GET /api/c/review-result]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
