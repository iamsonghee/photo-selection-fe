import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import { CUSTOMER_PHOTO_LIMIT } from "@/app/customer-select/_lib/upload-limit";

// PostgREST는 `in.(...)` 목록을 URL에 싣는다 — ID 약 600개를 넘으면 400으로 거절해 전체 선택 삭제가 실패했다.
// 목록 조회는 이 크기로 나눠 보내고 결과를 합친다.
const ID_CHUNK = 200;

async function inChunks<T>(ids: string[], query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const results = await Promise.all(Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, index) => query(ids.slice(index * ID_CHUNK, (index + 1) * ID_CHUNK))));
  return { data: results.flatMap((result) => result.data ?? []), error: results.find((result) => result.error)?.error ?? null };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 사진을 삭제할 수 있습니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const photoIds: string[] = Array.isArray(body.photo_ids)
    ? [...new Set<string>(body.photo_ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0))]
    : [];
  if (!photoIds.length || photoIds.length > CUSTOMER_PHOTO_LIMIT) return NextResponse.json({ error: "삭제할 사진을 확인해주세요." }, { status: 400 });

  const [photos, selections, opinions, quality, versions] = await Promise.all([
    inChunks(photoIds, (chunk) => admin.from("customer_photos").select("id, similarity_group_id").eq("project_id", id).in("id", chunk)),
    inChunks(photoIds, (chunk) => admin.from("customer_selections").select("photo_id, rating, color_tags, comment, is_selected").eq("project_id", id).in("photo_id", chunk)),
    inChunks(photoIds, (chunk) => admin.from("customer_participant_opinions").select("photo_id, rating").eq("project_id", id).in("photo_id", chunk)),
    inChunks(photoIds, (chunk) => admin.from("customer_quality_assessments").select("photo_id").eq("project_id", id).in("photo_id", chunk)),
    inChunks(photoIds, (chunk) => admin.from("customer_photo_versions").select("id, photo_id").in("photo_id", chunk)),
  ]);
  const failed = [photos, selections, opinions, quality, versions].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: "삭제 영향을 확인하지 못했습니다." }, { status: 500 });
  if ((photos.data?.length ?? 0) !== photoIds.length) return NextResponse.json({ error: "이 프로젝트의 사진이 아닙니다." }, { status: 403 });

  const selectionRows = selections.data ?? [];
  const opinionRows = opinions.data ?? [];
  const aiPhotoIds = new Set([
    ...(quality.data ?? []).map((row) => row.photo_id),
    ...(photos.data ?? []).filter((row) => row.similarity_group_id).map((row) => row.id),
  ]);
  return NextResponse.json({
    photoCount: photoIds.length,
    finalSelections: selectionRows.filter((row) => row.is_selected).length,
    likes: selectionRows.reduce((sum, row) => sum + (Array.isArray(row.color_tags) ? row.color_tags.length : 0), 0),
    ratings: selectionRows.filter((row) => row.rating).length + opinionRows.filter((row) => row.rating).length,
    comments: selectionRows.filter((row) => row.comment?.trim()).length,
    aiPhotos: aiPhotoIds.size,
    retouchedVersions: versions.data?.length ?? 0,
  });
}
