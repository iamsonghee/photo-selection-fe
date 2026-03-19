import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  getProjectByToken,
} from "@/lib/customer-api-server";
import { getProjectByToken as getProjectByTokenMock, updateProject as updateProjectMock } from "@/lib/mock-data";
import type { ProjectStatus } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? req.nextUrl.searchParams.get("token")) as string | undefined;
    const result = body.result as string | undefined; // 'all_approved' | 'has_revision'

    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    if (!result || !["all_approved", "has_revision"].includes(result)) {
      return NextResponse.json({ error: "result must be all_approved or has_revision" }, { status: 400 });
    }

    const admin = getAdminClient();
    let project = await getProjectByToken(admin, token);

    if (project) {
      const newStatus: ProjectStatus =
        result === "all_approved" ? "delivered" : "editing_v2";
      const { error } = await admin
        .from("projects")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      if (error) {
        console.error("[review-submit]", error);
        return NextResponse.json(
          { error: error.message ?? "Update failed" },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, status: newStatus });
    }

    // 목업: DB에 없으면 mock 프로젝트 상태만 변경
    const mockProject = getProjectByTokenMock(token);
    if (!mockProject) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    const newStatus: ProjectStatus =
      result === "all_approved" ? "delivered" : "editing_v2";
    updateProjectMock(mockProject.id, { status: newStatus });
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e) {
    console.error("[api/c/review-submit]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
