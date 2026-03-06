import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  getProjectByToken,
  getPhotosWithSelectionsAdmin,
} from "@/lib/customer-api-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const admin = getAdminClient();
    const project = await getProjectByToken(admin, token);
    if (!project) {
      return NextResponse.json({ error: "Invalid token", project: null }, { status: 404 });
    }
    const { photos, selectedIds, photoStates } = await getPhotosWithSelectionsAdmin(
      admin,
      project.id
    );
    return NextResponse.json({
      project,
      photos,
      selectedIds: Array.from(selectedIds),
      photoStates,
    });
  } catch (e) {
    console.error("[api/c/photos]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
