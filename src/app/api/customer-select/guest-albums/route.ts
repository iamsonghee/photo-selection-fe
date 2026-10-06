import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { newUploadToken } from "@/lib/guest-album-server";
import { GUEST_GREETING_MAX } from "@/lib/guest-album";

/** POST: 하객 앨범 생성. 로그인한 소유자만 가능. */
export async function POST(req: NextRequest) {
  const authId = await getCurrentCustomerAuthId();
  if (!authId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const weddingDate = validDate(body.weddingDate);
  const ceremonyTime = body.ceremonyTime ? validTime(body.ceremonyTime) : null;
  const venue = optionalText(body.venue, 100);
  const greeting = optionalText(body.greeting, GUEST_GREETING_MAX);
  if (!name || name.length > 60) return NextResponse.json({ error: "앨범 이름을 확인해 주세요." }, { status: 400 });
  if (!weddingDate) return NextResponse.json({ error: "결혼식 날짜를 확인해 주세요." }, { status: 400 });
  if (ceremonyTime === undefined || venue === undefined || greeting === undefined) {
    return NextResponse.json({ error: "입력한 정보를 확인해 주세요." }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("guest_albums")
    .insert({ owner_id: authId, name, wedding_date: weddingDate, ceremony_time: ceremonyTime, venue, greeting, upload_token: newUploadToken() })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[guest-albums POST]", error);
    return NextResponse.json({ error: "앨범을 만들지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length <= maxLength ? text || null : undefined;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function validTime(value: unknown): string | undefined {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}
