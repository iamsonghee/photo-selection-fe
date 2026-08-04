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
      .select("id, photographer_id, status, original_archive_status")
      .eq("id", id)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((project as { status: string }).status !== "preparing") {
      return NextResponse.json({ error: "preparing 상태에서만 삭제할 수 있습니다." }, { status: 403 });
    }
    // BETA_MAX=3000이므로 3페이지 병렬 — PostgREST 1000행 limit 우회
    const photoPages = await Promise.all(
      [0, 1, 2].map((i) =>
        admin
          .from("photos")
          .select("id, r2_thumb_url, r2_preview_url")
          .eq("project_id", id)
          .order("number", { ascending: true })
          .range(i * 1000, (i + 1) * 1000 - 1)
      )
    );
    const photos = photoPages.flatMap(({ data }) => data ?? []);
    // 고객 링크 활성화 전(preparing)에는 작가가 전체를 비우고 다시 업로드할 수 있다.
    // 이미 시작된 원본 ZIP 작업은 DB 스냅샷과 R2 원본/ZIP을 함께 폐기해 다음 업로드가
    // 이전 아카이브 상태를 이어받지 않게 한다. photos 삭제는 original_jobs를 CASCADE 삭제한다.
    const [originalJobPages, archivePartsResult, stagingPartsResult] = await Promise.all([
      Promise.all(
        [0, 1, 2].map((i) =>
          admin
            .from("original_jobs")
            .select("r2_source_key")
            .eq("project_id", id)
            .range(i * 1000, (i + 1) * 1000 - 1)
        )
      ),
      admin
        .from("original_archive_parts")
        .select("r2_key")
        .eq("project_id", id),
      admin
        .from("original_archive_staging_parts")
        .select("r2_key")
        .eq("project_id", id),
    ]);
    const originalJobsError = originalJobPages.find(({ error }) => error)?.error;
    if (originalJobsError) return NextResponse.json({ error: originalJobsError.message }, { status: 500 });
    if (archivePartsResult.error) {
      return NextResponse.json({ error: archivePartsResult.error.message }, { status: 500 });
    }
    if (stagingPartsResult.error) {
      return NextResponse.json({ error: stagingPartsResult.error.message }, { status: 500 });
    }
    const originalKeys = originalJobPages
      .flatMap(({ data }) => data ?? [])
      .map((job: { r2_source_key: string }) => job.r2_source_key)
      .filter(Boolean);
    const archiveKeys = (archivePartsResult.data ?? [])
      .map((part: { r2_key: string }) => part.r2_key)
      .filter(Boolean);
    const stagingKeys = (stagingPartsResult.data ?? [])
      .map((part: { r2_key: string }) => part.r2_key)
      .filter(Boolean);
    const keys = photos
      .flatMap((p: { r2_thumb_url: string; r2_preview_url: string | null }) => [
        urlToR2Key(p.r2_thumb_url),
        p.r2_preview_url ? urlToR2Key(p.r2_preview_url) : "",
      ])
      .concat(originalKeys, archiveKeys, stagingKeys)
      .filter(Boolean);
    if (keys.length > 0) {
      const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:8000";
      try {
        const res = await fetch(`${backendUrl}/api/storage/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn("[DELETE projects photos] R2 삭제 실패 (DB 삭제는 계속 진행):", (data as { detail?: string }).detail);
        }
      } catch (e) {
        console.warn("[DELETE projects photos] R2 삭제 요청 실패 (DB 삭제는 계속 진행):", e);
      }
    }

    // 진행 중인 아카이브 파트를 먼저 없애 워커 완료 결과가 프로젝트를 다시 ready로
    // 바꾸지 못하게 한다. 워커 측에서도 취소된 part는 업로드 직전에 중단한다.
    const { error: archiveDeleteErr } = await admin
      .from("original_archive_parts")
      .delete()
      .eq("project_id", id);
    if (archiveDeleteErr) return NextResponse.json({ error: archiveDeleteErr.message }, { status: 500 });
    const { error: stagingDeleteErr } = await admin
      .from("original_archive_staging_parts")
      .delete()
      .eq("project_id", id);
    if (stagingDeleteErr) return NextResponse.json({ error: stagingDeleteErr.message }, { status: 500 });

    const deletedCount = photos?.length ?? 0;
    const { error: delErr } = await admin.from("photos").delete().eq("project_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // 사진 전체 삭제로 photo_groups가 전부 무의미해짐 — clip-service sync는
    // gemini_embeddings도 이미 CASCADE 삭제되어 0건이라 조기 종료(정리 안 됨)하므로
    // 여기서 직접 정리한다. OpenCLIP 레거시 그룹도 함께 정리됨(어차피 사진이 없어 무의미).
    await admin.from("photo_groups").delete().eq("project_id", id);

    const { error: upErr } = await admin
      .from("projects")
      .update({
        photo_count: 0,
        original_archive_status: null,
        original_archive_processing_started_at: null,
        original_download_started_at: null,
        updated_at: new Date().toISOString(),
      })
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
