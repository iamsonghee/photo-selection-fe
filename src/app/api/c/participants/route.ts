import { NextRequest, NextResponse } from "next/server";
import { validateTokenAndProject } from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];
/** 화면에는 1~2글자만 노출하지만 조합 중 입력이 잠깐 길어질 수 있어 저장 단계에서 잘라낸다. */
const NICKNAME_MAX = 20;

// 참가자 이름은 다른 기기가 방금 바꿨을 수 있어 캐시하지 않는다.
export const dynamic = "force-dynamic";

/** GET /api/c/participants?token=&project_id= — 프로젝트의 (색 → 표시 이름) 명단 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!token || !projectId) {
    return NextResponse.json({ error: "token, project_id required" }, { status: 400 });
  }

  const pinErr = await checkPinAuth(req, token);
  if (pinErr) return pinErr;
  const project = await validateTokenAndProject(token, projectId);
  if (!project) {
    return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("project_participants")
    .select("color, nickname")
    .eq("project_id", projectId);

  if (error) {
    console.error("[c/participants GET]", error);
    return NextResponse.json({ error: "Failed to load participants" }, { status: 500 });
  }

  return NextResponse.json({ participants: data ?? [] });
}

/** POST /api/c/participants — 내 색의 표시 이름을 저장(같은 색이면 덮어쓴다) */
export async function POST(req: NextRequest) {
  try {
    const { token, project_id: projectId, color, nickname } = await req.json();
    if (!token || !projectId || !color) {
      return NextResponse.json({ error: "token, project_id, color required" }, { status: 400 });
    }
    if (!VALID_COLORS.includes(color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }

    const pinErr = await checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, projectId);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }

    const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, NICKNAME_MAX) : "";

    const admin = getAdminClient();
    const { error } = await admin
      .from("project_participants")
      .upsert(
        { project_id: projectId, color, nickname: trimmed, updated_at: new Date().toISOString() },
        { onConflict: "project_id,color" },
      );

    if (error) {
      console.error("[c/participants POST]", error);
      return NextResponse.json({ error: "Failed to save participant" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[c/participants POST]", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 500 });
  }
}
