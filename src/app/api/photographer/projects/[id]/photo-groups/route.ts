import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import type { PhotoGroupInfo } from "@/types";

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

/**
 * PATCH /api/photographer/projects/[id]/photo-groups — "대표 사진으로 설정".
 * 단일 행(photo_groups.representative_photo_id)만 바꾸는 단순 쓰기라 delete/remove의
 * FOR UPDATE 락과 달리 별도 RPC 없이 guarded UPDATE로 처리한다(동시 요청 시 최악의 경우도
 * "마지막에 쓴 값이 이긴다" 수준일 뿐, photo_count처럼 여러 행이 깨지는 재계산이 아니다).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, photographer_id, status")
      .eq("id", projectId)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const status = (project as { status: string }).status;
    if (status !== "preparing" && status !== "selecting") {
      return NextResponse.json(
        { error: "preparing/selecting 상태에서만 대표 사진을 변경할 수 있습니다." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { groupId, representativePhotoId } = body as {
      groupId?: string;
      representativePhotoId?: string;
    };
    if (!groupId || !representativePhotoId) {
      return NextResponse.json({ error: "groupId, representativePhotoId required" }, { status: 400 });
    }

    const { data: group, error: groupErr } = await admin
      .from("photo_groups")
      .select("id, project_id, photo_count")
      .eq("id", groupId)
      .single();
    if (groupErr || !group || (group as { project_id: string }).project_id !== projectId) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { data: photo, error: photoErr } = await admin
      .from("photos")
      .select("id, project_id, similarity_group_id")
      .eq("id", representativePhotoId)
      .single();
    if (
      photoErr ||
      !photo ||
      (photo as { project_id: string }).project_id !== projectId ||
      (photo as { similarity_group_id: string | null }).similarity_group_id !== groupId
    ) {
      return NextResponse.json({ error: "Photo is not a member of this group" }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from("photo_groups")
      .update({ representative_photo_id: representativePhotoId })
      .eq("id", groupId)
      .eq("project_id", projectId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const photoGroup: PhotoGroupInfo = {
      id: groupId,
      representativePhotoId,
      photoCount: (group as { photo_count: number }).photo_count,
    };
    return NextResponse.json({ photoGroup });
  } catch (e) {
    console.error("[PATCH projects photo-groups]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
