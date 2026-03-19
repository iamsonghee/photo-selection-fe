import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getProjectByToken } from "@/lib/customer-api-server";
import { submitVersionReviews } from "@/lib/db";

type ReviewItem = {
  photo_version_id: string;
  photo_id: string;
  status: "approved" | "revision_requested";
  customer_comment?: string | null;
};

/** POST /api/c/review/submit — 고객 검토 최종 제출 (version_reviews 일괄 INSERT + project status 업데이트) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? body.access_token) as string | undefined;
    const reviews = body.reviews as ReviewItem[] | undefined;

    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json({ error: "reviews array required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const project = await getProjectByToken(admin, token);
    if (!project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const valid = reviews.every(
      (r) =>
        r &&
        typeof r.photo_version_id === "string" &&
        typeof r.photo_id === "string" &&
        (r.status === "approved" || r.status === "revision_requested")
    );
    if (!valid) {
      return NextResponse.json({ error: "Invalid reviews format" }, { status: 400 });
    }

    // photo_version_id가 이 프로젝트 소속인지 확인 (FK 오류 방지)
    const pvIds = [...new Set(reviews.map((r) => r.photo_version_id))];
    const { data: pvRows } = await admin
      .from("photo_versions")
      .select("id, photo_id")
      .in("id", pvIds);
    const { data: projectPhotos } = await admin
      .from("photos")
      .select("id")
      .eq("project_id", project.id);
    const projectPhotoIds = new Set((projectPhotos ?? []).map((r: { id: string }) => r.id));
    const pvInProject = (pvRows ?? []).filter(
      (r: { id: string; photo_id: string }) => projectPhotoIds.has(r.photo_id)
    );
    const validPvIds = new Set(pvInProject.map((r: { id: string }) => r.id));
    const invalid = pvIds.filter((id) => !validPvIds.has(id));
    if (invalid.length > 0) {
      console.error("[POST /api/c/review/submit] invalid photo_version_id for project", project.id, invalid);
      return NextResponse.json(
        { error: "일부 보정본 ID가 이 프로젝트와 일치하지 않습니다. 페이지를 새로고침 후 다시 제출해 주세요." },
        { status: 400 }
      );
    }

    const { status } = await submitVersionReviews(admin, project.id, reviews);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code = e instanceof Error && "code" in e ? (e as { code?: string }).code : undefined;
    console.error("[POST /api/c/review/submit]", message, code ?? "", e);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
