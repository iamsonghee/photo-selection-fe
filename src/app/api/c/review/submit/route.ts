import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getProjectByToken, getReviewDataByToken } from "@/lib/customer-api-server";
import { submitVersionReviews } from "@/lib/db";
import { checkPinAuth } from "@/lib/customer-auth-server";
import { validateReviewSubmission } from "@/lib/review-submission-validation";

/** POST /api/c/review/submit — 고객 검토 최종 제출 (version_reviews 일괄 INSERT + project status 업데이트) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? body.access_token) as string | undefined;
    const reviewsInput: unknown = body.reviews;

    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    const pinErr = await checkPinAuth(req, token);
    if (pinErr) return pinErr;

    const admin = getAdminClient();
    const project = await getProjectByToken(admin, token);
    if (!project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    if (project.status !== "reviewing_v1" && project.status !== "reviewing_v2") {
      return NextResponse.json(
        { error: "현재 프로젝트는 보정본 검토를 제출할 수 있는 상태가 아닙니다." },
        { status: 409 },
      );
    }

    const reviewData = await getReviewDataByToken(admin, token);
    if (!reviewData) {
      return NextResponse.json({ error: "검토 데이터를 불러오지 못했습니다." }, { status: 409 });
    }
    const validation = validateReviewSubmission(
      reviewsInput,
      reviewData.photos.map((photo) => ({
        photoVersionId: photo.photoVersionId,
        photoId: photo.id,
      })),
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { status } = await submitVersionReviews(
      admin,
      project.id,
      validation.reviews,
      project.status,
    );
    /* 제출된 판단은 version_reviews로 옮겨졌으니 초안은 비운다 — 남겨두면 다음 회차 화면에서
     * 지난 회차 판단이 되살아난다. 실패해도 제출 자체는 이미 성공이므로 막지 않는다. */
    const { error: draftClearError } = await admin
      .from("version_review_drafts")
      .delete()
      .eq("project_id", project.id);
    if (draftClearError) {
      console.error("[POST /api/c/review/submit] draft cleanup failed", draftClearError);
    }

    const { error: archiveError } = await admin.rpc("resolve_retouch_delivery_archive", {
      p_project_id: project.id,
      p_delivered: status === "delivered",
    });
    if (archiveError) {
      console.error("[POST /api/c/review/submit] final delivery archive resolve failed", archiveError);
    }
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
