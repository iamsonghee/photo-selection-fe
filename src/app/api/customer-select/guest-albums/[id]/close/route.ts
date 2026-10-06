import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getOwnedGuestAlbum } from "@/lib/guest-album-server";

/** POST: 셀렉 시작 = 하객 업로드 마감. 이미 마감됐으면 그대로 성공. 다시 여는 기능은 없다. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authId = await getCurrentCustomerAuthId();
  if (!authId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;
  const album = await getOwnedGuestAlbum(id, authId);
  if (!album) return NextResponse.json({ error: "앨범을 찾을 수 없어요." }, { status: 404 });
  if (album.closed_at) return NextResponse.json({ closedAt: album.closed_at });

  const closedAt = new Date().toISOString();
  const { error } = await getAdminClient().from("guest_albums").update({ closed_at: closedAt }).eq("id", id).is("closed_at", null);
  if (error) {
    console.error("[guest-albums close]", error);
    return NextResponse.json({ error: "셀렉을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ closedAt });
}
