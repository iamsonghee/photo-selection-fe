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
  file_size: number | null;
  created_at: string;
  photos: { original_filename: string | null } | null;
};

type VersionReviewRow = {
  photo_version_id: string;
  photo_id: string;
  status: "approved" | "revision_requested";
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
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, status")
      .eq("id", id)
      .single();
    if (projErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 선택된 사진만 대상으로 versions를 보여주기 위해 selections 기반으로 필터링
    const { data: selections, error: selErr } = await admin
      .from("selections")
      .select("photo_id")
      .eq("project_id", id);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
    const allowed = new Set((selections ?? []).map((s: { photo_id: string }) => s.photo_id));
    if (allowed.size === 0) {
      return NextResponse.json({
        project_status: (project as { status: string }).status,
        versions: [],
      });
    }

    const { data, error } = await admin
      .from("photo_versions")
      .select(
        "id, photo_id, version, r2_url, file_size, created_at, photos!inner(original_filename)"
      )
      .in("photo_id", Array.from(allowed))
      .order("created_at", { ascending: false });

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
    const vrByPvId = new Map<string, VersionReviewRow>();
    if (pvIds.length > 0) {
      const { data: vrRows, error: vrErr } = await admin
        .from("version_reviews")
        .select("photo_version_id, photo_id, status, customer_comment, reviewed_at")
        .in("photo_version_id", pvIds);
      if (vrErr) {
        console.warn("[GET projects versions] version_reviews fetch failed", vrErr.message);
      }
      for (const r of (vrRows ?? []) as VersionReviewRow[]) {
        vrByPvId.set(r.photo_version_id, r);
      }

      // 진단: photo_id 단위 review 수와 photo_version_id 단위 매칭 수를 비교해
      // photo_versions ↔ version_reviews 매핑이 끊겨 있는지(orphan) 확인한다.
      const { data: photoLevelRows, error: plErr } = await admin
        .from("version_reviews")
        .select("photo_version_id")
        .in("photo_id", Array.from(allowed));
      if (plErr) {
        console.warn("[GET projects versions] version_reviews photo_level fetch failed", plErr.message);
      } else {
        const photoLevelCount = (photoLevelRows ?? []).length;
        const matched = vrByPvId.size;
        if (photoLevelCount > 0 && photoLevelCount !== matched) {
          const expectedPvIds = new Set(pvIds);
          const orphanPvIds = (photoLevelRows ?? [])
            .map((r) => (r as { photo_version_id: string }).photo_version_id)
            .filter((pvId) => !expectedPvIds.has(pvId));
          console.warn(
            "[GET projects versions] orphan version_reviews detected",
            { projectId: id, photoLevelCount, matched, orphanPvIds: orphanPvIds.slice(0, 20) }
          );
        }
      }
    }

    const versions = deduped.map((r) => {
      const review = vrByPvId.get(r.id) ?? null;
      return {
        id: r.id,
        photo_id: r.photo_id,
        version: r.version,
        r2_url: r.r2_url,
        file_size: r.file_size ?? null,
        created_at: r.created_at,
        original_filename: r.photos?.original_filename ?? "",
        review_status: review?.status ?? null,
        customer_comment: review?.customer_comment ?? null,
        reviewed_at: review?.reviewed_at ?? null,
      };
    });

    return NextResponse.json({
      project_status: (project as { status: string }).status,
      versions,
    });
  } catch (e) {
    console.error("[GET projects versions]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
