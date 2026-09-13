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
 * 품질 판정(눈감음·흔들림)은 이제 모든 작가가 쓰는 기능이라 세션 + 소유권만 검증한다.
 *
 * 2026-09-12까지는 관리자 이메일까지 확인하는 POC 전용 경로였다. 품질 결과를 작가·고객 갤러리에
 * 배지로 꺼내면서(§photo-quality) 일반 경로가 됐다 — 유사컷(`gemini-analysis`)이 베타 전환 때
 * 밟은 것과 같은 전환이고, 검증 강도도 그쪽과 같아졌다.
 *
 * ⚠️ 호출마다 Gemini 비용이 발생한다. 관리자 게이트가 사라진 만큼 **한도는 등급 정책이 맡아야
 * 한다** — 지금은 별도 한도가 없다(clip-service의 프로젝트 동시 실행 세마포어만 있다).
 */
async function getAdminPhotographerIdFromSession(): Promise<
  { photographerId: string; isAdmin: boolean } | { error: "unauthenticated" | "forbidden" }
> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: "unauthenticated" };
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  if (!data?.id) return { error: "unauthenticated" };
  /* 관리자 여부는 접근 차단이 아니라 **`force` 허용 여부**에만 쓴다 — 분석 자체는 모든 작가가 한다 */
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
    /* `force`는 저장된 판정 캐시(같은 model+prompt_version)를 무시하고 **전량 재판정**시키는
     * 운영 스위치다. 캐시 덕분에 "사진 수 = 비용 상한"이 성립하는데 force는 그 상한을 없앤다 —
     * 화면에는 없는 스위치지만 API가 본문에서 그대로 읽으므로 관리자에게만 허용한다
     * (유사컷 `gemini-analysis` 라우트와 같은 규칙). */
    const force = auth.isAdmin && body?.force === true;

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
