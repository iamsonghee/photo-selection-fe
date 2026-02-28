import { NextRequest, NextResponse } from "next/server";
import { validateTokenAndProject, confirmProjectAdmin } from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, project_id } = body;
    if (!token || !project_id) {
      return NextResponse.json(
        { error: "token, project_id required" },
        { status: 400 }
      );
    }
    const project = await validateTokenAndProject(token, project_id);
    if (!project) {
      return NextResponse.json({ error: "Invalid token or project" }, { status: 401 });
    }
    if (project.status !== "selecting") {
      return NextResponse.json({ error: "Project is not in selecting status" }, { status: 403 });
    }
    const admin = getAdminClient();
    await confirmProjectAdmin(admin, project_id);
    await admin.from("project_logs").insert({
      project_id,
      photographer_id: project.photographerId,
      action: "confirmed",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/c/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
