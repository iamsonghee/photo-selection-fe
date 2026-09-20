import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

/**
 * POST: 사진 하나의 셀렉 상태 변경. rating/comment/is_selected는 upsert,
 * color_op(찜 추가/제거)는 여러 참가자 동시 조작 시 lost-update를 피하려고
 * 원자적 RPC(toggle_customer_selection_color)로 처리한다(작가 플로우와 동일 패턴).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, projectId, shareTokenFromRequest(req, projectId));
  if (access instanceof NextResponse) return access;

  const body = await req.json().catch(() => ({}));
  const { photo_id, rating, comment, is_selected, color_op } = body as {
    photo_id?: string;
    rating?: number | null;
    comment?: string | null;
    is_selected?: boolean;
    color_op?: { color?: string; add?: boolean };
  };
  if (!photo_id) {
    return NextResponse.json({ error: "photo_id가 필요합니다." }, { status: 400 });
  }
  const photoCheck = await admin.from("customer_photos").select("id").eq("id", photo_id).eq("project_id", projectId).maybeSingle();
  if (!photoCheck.data) {
    return NextResponse.json({ error: "이 프로젝트의 사진이 아닙니다." }, { status: 403 });
  }

  if (color_op) {
    const { color, add } = color_op;
    if (!VALID_COLORS.includes(color as ColorTag) || typeof add !== "boolean") {
      return NextResponse.json({ error: "Invalid color_op" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("toggle_customer_selection_color", {
      p_project_id: projectId,
      p_photo_id: photo_id,
      p_color: color,
      p_add: add,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, colorTags: data });
  }

  const update: Record<string, unknown> = { project_id: projectId, photo_id };
  if (typeof is_selected === "boolean") update.is_selected = is_selected;
  if (rating !== undefined) update.rating = rating;
  if (comment !== undefined) update.comment = comment;
  if (Object.keys(update).length > 2) {
    const { error } = await admin.from("customer_selections").upsert(update, { onConflict: "project_id,photo_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
