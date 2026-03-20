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

/** r2_thumb_url(공개 URL)에서 R2 객체 key 추출 (pathname 기준) */
function urlToR2Key(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return "";
  }
}

/** GET /api/photographer/projects/[id]/photos — 프로젝트 사진 목록 (preparing 시 사진 관리용) */
export async function GET(
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
      .select("id, photographer_id, status")
      .eq("id", id)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rows, error } = await admin
      .from("photos")
      .select("id, r2_thumb_url, original_filename")
      .eq("project_id", id)
      .order("number", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const photos = (rows ?? []).map((r: { id: string; r2_thumb_url: string; original_filename: string | null }) => ({
      id: r.id,
      r2_thumb_url: r.r2_thumb_url,
      original_filename: r.original_filename ?? "",
    }));
    return NextResponse.json({ photos });
  } catch (e) {
    console.error("[GET projects photos]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/photographer/projects/[id]/photos — 프로젝트 사진 전체 삭제 (preparing 시만) */
export async function DELETE(
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
      .select("id, photographer_id, status")
      .eq("id", id)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((project as { status: string }).status !== "preparing") {
      return NextResponse.json({ error: "preparing 상태에서만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { data: photos } = await admin.from("photos").select("id, r2_thumb_url").eq("project_id", id);
    const keys = (photos ?? [])
      .map((p: { r2_thumb_url: string }) => urlToR2Key(p.r2_thumb_url))
      .filter(Boolean);
    if (keys.length > 0) {
      const backendUrl = process.env.BACKEND_URL ?? process.env.API_URL ?? "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/storage/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? "R2 삭제 실패");
      }
    }

    const deletedCount = photos?.length ?? 0;
    const { error: delErr } = await admin.from("photos").delete().eq("project_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: upErr } = await admin
      .from("projects")
      .update({ photo_count: 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ deleted: deletedCount });
  } catch (e) {
    console.error("[DELETE projects photos]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
