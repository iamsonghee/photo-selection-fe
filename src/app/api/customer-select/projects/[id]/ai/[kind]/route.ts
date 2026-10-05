import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";
const AI_KINDS = new Set(["scene", "similarity", "quality"]);

const nameList = (names: unknown): string[] | undefined =>
  Array.isArray(names) && names.length > 0 && names.length <= 30 && names.every((name) => typeof name === "string" && name.length > 0 && name.length <= 40)
    ? names as string[] : undefined;

/** FE 카탈로그 옵션 — 장면: 이름 목록·경계 공백, 흔들림 확인: 장소 목록(홈스냅). 형식이 맞지 않으면 버린다(이름·장소 없이, 기본 공백). */
async function optionsFrom(req: NextRequest, kind: string): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null) as { sceneNames?: unknown; sceneGapSeconds?: unknown; placeNames?: unknown } | null;
  if (kind === "quality") return { place_names: nameList(body?.placeNames) };
  if (kind !== "scene") return {};
  const gap = body?.sceneGapSeconds;
  const validGap = Number.isInteger(gap) && (gap as number) >= 30 && (gap as number) <= 1800;
  return { scene_names: nameList(body?.sceneNames), scene_gap_seconds: validGap ? gap as number : undefined };
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
    body: JSON.stringify({ project_id: id, ...await optionsFrom(req, kind) }),
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
