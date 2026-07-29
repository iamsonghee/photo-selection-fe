import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin-emails";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

/** 관리자 전용 POC — FE UI 숨김과 별개로 서버에서도 관리자 이메일을 재검증한다. */
async function getAdminPhotographerIdFromSession(): Promise<
  { photographerId: string } | { error: "unauthenticated" | "forbidden" }
> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: "unauthenticated" };
  if (!isAdminEmail(session.user.email)) return { error: "forbidden" };
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  if (!data?.id) return { error: "unauthenticated" };
  return { photographerId: data.id };
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
 * GET /api/photographer/projects/[id]/gemini-analysis/groups?threshold=0.8
 * 저장된 임베딩으로 그룹핑만 재계산 — Gemini API를 다시 호출하지 않는다(threshold 실험용).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const auth = await getAdminPhotographerIdFromSession();
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error === "forbidden" ? "Forbidden" : "Unauthorized" },
        { status: auth.error === "forbidden" ? 403 : 401 }
      );
    }

    const owns = await assertProjectOwnership(projectId, auth.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const threshold = req.nextUrl.searchParams.get("threshold");
    // include_quality=true는 클라이언트 입력을 그대로 전달하지 않고 이 라우트가 직접 고정한다 —
    // 이 라우트 자체가 이미 isAdminEmail 검증을 통과해야만 도달 가능한 관리자 전용 POC 경로이므로,
    // 여기 도달했다면 품질 반영 추천을 보여주는 게 항상 맞는 동작이다.
    const params2 = new URLSearchParams({ include_quality: "true" });
    if (threshold) params2.set("threshold", threshold);

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/${projectId}/groups?${params2}`, {
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[GET gemini-analysis/groups]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
