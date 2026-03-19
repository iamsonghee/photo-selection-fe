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

function urlToR2Key(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return "";
  }
}

/** DELETE /api/photographer/photos/[photoId] — 사진 1건 삭제 (preparing 시만) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;
  if (!photoId) return NextResponse.json({ error: "Missing photoId" }, { status: 400 });
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: photo, error: photoErr } = await admin
      .from("photos")
      .select("id, project_id, r2_thumb_url")
      .eq("id", photoId)
      .single();
    if (photoErr || !photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

    const projectId = (photo as { project_id: string }).project_id;
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, status")
      .eq("id", projectId)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((project as { status: string }).status !== "preparing") {
      return NextResponse.json({ error: "preparing 상태에서만 삭제할 수 있습니다." }, { status: 403 });
    }

    const key = urlToR2Key((photo as { r2_thumb_url: string }).r2_thumb_url);
    if (key) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/storage/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? "R2 삭제 실패");
      }
    }

    const { error: delErr } = await admin.from("photos").delete().eq("id", photoId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const { count } = await admin
      .from("photos")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    const newCount = count ?? 0;
    await admin
      .from("projects")
      .update({ photo_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return NextResponse.json({ photoId });
  } catch (e) {
    console.error("[DELETE photo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
