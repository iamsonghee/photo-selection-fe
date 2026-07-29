import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin-emails";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

/**
 * 관리자 전용 POC — FE UI 숨김과 별개로 서버에서도 관리자 이메일을 재검증한다.
 * gemini-analysis/route.ts, gemini-quality/route.ts와 동일 패턴.
 */
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
 * GET /api/photographer/projects/[id]/gemini-quality/overview
 * 유사컷 그룹 소속 여부와 무관하게 프로젝트 전체 사진의 Flash 품질 판정을 조회.
 * 저장된 결과만 읽으므로 Gemini API를 다시 호출하지 않는다.
 */
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
    const auth = await getAdminPhotographerIdFromSession();
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error === "forbidden" ? "Forbidden" : "Unauthorized" },
        { status: auth.error === "forbidden" ? 403 : 401 }
      );
    }

    const owns = await assertProjectOwnership(projectId, auth.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/quality/${projectId}/overview`, {
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[GET gemini-quality/overview]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
