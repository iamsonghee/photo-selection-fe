import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  getProjectByToken,
  getPhotosWithSelectionsAdmin,
} from "@/lib/customer-api-server";
import {
  getProjectByToken as getProjectByTokenMock,
  getPhotosByProject,
} from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const admin = getAdminClient();
    let project = await getProjectByToken(admin, token);
    let photos: Awaited<ReturnType<typeof getPhotosWithSelectionsAdmin>>["photos"];
    let selectedIds: Set<string>;
    let photoStates: Record<string, { rating?: number; color?: string; comment?: string }>;

    if (project) {
      const result = await getPhotosWithSelectionsAdmin(admin, project.id);
      photos = result.photos;
      selectedIds = result.selectedIds;
      photoStates = result.photoStates;
    } else {
      // 목업: DB에 없으면 mock 데이터 사용 (보정본 검토 등)
      const mockProject = getProjectByTokenMock(token);
      if (!mockProject) {
        return NextResponse.json({ error: "Invalid token", project: null }, { status: 404 });
      }
      project = mockProject;
      const allPhotos = getPhotosByProject(project.id);
      photos = allPhotos;
      selectedIds = new Set(
        allPhotos.filter((p) => p.selected).map((p) => p.id)
      );
      photoStates = {};
    }

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
