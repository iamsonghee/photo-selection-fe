import { NextRequest, NextResponse } from "next/server";
import {
  validateTokenAndProject,
  upsertSelectionAdmin,
  deleteSelectionAdmin,
} from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id, photo_id, rating, color_tag, comment } = body;
    if (!token || !project_id || !photo_id) {
      return NextResponse.json(
        { error: "token, project_id, photo_id required" },
        { status: 400 }
      );
    }
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

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body.token ?? req.nextUrl.searchParams.get("token");
    const project_id = body.project_id ?? req.nextUrl.searchParams.get("project_id");
    const photo_id = body.photo_id ?? req.nextUrl.searchParams.get("photo_id");
    if (!token || !project_id || !photo_id) {
      return NextResponse.json(
        { error: "token, project_id, photo_id required" },
        { status: 400 }
      );
    }
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    if (project.status !== "selecting" && project.status !== "preparing") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }
    const admin = getAdminClient();
    await deleteSelectionAdmin(admin, project_id, photo_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/selections DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
