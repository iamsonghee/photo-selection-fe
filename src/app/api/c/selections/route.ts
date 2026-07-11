import { NextRequest, NextResponse } from "next/server";
import {
  validateTokenAndProject,
  upsertSelectionAdmin,
} from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkPinAuth } from "@/lib/customer-auth-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id, photo_id, rating, color_tag, comment, is_selected } = body;
    if (!token || !project_id || !photo_id) {
      return NextResponse.json(
        { error: "token, project_id, photo_id required" },
        { status: 400 }
      );
    }
    const pinErr = checkPinAuth(req, token);
    if (pinErr) return pinErr;
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    if (project.status !== "selecting" && project.status !== "preparing") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }
    const admin = getAdminClient();
    await upsertSelectionAdmin(admin, {
      project_id,
      photo_id,
      rating: rating ?? null,
      color_tag: color_tag ?? null,
      comment: comment ?? null,
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
