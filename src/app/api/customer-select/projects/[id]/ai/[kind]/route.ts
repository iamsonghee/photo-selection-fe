import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";
const AI_KINDS = new Set(["scene", "similarity", "quality"]);

const nameList = (names: unknown): string[] | undefined =>
  Array.isArray(names) && names.length > 0 && names.length <= 30 && names.every((name) => typeof name === "string" && name.length > 0 && name.length <= 40)
    ? names as string[] : undefined;

/** 단계별 판단 기준(웨딩 본식): 라벨 목록에 있는 이름의 짧은 문자열만 받는다(판정 문구에 들어간다). */
const hintMap = (hints: unknown, names: string[] | undefined): Record<string, string> | undefined => {
  if (!names || !hints || typeof hints !== "object" || Array.isArray(hints)) return undefined;
  const entries = Object.entries(hints as Record<string, unknown>)
    .filter(([name, hint]) => names.includes(name) && typeof hint === "string" && hint.length > 0 && hint.length <= 200);
  return entries.length ? Object.fromEntries(entries) as Record<string, string> : undefined;
};

/** 사진마다 라벨로 장면을 나누는 옵션(장면·흔들림 확인 공통) — 라벨 목록, 장소(홈스냅)/단계(웨딩 본식), 단계별 판단 기준. */
function labelOptions(body: { placeNames?: unknown; placeBasis?: unknown; placeHints?: unknown } | null) {
  const names = nameList(body?.placeNames);
  const basis = names && (body?.placeBasis === "place" || body?.placeBasis === "stage") ? body.placeBasis : undefined;
  return { place_names: names, place_basis: basis, place_hints: basis === "stage" ? hintMap(body?.placeHints, names) : undefined };
}

/** 본식 단계(웨딩 본식 장면 정리만): 단계 목록에 있는 이름만 받는다. 카메라별 본식 범위·카메라 합치기에 쓴다. */
function mainStages(body: { placeMainStages?: unknown } | null, options: ReturnType<typeof labelOptions>) {
  const main = options.place_basis === "stage" ? nameList(body?.placeMainStages)?.filter((name) => options.place_names!.includes(name)) : undefined;
  return main?.length ? main : undefined;
}

/** FE 카탈로그 옵션 — 장면: 이름 목록·경계 공백(웨딩 본식은 본식 단계도), 장면·흔들림 확인: 라벨 옵션(홈스냅 장소·웨딩 본식 단계).
 * 형식이 맞지 않으면 버린다(이름·장소 없이, 기본 공백). */
async function optionsFrom(req: NextRequest, kind: string): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null) as {
    sceneNames?: unknown; sceneGapSeconds?: unknown; placeNames?: unknown; placeBasis?: unknown; placeHints?: unknown; placeMainStages?: unknown;
  } | null;
  if (kind === "quality") return labelOptions(body);
  if (kind !== "scene") return {};
  const gap = body?.sceneGapSeconds;
  const validGap = Number.isInteger(gap) && (gap as number) >= 30 && (gap as number) <= 1800;
  const options = labelOptions(body);
  return { scene_names: nameList(body?.sceneNames), scene_gap_seconds: validGap ? gap as number : undefined, ...options,
    place_main_stages: mainStages(body, options) };
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
