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

/** PATCH /api/photographer/projects/[id]/status — 허용된 상태 전환만 처리 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (typeof status !== "string" || !status.trim()) {
      return NextResponse.json({ error: "유효한 status가 필요합니다." }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, status, max_revision_count, revision_round, include_original, original_archive_status, original_download_started_at")
      .eq("id", projectId)
      .single();

    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const proj = project as {
      photographer_id: string;
      status: string;
      max_revision_count: number;
      revision_round: number;
      include_original: boolean;
      original_archive_status: string | null;
      original_download_started_at: string | null;
    };
    if (proj.photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowedTransitions: Record<string, string> = {
      preparing: "selecting",
      editing: "reviewing_v1",
      editing_v2: "reviewing_v2",
    };
    const expectedNext = allowedTransitions[proj.status];
    if (!expectedNext || status !== expectedNext) {
      return NextResponse.json(
        {
          error: `허용되지 않은 상태 전환입니다. 현재 '${proj.status}'에서는 '${expectedNext ?? "없음"}'만 허용됩니다.`,
        },
        { status: 400 }
      );
    }

    // preparing→selecting(초대 링크 활성화)은 include_original=true인 프로젝트에 한해
    // 납품용 원본 아카이브가 ready 상태여야만 허용 — 원본 미완료/아카이브 생성 중·실패 상태에서
    // 링크를 활성화하면 30일 다운로드 기산이 원본 없는 채로 시작돼버리는 문제를 막는다.
    if (proj.status === "preparing" && status === "selecting" && proj.include_original) {
      if (proj.original_archive_status !== "ready") {
        return NextResponse.json(
          {
            error:
              proj.original_archive_status === "failed"
                ? "납품용 원본 처리에 실패한 파일이 있습니다. 재시도 후 다시 시도해주세요."
                : "납품용 원본을 정리하는 중입니다. 완료 후 다시 시도해주세요.",
          },
          { status: 409 }
        );
      }
    }

    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

    // 초대 링크 활성화 시점 = 다운로드 30일 기산 시작 — 최초 1회만 기록(재전달로 초기화 안 됨)
    if (proj.status === "preparing" && status === "selecting" && !proj.original_download_started_at) {
      updatePayload.original_download_started_at = new Date().toISOString();
    }

    // editing_v2로 전환 시(고객 재보정 요청 처리 경로가 아닌 작가 업로드→검토 전송)
    // revision_round는 고객 제출 API에서 증가하므로 여기선 건드리지 않음

    const { error: updateErr } = await admin
      .from("projects")
      .update(updatePayload)
      .eq("id", projectId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ status });
  } catch (e) {
    console.error("[PATCH project status]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
