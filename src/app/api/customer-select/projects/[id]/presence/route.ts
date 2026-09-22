import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  const body = await req.json().catch(() => ({}));
  const { color } = body;
  if (!VALID_COLORS.includes(color as ColorTag)) return NextResponse.json({ error: "참여자 색을 확인해 주세요." }, { status: 400 });

  const update: Record<string, unknown> = {
    project_id: id,
    participant_color: color,
    last_seen_at: new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(body, "current_photo_id")) {
    const photoId = body.current_photo_id;
    if (photoId !== null && typeof photoId !== "string") return NextResponse.json({ error: "사진을 확인해 주세요." }, { status: 400 });
    if (photoId) {
      const photo = await admin.from("customer_photos").select("id").eq("project_id", id).eq("id", photoId).maybeSingle();
      if (!photo.data) return NextResponse.json({ error: "이 프로젝트의 사진이 아닙니다." }, { status: 403 });
    }
    update.current_photo_id = photoId;
    update.view_updated_at = new Date().toISOString();
  }
  const { error } = await admin.from("customer_participant_presence").upsert(update, { onConflict: "project_id,participant_color" });
  if (error) return NextResponse.json({ error: "접속 상태를 갱신하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
