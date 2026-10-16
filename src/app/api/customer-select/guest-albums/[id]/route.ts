import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { guestDatabaseError } from "@/lib/guest-album-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  if (body?.action === "select" && typeof body.selected === "boolean" && /^[0-9a-f-]{36}$/i.test(body.mediaId)) {
    return action((await params).id, "select", { p_media: body.mediaId, p_selected: body.selected });
  }
  if (body?.action === "date" && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    && Number.isFinite(Date.parse(body.date)) && new Date(body.date).toISOString().slice(0, 10) === body.date) {
    return action((await params).id, "date", { p_date: body.date });
  }
  return NextResponse.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return action((await params).id, "delete");
}

async function action(id: string, name: string, args = {}) {
  const owner = await getCurrentCustomerAuthId();
  if (!owner) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "앨범을 찾을 수 없어요." }, { status: 404 });
  const { data, error } = await getAdminClient().rpc("guest_owner_action", { p_album: id, p_owner: owner, p_action: name, ...args });
  if (error) return NextResponse.json({ error: guestDatabaseError(error) ?? "저장하지 못했어요. 다시 시도해 주세요." }, { status: error.message.includes("guest_not_found") ? 404 : 409 });
  return NextResponse.json(data);
}
