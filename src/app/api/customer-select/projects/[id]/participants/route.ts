import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

/** POST: 참가자 슬롯(색) 표시용 명단/완료 표시 갱신 — project_participants와 동일 패턴. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, projectId, shareTokenFromRequest(req));
  if (access instanceof NextResponse) return access;

  const body = await req.json().catch(() => ({}));
  const { color, nickname, done } = body as { color?: string; nickname?: string; done?: boolean };
  if (!VALID_COLORS.includes(color as ColorTag)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }
  const update: Record<string, unknown> = { project_id: projectId, color };
  if (typeof nickname === "string") update.nickname = nickname.slice(0, 20);
  if (typeof done === "boolean") update.done = done;
  const { error } = await admin.from("customer_project_participants").upsert(update, { onConflict: "project_id,color" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
