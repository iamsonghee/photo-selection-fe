import { NextRequest, NextResponse } from "next/server";
import {
  validateTokenAndProject,
  assertPhotoBelongsToProject,
  upsertSelectionAdmin,
  toggleSelectionColorAdmin,
  getSelectionsOnlyAdmin,
} from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";
import type { ColorTag } from "@/types";

const VALID_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

// 폴링(GET)이 어떤 계층(브라우저/CDN/Next)에서도 캐시되어 오래된 값을 돌려주지 않도록 강제한다.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id, photo_id, rating, color_tag, comment, is_selected, color_op } = body;
    if (!token || !project_id || !photo_id) {
      return NextResponse.json(
        { error: "token, project_id, photo_id required" },
        { status: 400 }
      );
    }
    // ── 공통 선행 검증(is_selected/rating/comment/color_op 전부 적용) ──────────
    const pinErr = checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    const admin = getAdminClient();
    // 유효한 고객 링크만으로 photo_id를 다른 프로젝트 사진으로 바꿔 저장하는 것을
    // 막는 접근 통제 검증 — 색상 경로만이 아니라 이 라우트의 모든 mutation에 공통 적용.
    const photoOk = await assertPhotoBelongsToProject(admin, photo_id, project_id);
    if (!photoOk) {
      return NextResponse.json({ error: "Photo does not belong to project" }, { status: 403 });
    }
    if (project.status !== "selecting" && project.status !== "preparing") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }
    if (color_op && color_tag !== undefined) {
      return NextResponse.json(
        { error: "color_op and color_tag are mutually exclusive" },
        { status: 400 }
      );
    }
    // 레거시 color_tag(전체교체) 필드 거부 — 신버전 클라이언트는 이 필드를 절대 보내지
    // 않으므로(color_op만 사용), 지금 이 필드가 온다는 것은 (a) 배포 직후 아직 남아있는
    // 구버전 JS 탭이거나 (b) 클라이언트를 거치지 않은 직접 호출뿐이다. color_op 도입 전에는
    // 이 필드로 배열을 통째로 덮어써 두 세션이 동시에 다른 색을 추가하면 한쪽이 유실되는
    // lost-update가 있었으므로, 계속 허용하면 이 라우트를 우회해 그 버그를 재현하는 셈이 된다.
    // 다만 마이그레이션 직후 배포 전환 구간(구버전 탭의 저장이 트리거를 통해 안전하게
    // color_tags로 동기화되어야 하는 기간)에는 이 거부가 그 전환 안전장치를 무력화하므로,
    // 전환이 끝나 레거시 쓰기가 0건임을 운영에서 확인한 뒤에만 REJECT_LEGACY_COLOR_TAG=true로
    // 켠다. 켜기 전까지는 기존과 동일하게 트리거를 통해 안전히 동기화된다.
    if (color_tag !== undefined && process.env.REJECT_LEGACY_COLOR_TAG === "true") {
      return NextResponse.json(
        { error: "color_tag is no longer supported; use color_op" },
        { status: 400 }
      );
    }

    if (color_op) {
      const { color, add } = color_op as { color?: string; add?: boolean };
      if (!VALID_COLORS.includes(color as ColorTag) || typeof add !== "boolean") {
        return NextResponse.json({ error: "Invalid color_op" }, { status: 400 });
      }
      const colorTags = await toggleSelectionColorAdmin(admin, {
        project_id,
        photo_id,
        color: color as ColorTag,
        add,
      });
      return NextResponse.json({ ok: true, colorTags });
    }

    // rating/color_tag/comment는 body에 키 자체가 없으면 undefined로 들어와
    // upsertSelectionAdmin이 해당 필드를 건드리지 않는다 — 필드 하나만 바뀌어도
    // 로컬에 캐시된 다른 필드 값 전체를 재전송하던 과거 방식이 다른 세션의
    // 변경사항을 덮어쓰는 문제가 있어, 실제로 바뀐 필드만 보내는 것을 전제로 한다.
    // color_tag(레거시 전체교체 필드)는 배포 전환 구간 동안만 트리거를 통해 color_tags에
    // 동기화되며, 신버전 클라이언트는 더 이상 이 필드를 보내지 않는다(color_op만 사용).
    await upsertSelectionAdmin(admin, {
      project_id,
      photo_id,
      rating,
      color_tag,
      comment,
      is_selected: typeof is_selected === "boolean" ? is_selected : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/selections POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** 폴링용 경량 조회 — selections만 반환(사진/그룹은 GET /api/c/photos에서 별도 조회). */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!token?.trim() || !projectId?.trim()) {
      return NextResponse.json(
        { error: "token, project_id required" },
        { status: 400 }
      );
    }
    const pinErr = checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, projectId);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    const admin = getAdminClient();
    const { selectedIds, photoStates } = await getSelectionsOnlyAdmin(admin, projectId);
    return NextResponse.json(
      {
        selectedIds: Array.from(selectedIds),
        photoStates,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[api/c/selections GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
