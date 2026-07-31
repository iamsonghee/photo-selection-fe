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

/**
 * POST /api/photographer/projects/[id]/retry-archive — 실패한 납품용 원본 아카이브 재시도.
 * 신규 enqueue가 아니라 retry_archive_build RPC가 기존 failed 파트만 pending으로 되돌린다
 * (완료된 파트는 그대로 유지, 전체 파트 구조를 다시 만들지 않음).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, original_archive_status")
      .eq("id", id)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const proj = project as { photographer_id: string; original_archive_status: string | null };
    if (proj.photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (proj.original_archive_status !== "failed") {
      return NextResponse.json(
        { error: "실패 상태의 아카이브만 재시도할 수 있습니다." },
        { status: 400 }
      );
    }

    const { data: retried, error: rpcErr } = await admin.rpc("retry_archive_build", {
      p_project_id: id,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    if (!retried) {
      return NextResponse.json({ error: "재시도할 수 없는 상태입니다." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[retry-archive]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
