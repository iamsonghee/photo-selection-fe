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
  const { color } = await req.json().catch(() => ({}));
  if (!VALID_COLORS.includes(color as ColorTag)) return NextResponse.json({ error: "참여자 색을 확인해 주세요." }, { status: 400 });

  const { error } = await admin.from("customer_participant_presence").upsert({
    project_id: id,
    participant_color: color,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "project_id,participant_color" });
  if (error) return NextResponse.json({ error: "접속 상태를 갱신하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
