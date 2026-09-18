import { after, NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";
const MAX_SELECTED_DELETE = 3000;

type DeleteAsset = {
  photo_id: string;
  r2_thumb_url: string | null;
  r2_preview_url: string | null;
  r2_original_url: string | null;
  r2_source_keys: string[] | null;
};

function urlToR2Key(reference: string): string {
  if (reference.startsWith("originals/")) return reference;
  try {
    const pathname = new URL(reference).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return reference.includes("://") ? "" : reference.replace(/^\/+/, "");
  }
}

async function bestEffortSyncGeminiGroups(projectId: string): Promise<void> {
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return;
  try {
    await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/${projectId}/sync-groups`, {
      method: "POST",
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });
  } catch (error) {
    console.error("[DELETE selected photos] gemini sync-groups best-effort failed", error);
  }
}

/** DELETE /api/photographer/projects/[id]/photos/selected — 선택 사진 일괄 삭제 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const body = await request.json().catch(() => null) as { photoIds?: unknown } | null;
    if (!Array.isArray(body?.photoIds)) {
      return NextResponse.json({ error: "photoIds가 필요합니다." }, { status: 400 });
    }

    const photoIds = [...new Set(body.photoIds.filter((value): value is string => typeof value === "string" && value.length > 0))];
    if (photoIds.length === 0) {
      return NextResponse.json({ error: "삭제할 사진을 선택해 주세요." }, { status: 400 });
    }
    if (photoIds.length > MAX_SELECTED_DELETE) {
      return NextResponse.json({ error: `한 번에 최대 ${MAX_SELECTED_DELETE}장까지 삭제할 수 있습니다.` }, { status: 400 });
    }

    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id, status")
      .eq("id", id)
      .single();
    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((project as { status: string }).status !== "preparing") {
      return NextResponse.json({ error: "preparing 상태에서만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { data: assetRows, error: assetError } = await admin.rpc("get_photo_delete_assets", {
      p_project_id: id,
      p_photo_ids: photoIds,
    });
    if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });

    const assets = (assetRows ?? []) as DeleteAsset[];
    if (assets.length !== photoIds.length) {
      return NextResponse.json({ error: "일부 사진이 프로젝트에 없거나 이미 삭제되었습니다." }, { status: 409 });
    }

    const keys = [...new Set(
      assets.flatMap((asset) => [
        asset.r2_thumb_url,
        asset.r2_preview_url,
        asset.r2_original_url,
        ...(asset.r2_source_keys ?? []),
      ])
        .flatMap((reference) => reference ? [urlToR2Key(reference)] : [])
        .filter(Boolean),
    )];

    if (keys.length > 0) {
      const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:8000";
      const storageResponse = await fetch(`${backendUrl}/api/storage/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!storageResponse.ok) {
        const data = await storageResponse.json().catch(() => ({}));
        return NextResponse.json(
          { error: (data as { detail?: string }).detail ?? "R2 삭제 실패" },
          { status: 502 },
        );
      }
    }

    const { data: result, error: deleteError } = await admin.rpc("delete_photos_and_resolve_groups", {
      p_project_id: id,
      p_photo_ids: photoIds,
    });
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    // DB RPC가 화면에 필요한 그룹 정합성은 이미 복구한다. 외부 분석 서비스의 임베딩 기반
    // 재동기화는 응답을 지연시키지 않도록 요청 수명 이후 best-effort로 한 번만 수행한다.
    after(() => bestEffortSyncGeminiGroups(id));

    return NextResponse.json(result ?? { deletedCount: photoIds.length });
  } catch (error) {
    console.error("[DELETE selected photos]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
