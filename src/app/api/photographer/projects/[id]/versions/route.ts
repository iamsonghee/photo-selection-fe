import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

type VersionRow = {
  id: string;
  photo_id: string;
  version: 1 | 2;
  r2_url: string;
  r2_thumb_url: string | null;
  file_size: number | null;
  created_at: string;
  filename: string | null;
  photos: { original_filename: string | null; project_id: string } | null;
};

type VersionReviewRow = {
  photo_version_id: string;
  photo_id: string;
  status: "approved" | "revision_requested";
  customer_comment: string | null;
  reviewed_at: string | null;
};

type VersionHistoryRow = {
  id: string;
  photo_id: string;
  version: 1 | 2;
  revision_no: number;
  r2_url: string;
  r2_thumb_url: string | null;
  file_size: number | null;
  filename: string | null;
  original_created_at: string;
  superseded_at: string;
  review_status: "approved" | "revision_requested" | null;
  customer_comment: string | null;
  reviewed_at: string | null;
};

/** GET /api/photographer/projects/[id]/versions — photo_versions + photos + version_reviews (service role) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    // 프로젝트 소유권 확인과 보정본 조회는 서로 의존하지 않으므로 동시에 시작한다.
    // versions는 photos.project_id 관계로 범위를 제한해 selections를 다시 읽지 않는다.
    const [
      { data: project, error: projErr },
      { data, error },
    ] = await Promise.all([
      admin
        .from("projects")
        .select("id, photographer_id, status")
        .eq("id", id)
        .single(),
      admin
        .from("photo_versions")
        .select(
          "id, photo_id, version, r2_url, r2_thumb_url, file_size, created_at, filename, photos!inner(original_filename, project_id)"
        )
        .eq("photos.project_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (projErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 같은 사진·같은 version 번호로 photo_versions가 여러 행이면(재업로드 등)
    // created_at DESC 순으로 첫 행만 유지한다. 클라이언트가 배열 끝에서 덮어쓰면
    // 가장 오래된 행만 남아 review가 null로 보이는 버그가 생긴다.
    const rawRows = (data ?? []) as unknown as VersionRow[];
    const seenPhotoVersion = new Set<string>();
    const deduped: VersionRow[] = [];
    for (const r of rawRows) {
      const key = `${r.photo_id}:${r.version}`;
      if (seenPhotoVersion.has(key)) continue;
      seenPhotoVersion.add(key);
      deduped.push(r);
    }

    // PostgREST nested select 의존을 제거하고, photo_version_id 로 명시 SELECT.
    // 환경에 따라 FK 추론이 실패하거나 RLS 가 적용된 경우 review_status 가 일괄 null 로 반환되는 버그가 있어 보강.
    const pvIds = deduped.map((r) => r.id);
    const photoIds = [...new Set(deduped.map((r) => r.photo_id))];
    const vrByPvId = new Map<string, VersionReviewRow>();
    let versionHistory: VersionHistoryRow[] = [];
    if (pvIds.length > 0) {
      const [
        { data: vrRows, error: vrErr },
        { data: historyRows, error: historyErr },
      ] = await Promise.all([
        admin
        .from("version_reviews")
        .select("photo_version_id, photo_id, status, customer_comment, reviewed_at")
        .in("photo_version_id", pvIds),
        admin
          .from("photo_version_revisions")
          .select(
            "id, photo_id, version, revision_no, r2_url, r2_thumb_url, file_size, filename, original_created_at, superseded_at, review_status, customer_comment, reviewed_at"
          )
          .in("photo_id", photoIds)
          .order("version", { ascending: false })
          .order("revision_no", { ascending: false }),
      ]);
      if (vrErr) {
        console.warn("[GET projects versions] version_reviews fetch failed", vrErr.message);
      }
      if (historyErr) {
        return NextResponse.json({ error: historyErr.message }, { status: 500 });
      }
      for (const r of (vrRows ?? []) as VersionReviewRow[]) {
        vrByPvId.set(r.photo_version_id, r);
      }
      versionHistory = (historyRows ?? []) as VersionHistoryRow[];
    }

    const versions = deduped.map((r) => {
      const review = vrByPvId.get(r.id) ?? null;
      return {
        id: r.id,
        photo_id: r.photo_id,
        version: r.version,
        r2_url: r.r2_url,
        r2_thumb_url: r.r2_thumb_url ?? null,
        file_size: r.file_size ?? null,
        created_at: r.created_at,
        original_filename: r.photos?.original_filename ?? "",
        version_filename: r.filename ?? null,
        review_status: review?.status ?? null,
        customer_comment: review?.customer_comment ?? null,
        reviewed_at: review?.reviewed_at ?? null,
      };
    });

    return NextResponse.json({
      project_status: (project as { status: string }).status,
      versions,
      version_history: versionHistory.map((row) => ({
        id: row.id,
        photo_id: row.photo_id,
        version: row.version,
        revision_no: row.revision_no,
        r2_url: row.r2_url,
        r2_thumb_url: row.r2_thumb_url,
        file_size: row.file_size,
        version_filename: row.filename,
        created_at: row.original_created_at,
        superseded_at: row.superseded_at,
        review_status: row.review_status,
        customer_comment: row.customer_comment,
        reviewed_at: row.reviewed_at,
      })),
    });
  } catch (e) {
    console.error("[GET projects versions]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
