import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin-emails";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";

/** clip-service 실패 응답 상태 코드 → 사용자 노출용 한국어 메시지 */
const GEMINI_ERROR_MESSAGES: Record<number, string> = {
  404: "프로젝트를 찾을 수 없습니다.",
  409: "이미 분석이 진행 중입니다.",
  503: "분석 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
};
const GEMINI_ERROR_FALLBACK = "분석 시작에 실패했습니다. 잠시 후 다시 시도해주세요.";

/**
 * 실제 비용이 발생하는 관리자 전용 POC라 FE의 UI 숨김만으로는 부족하다 — 로그인 세션의
 * 이메일로 서버에서도 관리자 여부를 재검증한다(클라이언트 tier 체크를 우회해도 통과 못 함).
 * gemini-analysis/route.ts와 동일 패턴.
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

/** POST /api/photographer/projects/[id]/gemini-quality — Gemini Flash 품질 판정 POC 시작 트리거 */
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
    const auth = await getAdminPhotographerIdFromSession();
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error === "forbidden" ? "Forbidden" : "Unauthorized" },
        { status: auth.error === "forbidden" ? 403 : 401 }
      );
    }

    const owns = await assertProjectOwnership(projectId, auth.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    const force = body?.force === true;

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/quality`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": CLIP_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ project_id: projectId, limit, force }),
    });

    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      const detail = (respBody as { detail?: string }).detail;
      return NextResponse.json(
        { error: GEMINI_ERROR_MESSAGES[res.status] ?? GEMINI_ERROR_FALLBACK, detail },
        { status: res.status }
      );
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[POST gemini-quality]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/photographer/projects/[id]/gemini-quality — Gemini Flash 품질 판정 취소 */
export async function DELETE(
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

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/quality/${projectId}`, {
      method: "DELETE",
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[DELETE gemini-quality]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** GET /api/photographer/projects/[id]/gemini-quality — Gemini Flash 품질 판정 진행 상태 조회 */
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

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/quality/${projectId}/status`, {
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[GET gemini-quality]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
