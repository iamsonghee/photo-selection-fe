import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";

/** GET — 활성화 이후에도 전달용 원본 진행 상태를 작은 집계 응답으로 제공한다. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("photographer_id, include_original")
      .eq("id", projectId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.photographer_id !== photographerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!project.include_original) {
      return NextResponse.json({ total: 0, completed: 0, processing: 0, needsRecovery: 0 });
    }
    const { data, error } = await admin.rpc("get_original_upload_progress", { p_project_id: projectId });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? { total: 0, completed: 0, processing: 0, needsRecovery: 0 });
  } catch (error) {
    console.error("[GET project original progress]", error);
    return NextResponse.json({ error: "원본 업로드 상태를 확인하지 못했습니다." }, { status: 500 });
  }
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
    const proj = project as {
      photographer_id: string;
      status: string;
      max_revision_count: number;
      revision_round: number;
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

    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

    // 보정 검토 시작 시 최종 납품 후보를 현재 보정본 구성으로 고정한다. RPC가 모든
    // 셀렉 사진의 원본 크기 보정본 존재 여부와 상태 전환을 한 트랜잭션에서 처리한다.
    if ((proj.status === "editing" && status === "reviewing_v1") ||
        (proj.status === "editing_v2" && status === "reviewing_v2")) {
      const version = status === "reviewing_v1" ? 1 : 2;
      const { data: archiveId, error: archiveErr } = await admin.rpc("start_retouch_review_with_archive", {
        p_project_id: projectId,
        p_version: version,
      });
      if (archiveErr) {
        console.error("[PATCH project status] final retouch archive snapshot failed", archiveErr);
        const incomplete = /delivery_versions_incomplete/.test(archiveErr.message);
        return NextResponse.json({
          error: incomplete
            ? "모든 셀렉 사진의 원본 크기 보정본을 업로드한 뒤 고객 검토를 시작해주세요."
            : "최종 보정본 다운로드 준비를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
          code: incomplete ? "delivery_versions_incomplete" : "final_archive_start_failed",
        }, { status: incomplete ? 409 : 500 });
      }
      return NextResponse.json({ status, finalDeliveryArchiveId: archiveId });
    }

    // 프리뷰 사진 구성을 DB에서 원자적으로 잠근 뒤 고객 셀렉을 시작한다. 원본은 링크
    // 활성화와 독립적으로 계속 전송되고, 마지막 원본 완료 이벤트가 archive를 enqueue한다.
    if (proj.status === "preparing" && status === "selecting") {
      const { data: activationResult, error: activateErr } = await admin.rpc("activate_project_for_selection", {
        p_project_id: projectId,
      });
      if (activateErr) {
        console.error("[PATCH project status] atomic activation failed", activateErr);
        return NextResponse.json({ error: "사진 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
      }
      if (activationResult === "activated" || activationResult === "already_active") {
        return NextResponse.json({ status, alreadyActive: activationResult === "already_active" });
      }
      if (activationResult === "insufficient_photos") {
        return NextResponse.json({ error: "셀렉 목표 장수만큼 사진을 업로드해주세요.", code: "insufficient_photos" }, { status: 409 });
      }
      return NextResponse.json({ error: "현재 프로젝트 상태에서는 셀렉을 시작할 수 없습니다.", code: activationResult ?? "activation_failed" }, { status: 409 });
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
