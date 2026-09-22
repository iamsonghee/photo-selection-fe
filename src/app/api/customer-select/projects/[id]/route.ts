import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { buildProjectView, resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import { createClient } from "@/lib/supabase/server";
import { isProjectShootType } from "@/lib/project-shoot-types";

export const dynamic = "force-dynamic";

/** GET: 프로젝트 전체 상태(사진·셀렉·참가자) 조회 — 소유자 또는 공유 링크 참가자. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  const { project } = access;

  const [photosRes, selectionsRes, participantsRes, qualityRes, opinionsRes] = await Promise.all([
    admin.from("customer_photos").select("id, filename, order_index, thumb_url, preview_url, similarity_group_id").eq("project_id", id),
    admin.from("customer_selections").select("photo_id, rating, color_tags, comment, is_selected").eq("project_id", id),
    admin.from("customer_project_participants").select("color, nickname, done").eq("project_id", id),
    admin.from("customer_quality_assessments").select("photo_id, eyes_closed, blur_or_shake, focus_issue, primary_subject_detected").eq("project_id", id),
    admin.from("customer_participant_opinions").select("photo_id, participant_color, rating, comment").eq("project_id", id),
  ]);
  if (photosRes.error || selectionsRes.error || participantsRes.error || qualityRes.error || opinionsRes.error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  const projectView = buildProjectView(project, photosRes.data ?? [], selectionsRes.data ?? [], participantsRes.data ?? [], qualityRes.data ?? [], opinionsRes.data ?? []);
  if (!access.isOwner) projectView.shareToken = "";
  return NextResponse.json(
    { project: projectView, isOwner: access.isOwner },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** PATCH: 전달 완료 플래그 또는 소유자용 프로젝트 기본정보 수정. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;

  const body = await req.json().catch(() => ({}));
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 수정할 수 있습니다." }, { status: 403 });
  if (typeof body.exported === "boolean" && body.name === undefined) {
    if (body.exported === access.project.exported) {
      return NextResponse.json({ project: {
        exported: access.project.exported,
        deliveryCount: access.project.delivery_count,
        lastDeliveredAt: access.project.last_delivered_at,
      } });
    }
    if (!body.exported && access.project.retouch_done) {
      return NextResponse.json({ error: "보정본 검토까지 완료한 프로젝트는 다시 선택할 수 없습니다." }, { status: 409 });
    }
    if (body.exported) {
      const { count } = await admin.from("customer_selections").select("photo_id", { count: "exact", head: true }).eq("project_id", id).eq("is_selected", true);
      if (!count) return NextResponse.json({ error: "전달할 사진을 먼저 선택해 주세요." }, { status: 400 });
    }
    const update = body.exported ? {
      exported: true,
      delivery_count: access.project.delivery_count + 1,
      last_delivered_at: new Date().toISOString(),
    } : { exported: false };
    const { data, error } = await admin.from("customer_projects")
      .update(update)
      .eq("id", id)
      .eq("owner_id", access.project.owner_id)
      .eq("exported", access.project.exported)
      .select("exported, delivery_count, last_delivered_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    return NextResponse.json({ project: { exported: data.exported, deliveryCount: data.delivery_count, lastDeliveredAt: data.last_delivered_at } });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const shootType = isProjectShootType(body.shootType) ? body.shootType : null;
  const target = Number.isFinite(body.target) && body.target > 0 ? Math.floor(body.target) : 0;
  const shootDate = optionalDate(body.shootDate);
  const selectionDeadline = optionalDate(body.selectionDeadline);
  const studioName = typeof body.studioName === "string" ? body.studioName.trim() || null : null;
  const photographerName = optionalText(body.photographerName, 100);
  const shootRegion = optionalText(body.shootRegion, 100);
  const shootLocation = optionalText(body.shootLocation, 150);
  if (!name || name.length > 60 || !shootType || target < 1 || shootDate === undefined || selectionDeadline === undefined || (studioName?.length ?? 0) > 100 || photographerName === undefined || shootRegion === undefined || shootLocation === undefined) {
    return NextResponse.json({ error: "프로젝트 정보를 확인해주세요." }, { status: 400 });
  }
  if (shootDate && selectionDeadline && selectionDeadline < shootDate) {
    return NextResponse.json({ error: "셀렉 마감일은 촬영일 이후로 설정해주세요." }, { status: 400 });
  }
  const { error } = await admin.from("customer_projects").update({ name, shoot_type: shootType, target_count: target, shoot_date: shootDate, selection_deadline: selectionDeadline, studio_name: studioName, photographer_name: photographerName, shoot_region: shootRegion, shoot_location: shootLocation }).eq("id", id).eq("owner_id", access.project.owner_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE: 소유자만 가능. BE가 DB cascade와 R2 이미지 정리를 함께 수행한다. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 삭제할 수 있습니다." }, { status: 403 });

  const { data: { session } } = await (await createClient()).auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const response = await fetch(`${backendUrl}/api/customer-upload/projects/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const text = await response.text();
  return new Response(text, { status: response.status, headers: { "Content-Type": "application/json" } });
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length <= maxLength ? text || null : undefined;
}
