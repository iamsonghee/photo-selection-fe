import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { GuestRequestError, authorizeGuest, callGuestStorage, getGuestAlbumByToken } from "@/lib/guest-album-server";

/**
 * POST: 브라우저가 R2에 다 올렸다고 알린다. 서버가 R2에서 원본 크기를 확인한 뒤에만 신랑신부 화면에 보인다(ready).
 * 썸네일·미리보기는 없어도 된다(만들지 못한 기기) — 없으면 키를 비운다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";

  try {
    const admin = getAdminClient();
    let authorized;
    try {
      authorized = await authorizeGuest(token, submissionId);
    } catch (error) {
      // 올리는 사이에 마감됐으면 올라간 파일을 지우고 마감을 알린다.
      if (error instanceof GuestRequestError && error.code === "closed") await discardPending(token, id, submissionId);
      throw error;
    }
    const { data: media } = await admin.from("guest_media")
      .select("id, size_bytes, original_key, thumb_key, preview_key, status")
      .eq("id", id).eq("album_id", authorized.album.id).eq("submission_id", authorized.submission!.id).maybeSingle();
    if (!media) throw new GuestRequestError(404, "not_found", "처음부터 다시 보내 주세요.");
    if (media.status === "ready") return NextResponse.json({ ok: true });

    const keys = [media.original_key, media.thumb_key, media.preview_key].filter((key): key is string => Boolean(key));
    const { sizes } = await callGuestStorage<{ sizes: Record<string, number | null> }>("head", { keys });
    if (sizes[media.original_key] !== media.size_bytes) {
      throw new GuestRequestError(409, "incomplete", "파일이 다 올라가지 않았어요. 다시 보내 주세요.");
    }
    // ponytail: 마감 확인과 ready 전환 사이의 아주 짧은 경합은 허용한다(마감 직후 1건이 더 보일 수 있음).
    const { error } = await admin.from("guest_media").update({
      status: "ready",
      thumb_key: media.thumb_key && sizes[media.thumb_key] ? media.thumb_key : null,
      preview_key: media.preview_key && sizes[media.preview_key] ? media.preview_key : null,
    }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GuestRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[guest media complete]", error);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

async function discardPending(token: string, id: string, submissionId: string) {
  try {
    const album = await getGuestAlbumByToken(token);
    if (!album) return;
    const admin = getAdminClient();
    const { data } = await admin.from("guest_media").select("original_key, thumb_key, preview_key")
      .eq("id", id).eq("album_id", album.id).eq("submission_id", submissionId).eq("status", "pending").maybeSingle();
    if (!data) return;
    await callGuestStorage("delete", { keys: [data.original_key, data.thumb_key, data.preview_key].filter(Boolean) });
    await admin.from("guest_media").delete().eq("id", id).eq("status", "pending");
  } catch (error) {
    console.warn("[guest media discard after close]", error);
  }
}
