import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";

export const dynamic = "force-dynamic";

export interface RetouchVersionView {
  id: string;
  round: number;
  filename: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  decision: "pending" | "confirmed" | "redo";
  redoReason: string | null;
  createdAt: string;
}

export interface RetouchPhotoView {
  id: string;
  filename: string;
  url: string;
  previewUrl: string | null;
  versions: RetouchVersionView[];
}

/** GET: 1차에서 선택 확정한 사진 + 그 사진들의 보정본 회차 이력(단계 7, S10/S11 공용 조회). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  const { project } = access;

  const [photosRes, selectionsRes] = await Promise.all([
    admin.from("customer_photos").select("id, filename, thumb_url, preview_url").eq("project_id", id),
    admin.from("customer_selections").select("photo_id").eq("project_id", id).eq("is_selected", true),
  ]);
  if (photosRes.error || selectionsRes.error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  const selectedIds = new Set((selectionsRes.data ?? []).map((s) => s.photo_id));
  const selectedPhotos = (photosRes.data ?? []).filter((p) => selectedIds.has(p.id));

  const versionsRes = await admin
    .from("customer_photo_versions")
    .select("id, photo_id, round, filename, thumb_url, preview_url, decision, redo_reason, created_at")
    .in("photo_id", selectedPhotos.map((p) => p.id))
    .order("round", { ascending: true });
  if (versionsRes.error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  const versionsByPhoto = new Map<string, RetouchVersionView[]>();
  for (const v of versionsRes.data ?? []) {
    const list = versionsByPhoto.get(v.photo_id) ?? [];
    list.push({
      id: v.id,
      round: v.round,
      filename: v.filename,
      thumbUrl: v.thumb_url,
      previewUrl: v.preview_url,
      decision: v.decision,
      redoReason: v.redo_reason,
      createdAt: v.created_at,
    });
    versionsByPhoto.set(v.photo_id, list);
  }

  const photos: RetouchPhotoView[] = selectedPhotos.map((p) => ({
    id: p.id,
    filename: p.filename,
    url: p.thumb_url ?? "",
    previewUrl: p.preview_url,
    versions: versionsByPhoto.get(p.id) ?? [],
  }));

  return NextResponse.json(
    { photos, retouchDone: project.retouch_done, isOwner: access.isOwner },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** PATCH: S13 완료 표시. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const access = await resolveCustomerProjectAccess(admin, id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 완료 상태를 변경할 수 있습니다." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.retouchDone !== "boolean") {
    return NextResponse.json({ error: "retouchDone(boolean) 필드가 필요합니다." }, { status: 400 });
  }
  const { error } = await admin.from("customer_projects").update({ retouch_done: body.retouchDone }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
