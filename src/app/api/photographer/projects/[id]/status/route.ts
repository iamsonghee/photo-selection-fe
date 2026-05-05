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
      .select("id, photographer_id, status, max_revision_count, revision_round")
      .eq("id", projectId)
      .single();

    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const proj = project as { photographer_id: string; status: string; max_revision_count: number; revision_round: number };
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

    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

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
