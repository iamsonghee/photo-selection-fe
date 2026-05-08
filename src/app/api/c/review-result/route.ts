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
 * editing_v2 / reviewing_v2 / delivered 상태에서 검토 결과를 반환.
 * v2 review가 있으면 v2 우선, 없으면 v1 fallback — workflow와 동일한 로직.
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

    // v1 + v2 photo_versions 동시 조회
    const { data: pvRows } = await admin
      .from("photo_versions")
      .select("id, photo_id, version")
      .in("photo_id", photoIds);

    type PvRow = { id: string; photo_id: string; version: number };
    const pv1ByPhotoId = new Map<string, string>();
    const pv2ByPhotoId = new Map<string, string>();
    for (const r of (pvRows ?? []) as PvRow[]) {
      if (r.version === 1) pv1ByPhotoId.set(r.photo_id, r.id);
      else if (r.version === 2) pv2ByPhotoId.set(r.photo_id, r.id);
    }
    const allPvIds = (pvRows ?? []).map((r: PvRow) => r.id);

    // v1 + v2 version_reviews 동시 조회
    const { data: reviewRows } = await admin
      .from("version_reviews")
      .select("photo_version_id, status, customer_comment")
      .in("photo_version_id", allPvIds);
    type VrRow = { photo_version_id: string; status: string; customer_comment: string | null };
    const reviewByPvId = new Map(
      (reviewRows ?? []).map((r: VrRow) => [
        r.photo_version_id,
        { status: r.status as "approved" | "revision_requested", customerComment: r.customer_comment },
      ])
    );

    const photos: ReviewResultPhoto[] = (photosRows ?? []).map((row: {
      id: string; number: number; r2_thumb_url: string; original_filename: string | null;
    }) => {
      // v2 review 우선, 없으면 v1 fallback (workflow와 동일 로직)
      const pv2Id = pv2ByPhotoId.get(row.id);
      const pv1Id = pv1ByPhotoId.get(row.id);
      const review = (pv2Id && reviewByPvId.get(pv2Id)) || (pv1Id ? reviewByPvId.get(pv1Id) : undefined);
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
