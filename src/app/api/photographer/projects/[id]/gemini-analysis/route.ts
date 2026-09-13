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
 * 베타 전환(2026-07-28) 이후 이 라우트는 모든 작가의 "AI 유사도 분석" 버튼(upload/page.tsx)이
 * 호출하는 실사용 경로다 — 더 이상 관리자 전용 POC가 아니므로 일반 세션+소유권 검증만 한다.
 * 관리자 전용 품질(Flash) 조회는 별도로 분리된 `/groups`(include_quality) 라우트에서만 검증한다.
 */
async function getPhotographerIdFromSession(): Promise<
  { photographerId: string; isAdmin: boolean } | null
> {
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
  if (!data?.id) return null;
  return { photographerId: data.id, isAdmin: isAdminEmail(session.user.email) };
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

/** POST /api/photographer/projects/[id]/gemini-analysis — Gemini 유사컷 분석 POC 시작 트리거 */
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
    const session = await getPhotographerIdFromSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, session.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    /* `force`는 저장된 임베딩 캐시를 무시하고 **전량 재분석**시키는 운영 스위치다(모델/프롬프트
     * 교체 시 사용). 캐시가 있기 때문에 "사진 수 = 비용 상한"이 성립하는데, force가 켜지면
     * 그 상한이 사라진다 — 화면에는 이 스위치가 없지만 API는 본문에서 그대로 읽으므로
     * 일반 세션이 직접 호출해 반복 과금시킬 수 있었다. 관리자에게만 허용한다. */
    const force = session.isAdmin && body?.force === true;

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini`, {
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
    console.error("[POST gemini-analysis]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/photographer/projects/[id]/gemini-analysis — Gemini 분석 취소 */
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
    const session = await getPhotographerIdFromSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, session.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/${projectId}`, {
      method: "DELETE",
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[DELETE gemini-analysis]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** GET /api/photographer/projects/[id]/gemini-analysis — Gemini 분석 진행 상태 조회 */
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
    const session = await getPhotographerIdFromSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, session.photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const res = await fetch(`${CLIP_SERVICE_URL}/analyze/gemini/${projectId}/status`, {
      headers: { "X-Internal-Token": CLIP_INTERNAL_TOKEN },
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[GET gemini-analysis]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
