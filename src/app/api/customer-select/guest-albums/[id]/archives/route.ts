import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { callGuestStorage, getOwnedGuestAlbum, guestDatabaseError, guestExpired, getGuestUploadLimits } from "@/lib/guest-album-server";
import { allRows } from "@/lib/supabase-all-rows";

type Context = { params: Promise<{ id: string }> };
export async function POST(_req: NextRequest, { params }: Context) {
  const owner = await getCurrentCustomerAuthId();
  if (!owner) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "앨범을 찾을 수 없어요." }, { status: 404 });
  const { data, error } = await getAdminClient().rpc("guest_owner_action", { p_album: id, p_owner: owner, p_action: "archive" });
  if (error) return NextResponse.json({ error: guestDatabaseError(error) ?? "다운로드를 준비하지 못했어요. 다시 시도해 주세요." }, { status: 409 });
  return NextResponse.json(data);
}

export async function GET(req: NextRequest, { params }: Context) {
  const owner = await getCurrentCustomerAuthId();
  if (!owner) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const album = await getOwnedGuestAlbum((await params).id, owner);
  if (!album) return NextResponse.json({ error: "앨범을 찾을 수 없어요." }, { status: 404 });
  if (guestExpired(album.wedding_date, (await getGuestUploadLimits()).retentionDays)) return NextResponse.json({ error: "보관 기간이 끝났어요." }, { status: 410 });
  const admin = getAdminClient();
  let query = admin.from("guest_archives").select("id").eq("album_id", album.id).order("created_at", { ascending: false }).limit(1);
  const job = req.nextUrl.searchParams.get("archiveId");
  if (job) {
    if (!/^[0-9a-f-]{36}$/i.test(job)) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
    query = query.eq("id", job);
  }
  try {
    const { data: archive, error } = await query.maybeSingle();
    if (error) throw error;
    if (!archive) return NextResponse.json({ archiveId: null, parts: [] });
    const parts = await allRows<{ id: string; part_number: number; status: string; processed_bytes: number; total_bytes: number; object_key: string | null }>((from, to) =>
      admin.from("guest_archive_parts").select("id, part_number, status, processed_bytes, total_bytes, object_key").eq("archive_id", archive.id).order("part_number").range(from, to));
    const keys = parts.filter((p) => p.status === "ready" && p.object_key).map((p) => p.object_key!);
    const urls: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 30) Object.assign(urls, (await callGuestStorage<{ urls: Record<string, string> }>("archive-urls", { keys: keys.slice(i, i + 30) })).urls);
    return NextResponse.json({ archiveId: archive.id, parts: parts.map(({ object_key, ...p }) => ({ ...p, url: object_key ? urls[object_key] : null })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[guest archives]", error);
    return NextResponse.json({ error: "다운로드 상태를 읽지 못했어요. 다시 시도해 주세요." }, { status: 503 });
  }
}
