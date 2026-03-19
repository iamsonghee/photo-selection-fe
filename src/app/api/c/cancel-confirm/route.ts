import { NextRequest, NextResponse } from "next/server";
import { validateTokenAndProject } from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";

const MAX_CUSTOMER_CANCELS = 3;

/** POST /api/c/cancel-confirm — 고객 확정 취소 (confirmed → selecting), customer_cancel_count +1, 최대 3회 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? body.access_token) as string | undefined;
    const project_id = body.project_id as string | undefined;
    if (!token?.trim() || !project_id) {
      return NextResponse.json(
        { error: "token, project_id required" },
        { status: 400 }
      );
    }
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    const admin = getAdminClient();

    const { data: row, error: selErr } = await admin
      .from("projects")
      .select("customer_cancel_count, status")
      .eq("id", project_id)
      .single();

    if (selErr || !row) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.status !== "confirmed") {
      return NextResponse.json(
        { error: "확정 취소는 셀렉 완료 상태에서만 가능합니다." },
        { status: 403 }
      );
    }
    const count = Number(row.customer_cancel_count ?? 0);
    if (count >= MAX_CUSTOMER_CANCELS) {
      return NextResponse.json(
        { error: "확정 취소는 최대 3회까지 가능합니다." },
        { status: 403 }
      );
    }

    const { data: updatedRows, error: updErr } = await admin
      .from("projects")
      .update({
        status: "selecting",
        customer_cancel_count: count + 1,
        confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project_id)
      .eq("status", "confirmed")
      .select("id");

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updatedRows?.length) {
      return NextResponse.json(
        { error: "이미 처리되었거나 확정 상태가 아닙니다." },
        { status: 409 }
      );
    }

    await admin.from("project_logs").insert({
      project_id,
      photographer_id: project.photographerId,
      action: "selecting",
    });
    return NextResponse.json({ ok: true, customer_cancel_count: count + 1 });
  } catch (e) {
    console.error("[api/c/cancel-confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
