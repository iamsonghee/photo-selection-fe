import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { callPresignApi } from "@/lib/presign-server";
import { buildContentDisposition } from "@/lib/content-disposition-server";

const PAGE_SIZE = 1000;
const QUERY_BATCH_SIZE = 200;
const MAX_SELECTED_FILES = 3000;
const DOWNLOADABLE_STATUSES = new Set([
  "confirmed",
  "editing",
  "reviewing_v1",
  "editing_v2",
  "reviewing_v2",
  "delivered",
]);

type SelectedPhotoRow = {
  id: string;
  number: number;
  r2_original_url: string | null;
  r2_preview_url: string | null;
  original_filename: string | null;
  original_compressed_size: number | null;
  original_status: string | null;
};

function buildPreviewFilename(originalFilename: string | null, number: number): string {
  const fallback = `photo_${number}`;
  const filename = originalFilename?.trim() || fallback;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem || fallback}_preview.jpg`;
}

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

/**
 * POST /api/photographer/projects/[id]/selected-originals
 *
 * 고객이 최종 선택한 사진을 서버에서 다시 조회해 다운로드 URL을 발급한다.
 * 원본 포함 프로젝트는 업로드 원본, 미포함 프로젝트는 1200px JPEG 프리뷰를 반환한다.
 * 클라이언트가 photo id 목록을 보내지 않으므로 확정 결과 밖의 원본을 끼워 넣을 수 없다.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id, status, include_original")
      .eq("id", id)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!DOWNLOADABLE_STATUSES.has(project.status)) {
      return NextResponse.json(
        { error: "고객 셀렉 확정 후 파일을 다운로드할 수 있습니다.", code: "selection_not_confirmed" },
        { status: 409 },
      );
    }

    const selectionPages = await Promise.all(
      [0, 1, 2].map((page) =>
        admin
          .from("selections")
          .select("photo_id")
          .eq("project_id", id)
          .eq("is_selected", true)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      ),
    );
    for (const page of selectionPages) {
      if (page.error) throw new Error(page.error.message);
    }
    const selectedIds = [
      ...new Set(selectionPages.flatMap((page) => (page.data ?? []).map((row) => row.photo_id))),
    ].slice(0, MAX_SELECTED_FILES);
    if (selectedIds.length === 0) {
      return NextResponse.json({
        files: [],
        fileCount: 0,
        totalBytes: 0,
        downloadKind: project.include_original ? "original" : "preview",
      });
    }

    const photoPages = await Promise.all(
      Array.from({ length: Math.ceil(selectedIds.length / QUERY_BATCH_SIZE) }, (_, index) =>
        admin
          .from("photos")
          .select(
            "id, number, r2_original_url, r2_preview_url, original_filename, original_compressed_size, original_status",
          )
          .eq("project_id", id)
          .in(
            "id",
            selectedIds.slice(index * QUERY_BATCH_SIZE, (index + 1) * QUERY_BATCH_SIZE),
          ),
      ),
    );
    for (const page of photoPages) {
      if (page.error) throw new Error(page.error.message);
    }
    const selectedPhotos = (photoPages.flatMap((page) => page.data ?? []) as SelectedPhotoRow[])
      .sort((a, b) => a.number - b.number);

    const downloadKind = project.include_original ? "original" : "preview";
    const downloadItems = project.include_original
      ? selectedPhotos.flatMap((file) =>
          file.original_status === "completed" && file.r2_original_url
            ? [{
                row: file,
                key: file.r2_original_url,
                filename: file.original_filename || `photo_${file.number}`,
                byteSize: file.original_compressed_size ?? 0,
              }]
            : [],
        )
      : selectedPhotos.flatMap((file) =>
          file.r2_preview_url
            ? [{
                row: file,
                key: file.r2_preview_url,
                filename: buildPreviewFilename(file.original_filename, file.number),
                // 정확한 프리뷰 단독 크기 메타데이터가 없어 용량 표시는 하지 않는다.
                byteSize: 0,
              }]
            : [],
        );
    const incompleteCount = selectedIds.length - downloadItems.length;
    if (incompleteCount > 0) {
      const isOriginal = downloadKind === "original";
      return NextResponse.json(
        {
          error: isOriginal
            ? `선택된 사진 중 원본 준비가 완료되지 않은 파일이 ${incompleteCount.toLocaleString()}개 있습니다.`
            : `선택된 사진 중 프리뷰를 찾을 수 없는 파일이 ${incompleteCount.toLocaleString()}개 있습니다.`,
          code: isOriginal ? "selected_originals_incomplete" : "selected_previews_missing",
          incompleteCount,
        },
        { status: 409 },
      );
    }

    const presignBatches = await Promise.all(
      Array.from({ length: Math.ceil(downloadItems.length / QUERY_BATCH_SIZE) }, (_, index) => {
        const batch = downloadItems.slice(index * QUERY_BATCH_SIZE, (index + 1) * QUERY_BATCH_SIZE);
        const dispositions = Object.fromEntries(
          batch.map((file) => [file.key, buildContentDisposition(file.filename)]),
        );
        return callPresignApi(batch.map((file) => file.key), dispositions);
      }),
    );
    const urls = Object.assign({}, ...presignBatches.map((batch) => batch.urls)) as Record<string, string>;
    const files = downloadItems.flatMap((file) => {
      const url = urls[file.key];
      return url
        ? [{
            photoId: file.row.id,
            filename: file.filename,
            byteSize: file.byteSize,
            url,
          }]
        : [];
    });
    if (files.length !== downloadItems.length) {
      throw new Error("일부 파일의 다운로드 URL이 누락됐습니다.");
    }

    return NextResponse.json({
      files,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0),
      downloadKind,
    });
  } catch (error) {
    console.error("[POST selected-originals]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "파일 다운로드 준비에 실패했습니다." },
      { status: 500 },
    );
  }
}
