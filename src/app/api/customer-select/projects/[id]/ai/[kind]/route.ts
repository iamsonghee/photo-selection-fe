import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";
const AI_KINDS = new Set(["scene", "similarity", "quality"]);

/** 촬영 종류의 장면 이름 목록(FE 카탈로그). 형식이 맞지 않으면 버리고 이름 없이 장면만 만든다. */
async function sceneNamesFrom(req: NextRequest): Promise<string[] | undefined> {
  const body = await req.json().catch(() => null) as { sceneNames?: unknown } | null;
  const names = body?.sceneNames;
  if (!Array.isArray(names) || names.length === 0 || names.length > 30) return undefined;
  return names.every((name) => typeof name === "string" && name.length > 0 && name.length <= 40) ? names as string[] : undefined;
}

async function authorize(req: NextRequest, id: string) {
  return resolveCustomerProjectAccess(getAdminClient(), id, shareTokenFromRequest(req, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  if (!AI_KINDS.has(kind)) return NextResponse.json({ error: "Unknown analysis kind" }, { status: 404 });
  const access = await authorize(req, id);
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 AI 분석을 시작할 수 있습니다." }, { status: 403 });
  const res = await fetch(`${CLIP_SERVICE_URL}/analyze/customer/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    body: JSON.stringify({ project_id: id, scene_names: kind === "scene" ? await sceneNamesFrom(req) : undefined }),
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  if (!AI_KINDS.has(kind)) return NextResponse.json({ error: "Unknown analysis kind" }, { status: 404 });
  const access = await authorize(req, id);
  if (access instanceof NextResponse) return access;
  const res = await fetch(`${CLIP_SERVICE_URL}/analyze/customer/${kind}/${id}/status`, {
    headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
