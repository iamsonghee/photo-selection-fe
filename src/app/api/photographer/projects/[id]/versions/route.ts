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
  created_at: string;
  photos: { original_filename: string | null } | null;
  version_reviews:
    | {
        status: "approved" | "revision_requested";
        customer_comment: string | null;
        reviewed_at: string | null;
      }[]
    | null;
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
        "id, photo_id, version, r2_url, created_at, photos!inner(original_filename), version_reviews(status, customer_comment, reviewed_at)"
      )
      .in("photo_id", Array.from(allowed))
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const versions = ((data ?? []) as unknown as VersionRow[]).map((r) => {
      const review = r.version_reviews?.[0] ?? null;
      return {
        id: r.id,
        photo_id: r.photo_id,
        version: r.version,
        r2_url: r.r2_url,
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
