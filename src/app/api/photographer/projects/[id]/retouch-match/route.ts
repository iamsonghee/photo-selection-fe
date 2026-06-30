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

/**
 * POST /api/photographer/projects/[id]/retouch-match
 * exact/fuzzy 매칭에 실패한 보정본을 CLIP 유사도로 매칭 — clip-service에 multipart proxy.
 */
export async function POST(
  req: NextRequest,
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

    const incomingForm = await req.formData();

    const proxyForm = new FormData();
    // project_id는 클라이언트 바디 값이 아니라 라우트 파라미터로 강제 — 위조 방지
    proxyForm.append("project_id", projectId);
    const photoIds = incomingForm.get("photo_ids");
    if (typeof photoIds === "string") proxyForm.append("photo_ids", photoIds);
    for (const entry of incomingForm.getAll("files")) {
      if (entry instanceof Blob) proxyForm.append("files", entry);
    }

    const res = await fetch(`${CLIP_SERVICE_URL}/match-retouch`, {
      method: "POST",
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
      body: proxyForm,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[POST retouch-match]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
