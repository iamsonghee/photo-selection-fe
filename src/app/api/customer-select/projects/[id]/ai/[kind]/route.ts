import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

async function authorize(req: NextRequest, id: string) {
  return resolveCustomerProjectAccess(getAdminClient(), id, shareTokenFromRequest(req, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  if (!new Set(["similarity", "quality"]).has(kind)) return NextResponse.json({ error: "Unknown analysis kind" }, { status: 404 });
  const access = await authorize(req, id);
  if (access instanceof NextResponse) return access;
  const res = await fetch(`${CLIP_SERVICE_URL}/analyze/customer/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    body: JSON.stringify({ project_id: id }),
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  if (!new Set(["similarity", "quality"]).has(kind)) return NextResponse.json({ error: "Unknown analysis kind" }, { status: 404 });
  const access = await authorize(req, id);
  if (access instanceof NextResponse) return access;
  const res = await fetch(`${CLIP_SERVICE_URL}/analyze/customer/${kind}/${id}/status`, {
    headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
