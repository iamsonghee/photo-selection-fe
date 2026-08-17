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

    // 원본 포함 프로젝트는 상태 전환과 archive pending 전환을 한 DB 트랜잭션으로 묶는다.
    // 원본 한 장이라도 미완료면 링크를 열지 않아 고객 화면이 영구 "ZIP 준비 중"이 되지 않는다.
    if (proj.status === "preparing" && status === "selecting" && proj.include_original) {
      const { data: activated, error: activateErr } = await admin.rpc("activate_project_with_original_archive", {
        p_project_id: projectId,
      });
      if (activateErr) {
        console.error("[PATCH project status] atomic activation failed", activateErr);
        return NextResponse.json({ error: "원본 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
      }
      if (!activated) {
        const [incompleteResult, processingResult] = await Promise.all([
          admin
            .from("photos")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .or("original_status.is.null,original_status.neq.completed"),
          admin
            .from("photos")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .in("original_status", ["pending", "processing"]),
        ]);
        if (incompleteResult.error || processingResult.error) {
          console.error(
            "[PATCH project status] original state classification failed",
            incompleteResult.error ?? processingResult.error,
          );
          return NextResponse.json(
            { error: "원본 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
            { status: 500 },
          );
        }

        const incompleteCount = incompleteResult.count ?? 0;
        const processingCount = processingResult.count ?? 0;
        const recoveryCount = Math.max(0, incompleteCount - processingCount);

        // PUT/confirm까지 끝난 pending·processing은 worker의 다음 폴링에서 자동 완료된다.
        // 실제 재업로드가 필요한 awaiting_upload/failed/null과 같은 복구 문구를 보여주지 않는다.
        if (incompleteCount > 0 && recoveryCount === 0) {
          return NextResponse.json(
            {
              error: `원본 ${processingCount}장의 상태를 확인 중입니다. 확인이 끝나면 자동으로 고객 링크를 활성화합니다.`,
              code: "originals_processing",
              processingCount,
              retryAfterMs: 1000,
            },
            { status: 409 },
          );
        }

        return NextResponse.json(
          {
            error: `원본 업로드 미완료 ${recoveryCount || incompleteCount || 1}장을 먼저 복구해주세요. 고객 링크는 모든 원본이 완료된 뒤 활성화할 수 있습니다.`,
            code: "originals_incomplete",
            incompleteCount: recoveryCount || incompleteCount || null,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ status });
    }

    // 원본은 ZIP이 아니라 R2 객체를 직접 제공한다. 고객 링크를 여는 순간부터 30일을 계산한다.
    if (
      proj.status === "preparing" &&
      status === "selecting" &&
      !proj.original_download_started_at
    ) {
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
