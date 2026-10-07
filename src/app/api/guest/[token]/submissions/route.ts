import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { GuestRequestError, authorizeGuest, deviceHash, ensureGuestDeviceKey } from "@/lib/guest-album-server";
import { GUEST_MESSAGE_MAX, GUEST_NAME_MAX } from "@/lib/guest-album";

/** POST: 하객이 한 번 보낼 때의 묶음(이름·축하 메시지). 브라우저 식별 쿠키가 없으면 여기서 심는다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!name || name.length > GUEST_NAME_MAX) return NextResponse.json({ error: "이름이나 별명을 확인해 주세요." }, { status: 400 });
  if (message.length > GUEST_MESSAGE_MAX) return NextResponse.json({ error: `축하 메시지는 ${GUEST_MESSAGE_MAX}자까지 쓸 수 있어요.` }, { status: 400 });

  try {
    const { album } = await authorizeGuest(token);
    const deviceKey = await ensureGuestDeviceKey();
    const { data, error } = await getAdminClient().from("guest_submissions")
      .insert({ album_id: album.id, device_hash: deviceHash(album.id, deviceKey), name, message: message || null })
      .select("id").single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ submissionId: data.id });
  } catch (error) {
    if (error instanceof GuestRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[guest submissions]", error);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
