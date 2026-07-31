import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

/** 삭제된 사진이 Gemini 그룹에 속해 있었을 수 있으므로 photo_groups/similarity_group_id를
 * 최신화한다 — Gemini API 재호출 없이 저장된 임베딩만으로 재계산(clip-service 내부에서 처리).
 * 실패해도 삭제 자체는 이미 성공 처리된 뒤이므로 best-effort로만 시도하고 응답에 영향을 주지 않는다.
 * Gemini를 쓴 적 없는 프로젝트에서는 clip-service 쪽에서 안전하게 아무것도 하지 않는다. */
async function bestEffortSyncGeminiGroups(projectId: string): Promise<void> {
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return;
  try {
    await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/${projectId}/sync-groups`, {
      method: "POST",
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });
  } catch (e) {
    console.error("[DELETE photo] gemini sync-groups best-effort failed", e);
  }
}

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
      .select("id, photographer_id, status, original_archive_status")
      .eq("id", projectId)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((project as { status: string }).status !== "preparing") {
      return NextResponse.json({ error: "preparing 상태에서만 삭제할 수 있습니다." }, { status: 403 });
    }
    // 납품용 원본 아카이브가 생성 대상으로 확정된(enqueue 이후) 프로젝트에서는, 원본이 있는
    // 사진을 삭제하면 이미 만들어졌거나 만들어지는 중인 ZIP과 실제 사진 구성이 어긋나므로 금지한다.
    if ((project as { original_archive_status: string | null }).original_archive_status) {
      const { data: photoStatus } = await admin
        .from("photos")
        .select("original_status")
        .eq("id", photoId)
        .single();
      if ((photoStatus as { original_status: string | null } | null)?.original_status) {
        return NextResponse.json(
          { error: "납품용 원본 정리가 시작된 이후에는 원본이 포함된 사진을 삭제할 수 없습니다." },
          { status: 403 }
        );
      }
    }

    const key = urlToR2Key((photo as { r2_thumb_url: string }).r2_thumb_url);
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

    const { data: groupResult, error: delErr } = await admin.rpc(
      "delete_photo_and_resolve_group",
      { p_photo_id: photoId }
    );
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    await bestEffortSyncGeminiGroups(projectId);

    const { count } = await admin
      .from("photos")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    const newCount = count ?? 0;
    await admin
      .from("projects")
      .update({ photo_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return NextResponse.json({ photoId, group: groupResult ?? null });
  } catch (e) {
    console.error("[DELETE photo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
