import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

/** POST: 최초 참여자는 빈 색을 선점하고, 이후에는 자기 슬롯의 이름/완료 상태를 갱신한다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, projectId, shareTokenFromRequest(req, projectId));
  if (access instanceof NextResponse) return access;

  const body = await req.json().catch(() => ({}));
  const { color, nickname, done, claim } = body as { color?: string; nickname?: string; done?: boolean; claim?: boolean };
  if (!VALID_COLORS.includes(color as ColorTag)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }
  const trimmedNickname = typeof nickname === "string" ? nickname.trim().slice(0, 20) : undefined;
  if (claim === true) {
    if (access.isOwner) return NextResponse.json({ error: "소유자에게는 초대 참여가 필요하지 않습니다." }, { status: 400 });
    if (!trimmedNickname) return NextResponse.json({ error: "닉네임을 입력해 주세요." }, { status: 400 });
    const { error } = await admin.from("customer_project_participants").insert({ project_id: projectId, color, nickname: trimmedNickname });
    if (error?.code === "23505") return NextResponse.json({ error: "방금 다른 참여자가 이 색을 선택했어요. 다른 색을 골라주세요." }, { status: 409 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = { project_id: projectId, color };
  if (trimmedNickname !== undefined) update.nickname = trimmedNickname;
  if (typeof done === "boolean") update.done = done;
  const query = access.isOwner
    ? admin.from("customer_project_participants").upsert([update], { onConflict: "project_id,color", defaultToNull: false })
    : admin.from("customer_project_participants").update(update).eq("project_id", projectId).eq("color", color);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
