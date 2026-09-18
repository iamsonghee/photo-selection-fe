import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";

function urlToR2Key(url: string): string {
  if (url.startsWith("versions/")) return url;
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return "";
  }
}

/** DELETE /api/photographer/projects/[id]/versions/[versionId]
 *  보정본(v1/v2) 파일 삭제. 해당 보정 회차의 작업 중 단계에서만 허용한다.
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
      .select("id, photo_id, version, r2_url, r2_thumb_url, r2_delivery_url")
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

    const { data: review, error: reviewError } = await admin
      .from("version_reviews")
      .select("status, reviewed_at")
      .eq("photo_version_id", versionId)
      .maybeSingle();
    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 500 });
    }
    if ((review as { status?: string } | null)?.status === "approved") {
      return NextResponse.json(
        { error: "고객이 확정한 사진은 삭제할 수 없습니다.", code: "approved_version_locked" },
        { status: 409 },
      );
    }

    // Enforce status-based permission
    const status = (project as { status: string }).status;
    const versionNum = (version as { version: number }).version;
    // 교체 시 현재 리뷰는 초기화되므로 이전 V2 스냅샷까지 확인해 삭제를 차단한다.
    if (versionNum === 2) {
      const { data: reviewedHistory, error: historyError } = await admin
        .from("photo_version_revisions")
        .select("id")
        .eq("photo_id", version.photo_id)
        .eq("version", 2)
        .or("review_status.not.is.null,reviewed_at.not.is.null")
        .limit(1);
      if (historyError) {
        return NextResponse.json({ error: "검토 이력을 확인하지 못했습니다. 다시 시도해주세요." }, { status: 500 });
      }
      if (review?.status || review?.reviewed_at || reviewedHistory?.length) {
        return NextResponse.json(
          { error: "고객 검토 이력이 있는 사진은 교체만 가능합니다.", code: "reviewed_retouch_delete_locked" },
          { status: 409 },
        );
      }
    }
    if (status === "reviewing_v1" || status === "reviewing_v2") {
      return NextResponse.json(
        { error: "고객 검토 중에는 보정본을 삭제할 수 없습니다.", code: "customer_review_in_progress" },
        { status: 409 },
      );
    }
    if (versionNum === 1 && status !== "editing") {
      return NextResponse.json(
        { error: "1차 보정 작업 중에만 보정본을 삭제할 수 있습니다." },
        { status: 403 }
      );
    }
    if (versionNum === 2 && status !== "editing_v2") {
      return NextResponse.json(
        { error: "재보정 작업 중에만 재보정본을 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    // Delete R2 file via backend
    const versionFiles = version as { r2_url: string; r2_thumb_url?: string | null; r2_delivery_url?: string | null };
    const keys = [versionFiles.r2_url, versionFiles.r2_thumb_url, versionFiles.r2_delivery_url]
      .flatMap((value) => value ? [urlToR2Key(value)] : [])
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
