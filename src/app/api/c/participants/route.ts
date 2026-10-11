import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";
import type { ColorTag } from "@/types";

const COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];
const ONLINE_WINDOW_MS = 30_000;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!token || !projectId) return NextResponse.json({ error: "token, project_id required" }, { status: 400 });
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  if (auth.project?.id !== projectId) return NextResponse.json({ error: "Invalid project" }, { status: 403 });
  const { data, error } = await getAdminClient().from("project_participants")
    .select("color, nickname, done, last_seen_at").eq("project_id", projectId);
  if (error) return NextResponse.json({ error: "참여 정보를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ participants: (data ?? []).map((row) => ({
    color: row.color, nickname: row.nickname, done: row.done,
    online: Boolean(row.last_seen_at && Date.now() - Date.parse(row.last_seen_at) < ONLINE_WINDOW_MS),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || typeof body.project_id !== "string") {
    return NextResponse.json({ error: "token, project_id required" }, { status: 400 });
  }
  const { token, project_id, color, nickname, done, action = "update" } = body;
  if (!["join", "update", "heartbeat"].includes(action)
    || (action !== "join" && !COLORS.includes(color))
    || (nickname !== undefined && (typeof nickname !== "string" || nickname.trim().length > 20))
    || (done !== undefined && typeof done !== "boolean")) {
    return NextResponse.json({ error: "참여 정보를 확인해 주세요." }, { status: 400 });
  }
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  if (auth.project?.id !== project_id) return NextResponse.json({ error: "Invalid project" }, { status: 403 });
  const admin = getAdminClient();
  const now = new Date().toISOString();
  if (action === "join") {
    if (!nickname?.trim()) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    for (const slot of COLORS) {
      const { error } = await admin.from("project_participants").insert({ project_id, color: slot, nickname: nickname.trim(), last_seen_at: now });
      if (!error) return NextResponse.json({ color: slot, nickname: nickname.trim() });
      if (error.code !== "23505") return NextResponse.json({ error: "참여 정보를 저장하지 못했어요." }, { status: 500 });
    }
    return NextResponse.json({ error: "다섯 명이 이미 참여 중이에요. 이전에 참여했다면 이름을 선택해 주세요." }, { status: 409 });
  }
  if (action === "heartbeat") {
    const { error } = await admin.from("project_participants").update({ last_seen_at: now }).eq("project_id", project_id).eq("color", color);
    if (error) return NextResponse.json({ error: "접속 상태를 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // 기존 브라우저의 색을 그대로 이어받고, 보내지 않은 이름·완료 값은 보존한다.
  const update: Record<string, unknown> = { project_id, color, updated_at: now, last_seen_at: now };
  if (nickname !== undefined) update.nickname = nickname.trim();
  if (done !== undefined) update.done = done;
  const { error } = await admin.from("project_participants").upsert([update], { onConflict: "project_id,color", defaultToNull: false });
  if (error) return NextResponse.json({ error: "참여 정보를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
