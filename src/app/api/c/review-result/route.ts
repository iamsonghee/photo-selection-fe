import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";

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
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  try {
    const admin = getAdminClient();
    const project = auth.project;
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
      .select("id, photo_id, version, r2_thumb_url, r2_url, created_at")
      .in("photo_id", photoIds)
      .order("created_at", { ascending: false });

    type PvRow = {
      id: string;
      photo_id: string;
      version: number;
      r2_thumb_url: string | null;
      r2_url: string | null;
      created_at: string;
    };
    const pv1ByPhotoId = new Map<string, PvRow>();
    const pv2ByPhotoId = new Map<string, PvRow>();
    for (const r of (pvRows ?? []) as PvRow[]) {
      // 같은 회차를 교체한 이력이 섞여 와도 가장 최근 활성 행을 사용한다.
      if (r.version === 1 && !pv1ByPhotoId.has(r.photo_id)) pv1ByPhotoId.set(r.photo_id, r);
      else if (r.version === 2 && !pv2ByPhotoId.has(r.photo_id)) pv2ByPhotoId.set(r.photo_id, r);
    }
    const activeVersions = [...pv1ByPhotoId.values(), ...pv2ByPhotoId.values()];
    const allPvIds = activeVersions.map((r) => r.id);

    // v1 + v2 version_reviews 동시 조회
    const reviewRows = allPvIds.length
      ? (await admin
          .from("version_reviews")
          .select("photo_version_id, status, customer_comment")
          .in("photo_version_id", allPvIds)).data
      : [];
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
      const pv2 = pv2ByPhotoId.get(row.id);
      const pv1 = pv1ByPhotoId.get(row.id);
      const pv2Review = pv2 ? reviewByPvId.get(pv2.id) : undefined;
      const pv1Review = pv1 ? reviewByPvId.get(pv1.id) : undefined;
      // 상태·코멘트·이미지가 반드시 같은 보정 회차를 가리키도록 함께 선택한다.
      const chosenVersion = pv2Review ? pv2 : pv1Review ? pv1 : (pv2 ?? pv1);
      const review = pv2Review ?? pv1Review;
      return {
        photoId: row.id,
        originalFilename: row.original_filename,
        thumbUrl: chosenVersion?.r2_thumb_url ?? chosenVersion?.r2_url ?? row.r2_thumb_url,
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
