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

/** DELETE /api/photographer/projects/[id]/versions/[versionId]
 *  보정본(v1/v2) 파일 삭제. v1: status=editing 시만, v2: status=editing_v2 시만 허용.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  if (!id || !versionId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    // Verify the project belongs to this photographer
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

    // Fetch the version record
    const { data: version, error: vErr } = await admin
      .from("photo_versions")
      .select("id, photo_id, version, r2_url")
      .eq("id", versionId)
      .single();
    if (vErr || !version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Check version belongs to this project (via photo)
    const { data: photo } = await admin
      .from("photos")
      .select("project_id")
      .eq("id", (version as { photo_id: string }).photo_id)
      .single();
    if (!photo || (photo as { project_id: string }).project_id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Enforce status-based permission
    const status = (project as { status: string }).status;
    const versionNum = (version as { version: number }).version;
    if (versionNum === 1 && status !== "editing") {
      return NextResponse.json(
        { error: "editing 상태에서만 v1 보정본을 삭제할 수 있습니다." },
        { status: 403 }
      );
    }
    if (versionNum === 2 && status !== "editing_v2") {
      return NextResponse.json(
        { error: "editing_v2 상태에서만 v2 보정본을 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    // Delete R2 file via backend
    const r2Url = (version as { r2_url: string }).r2_url;
    const key = urlToR2Key(r2Url);
    if (key) {
      const backendUrl = process.env.BACKEND_URL ?? process.env.API_URL ?? "http://localhost:8000";
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

    // Delete version_reviews (cascade should handle this, but be explicit)
    await admin.from("version_reviews").delete().eq("photo_version_id", versionId);

    // Delete the photo_version record
    const { error: delErr } = await admin
      .from("photo_versions")
      .delete()
      .eq("id", versionId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ versionId });
  } catch (e) {
    console.error("[DELETE version]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
