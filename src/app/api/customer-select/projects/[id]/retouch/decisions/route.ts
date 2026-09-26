import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

/** POST: 보정본 하나에 대한 판단(확정/재보정 요청+사유) 저장. S11. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, projectId, shareTokenFromRequest(req, projectId));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 보정본을 검토할 수 있습니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { version_id, decision, redo_reason } = body as {
    version_id?: string;
    decision?: "confirmed" | "redo";
    redo_reason?: string;
  };
  if (!version_id || (decision !== "confirmed" && decision !== "redo")) {
    return NextResponse.json({ error: "version_id, decision(confirmed|redo)가 필요합니다." }, { status: 400 });
  }
  if (decision === "redo" && !redo_reason?.trim()) {
    return NextResponse.json({ error: "재보정 요청에는 사유가 필요합니다." }, { status: 400 });
  }

  // 이 프로젝트 소유의 버전인지 확인 — customer_photo_versions → customer_photos → project_id 경로.
  const versionCheck = await admin
    .from("customer_photo_versions")
    .select("id, photo_id, customer_photos!inner(project_id)")
    .eq("id", version_id)
    .eq("customer_photos.project_id", projectId)
    .maybeSingle();
  if (!versionCheck.data) {
    return NextResponse.json({ error: "이 프로젝트의 보정본이 아닙니다." }, { status: 403 });
  }

  const { error } = await admin
    .from("customer_photo_versions")
    .update({ decision, redo_reason: decision === "redo" ? redo_reason!.trim() : null })
    .eq("id", version_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
