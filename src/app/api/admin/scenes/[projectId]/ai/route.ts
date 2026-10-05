import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { customerPlaceNames, customerSceneCatalog, customerSceneGapSeconds } from "@/lib/customer-shoot-scenes";

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL ?? "";
const CLIP_INTERNAL_TOKEN = process.env.CLIP_INTERNAL_TOKEN ?? "";
// 고객의 "AI로 정리하고 고르기"와 같은 세 가지(AiTidySheet AI_TIDY_KINDS).
const KINDS = ["scene", "similarity", "quality"] as const;

const names = (list: readonly string[] | undefined) => (list?.length ? list : undefined);

/** 고객 버튼(startAiTidy → /api/customer-select/projects/[id]/ai/[kind])이 보내는 옵션과 같게 만든다. */
function optionsFor(kind: (typeof KINDS)[number], shootType: string | null) {
  if (kind === "scene") return { scene_names: names(customerSceneCatalog(shootType)), scene_gap_seconds: customerSceneGapSeconds(shootType) };
  if (kind === "quality") return { place_names: names(customerPlaceNames(shootType)) };
  return {};
}

const clip = (path: string, init?: RequestInit) => fetch(`${CLIP_SERVICE_URL}${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", "X-Internal-Token": CLIP_INTERNAL_TOKEN, ...init?.headers },
});

async function guard(projectId: string) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CLIP_SERVICE_URL || !CLIP_INTERNAL_TOKEN) return NextResponse.json({ error: "분석 서비스가 설정되지 않았습니다." }, { status: 503 });
  const { data: project } = await getAdminClient().from("customer_projects").select("id, shoot_type").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  return project as { id: string; shoot_type: string | null };
}

/**
 * POST /api/admin/scenes/[projectId]/ai — 관리자 전용. 셀프 고객 프로젝트에 AI 정리(장면·유사컷·흔들림)를 시작한다.
 * 장면 검수용이지만 결과는 고객의 실제 장면으로 저장돼 고객 고르기 화면에도 그대로 보인다(고객이 직접 누른 것과 같다).
 * 이미 진행 중인 작업(409)은 시작한 것으로 친다.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const project = await guard((await params).projectId);
  if (project instanceof NextResponse) return project;
  const responses = await Promise.all(KINDS.map((kind) => clip(`/analyze/customer/${kind}`, {
    method: "POST",
    body: JSON.stringify({ project_id: project.id, ...optionsFor(kind, project.shoot_type) }),
  }).catch(() => null)));
  const failed = KINDS.filter((_, index) => !(responses[index]?.ok || responses[index]?.status === 409));
  return NextResponse.json({ failed }, { status: failed.length === KINDS.length ? 502 : 200 });
}

/** GET — 세 작업의 상태(processing·completed·failed·null). */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const project = await guard((await params).projectId);
  if (project instanceof NextResponse) return project;
  const statuses = await Promise.all(KINDS.map(async (kind) => {
    const response = await clip(`/analyze/customer/${kind}/${project.id}/status`).catch(() => null);
    return response?.ok ? ((await response.json()) as { status?: string | null }).status ?? null : "failed";
  }));
  return NextResponse.json(Object.fromEntries(KINDS.map((kind, index) => [kind, statuses[index]])));
}
