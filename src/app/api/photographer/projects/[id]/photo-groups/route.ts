import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import type { PhotoGroupInfo } from "@/types";

async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

async function assertProjectOwnership(
  projectId: string,
  photographerId: string
): Promise<boolean> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, photographer_id")
    .eq("id", projectId)
    .single();
  return !!data && data.photographer_id === photographerId;
}

/** GET /api/photographer/projects/[id]/photo-groups — AI 유사컷 그룹 목록 (원본페이지 대표이미지 토글용) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owns = await assertProjectOwnership(projectId, photographerId);
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("photo_groups")
      .select("id, representative_photo_id, photo_count")
      .eq("project_id", projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const photoGroups: PhotoGroupInfo[] = (data ?? []).map(
      (g: { id: string; representative_photo_id: string; photo_count: number }) => ({
        id: g.id,
        representativePhotoId: g.representative_photo_id,
        photoCount: g.photo_count,
      })
    );
    return NextResponse.json({ photoGroups });
  } catch (e) {
    console.error("[GET projects photo-groups]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
