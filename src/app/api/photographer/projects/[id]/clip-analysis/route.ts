import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

async function assertProjectOwnership(
  projectId: string,
  photographerId: string
): Promise<boolean> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, photographer_id")
    .eq("id", projectId)
    .single();
  return !!data && data.photographer_id === photographerId;
}

/** POST /api/photographer/projects/[id]/clip-analysis — AI 유사컷 분석 시작 트리거 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": CLIP_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ project_id: projectId }),
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[POST clip-analysis]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** GET /api/photographer/projects/[id]/clip-analysis — 분석 진행 상태 조회 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/${projectId}/status`, {
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[GET clip-analysis]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
