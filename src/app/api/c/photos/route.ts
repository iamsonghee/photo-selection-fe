import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPhotosWithSelectionsAdmin } from "@/lib/customer-api-server";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  if (!auth.project) {
    return NextResponse.json({ error: "Invalid token", project: null }, { status: 404 });
  }
  try {
    const admin = getAdminClient();
    const project = auth.project;
    const { photos, selectedIds, photoStates, photoGroups } =
      await getPhotosWithSelectionsAdmin(admin, project.id);

    return NextResponse.json({
      project,
      photos,
      selectedIds: Array.from(selectedIds),
      photoStates,
      photoGroups,
    });
  } catch (e) {
    console.error("[api/c/photos]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
