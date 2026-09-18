import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";
import { normalizeReviewComment } from "@/lib/review-submission-validation";

type DraftRow = {
  photo_id: string;
  photo_version_id: string;
  status: "approved" | "revision_requested";
  customer_comment: string | null;
};

/** 이 토큰으로 검토 초안을 읽고 쓸 수 있는 프로젝트인지 확인한다. */
async function requireReviewingProject(req: NextRequest, token: string | null) {
  if (!token?.trim()) {
    return { error: NextResponse.json({ error: "token required" }, { status: 400 }) };
  }
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return { error: auth.error };
  const admin = getAdminClient();
  const project = auth.project;
  if (!project) {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 404 }) };
  }
  if (project.status !== "reviewing_v1" && project.status !== "reviewing_v2") {
    return {
      error: NextResponse.json(
        { error: "현재 프로젝트는 보정본 검토 단계가 아닙니다." },
        { status: 409 },
      ),
    };
  }
  return { admin, project };
}

/**
 * GET /api/c/review/draft?token= — 아직 제출하지 않은 판단 전체.
 *
 * 다른 기기가 저장한 판단을 따라잡기 위한 폴링 조회다(셀렉의 GET /api/c/selections와 같은 역할).
 * 행이 없는 사진 = 미검토이므로, 응답에 없는 사진은 로컬에서도 판단을 지워야 한다.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const guard = await requireReviewingProject(req, token);
    if ("error" in guard) return guard.error;
    const { admin, project } = guard;

    const { data, error } = await admin
      .from("version_review_drafts")
      .select("photo_id, photo_version_id, status, customer_comment")
      .eq("project_id", project.id);
    if (error) throw error;

    const drafts: Record<string, { status: string; comment: string | null }> = {};
    for (const row of (data ?? []) as DraftRow[]) {
      drafts[row.photo_id] = {
        status: row.status,
        comment: normalizeReviewComment(row.customer_comment),
      };
    }
    return NextResponse.json({ drafts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[GET /api/c/review/draft]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/c/review/draft — 판단 한 장 저장.
 *
 * `status: "pending"`은 판단 취소를 뜻하고 행을 지운다(행 없음 = 미검토). 그래야 다른 기기의
 * 폴링이 "취소됐다"를 알아차린다 — 상태 값으로 남기면 취소와 미검토가 갈라져 규칙이 둘이 된다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? body.access_token) as string | undefined;
    const photoId = body.photo_id as string | undefined;
    const photoVersionId = body.photo_version_id as string | undefined;
    const status = body.status as string | undefined;

    const guard = await requireReviewingProject(req, token ?? null);
    if ("error" in guard) return guard.error;
    const { admin, project } = guard;

    if (!photoId?.trim() || !photoVersionId?.trim()) {
      return NextResponse.json({ error: "photo_id, photo_version_id required" }, { status: 400 });
    }

    /* 남의 프로젝트 사진에 쓰지 못하도록 — 이 photo_version이 정말 이 프로젝트의 것인지 확인한다.
     * 토큰만 믿으면 photo_version_id를 바꿔치기해 다른 프로젝트에 쓸 수 있다. */
    const { data: owned, error: ownErr } = await admin
      .from("photo_versions")
      .select("id, photo_id, photos!inner(id, project_id)")
      .eq("id", photoVersionId)
      .eq("photo_id", photoId)
      .eq("photos.project_id", project.id)
      .maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned) {
      return NextResponse.json({ error: "Invalid photo for this project" }, { status: 400 });
    }

    if (status === "pending" || status == null) {
      const { error } = await admin
        .from("version_review_drafts")
        .delete()
        .eq("photo_version_id", photoVersionId);
      if (error) throw error;
      return NextResponse.json({ ok: true, cleared: true });
    }

    if (status !== "approved" && status !== "revision_requested") {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const { error } = await admin.from("version_review_drafts").upsert(
      {
        project_id: project.id,
        photo_id: photoId,
        photo_version_id: photoVersionId,
        status,
        customer_comment: normalizeReviewComment(body.comment),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "photo_version_id" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/c/review/draft]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
