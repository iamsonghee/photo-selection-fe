import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { GuestRequestError, authorizeGuest, callGuestStorage, getGuestUploadLimits, guestMediaKey } from "@/lib/guest-album-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_TYPE = /^(image|video)\/[a-z0-9.+-]{1,60}$/;
const TAKEN_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
/** 브라우저가 만든 썸네일·미리보기 JPEG 상한 */
const DERIVED_MAX_BYTES = 5 * 1024 * 1024;

type Derived = { contentType: string; size: number } | null;

/**
 * POST: 파일 하나의 R2 업로드 주소. 원본은 브라우저가 고른 파일 그대로, 썸네일·미리보기는 브라우저가 만든 JPEG.
 * 같은 id로 다시 부르면(재시도) 같은 행에 새 주소를 준다. 이미 올라간 파일이면 { done: true }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  const kind = body.kind === "photo" || body.kind === "video" ? body.kind as "photo" | "video" : null;
  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = Number(body.size);
  const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 255) : "file";
  const duration = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds) && body.durationSeconds >= 0 ? body.durationSeconds : null;
  const takenAt = typeof body.takenAt === "string" && TAKEN_AT.test(body.takenAt) ? body.takenAt : null;
  // 줄여 보내기는 사진만 — 영상은 항상 원본으로 기록한다.
  const isOriginal = kind !== "photo" || body.isOriginal !== false;
  const thumb = derived(body.thumb);
  const preview = derived(body.preview);
  if (!UUID.test(id) || !kind || !CONTENT_TYPE.test(contentType) || !contentType.startsWith(kind === "photo" ? "image/" : "video/")
    || !Number.isSafeInteger(size) || size <= 0 || thumb === undefined || preview === undefined) {
    return NextResponse.json({ error: "보낼 수 없는 파일이에요.", code: "invalid" }, { status: 400 });
  }

  try {
    // 서로 기다릴 필요 없는 조회는 함께 보낸다 — 파일마다 부르는 경로라 왕복 수가 곧 업로드 대기 시간이다.
    const [{ album, submission }, limits] = await Promise.all([
      authorizeGuest(token, typeof body.submissionId === "string" ? body.submissionId : ""),
      getGuestUploadLimits(),
    ]);
    const maxMb = kind === "photo" ? limits.photoMaxMb : limits.videoMaxMb;
    if (size > maxMb * 1024 * 1024) {
      throw new GuestRequestError(413, "too_large", `${kind === "photo" ? "사진" : "영상"}은 ${maxMb.toLocaleString()}MB까지 보낼 수 있어요.`);
    }

    const admin = getAdminClient();
    const { data: existing } = await admin.from("guest_media").select("album_id, submission_id, status").eq("id", id).maybeSingle();
    if (existing && (existing.album_id !== album.id || existing.submission_id !== submission!.id)) {
      throw new GuestRequestError(409, "invalid", "보낼 수 없는 파일이에요.");
    }
    if (existing?.status === "ready") return NextResponse.json({ done: true });

    const keys = {
      original: guestMediaKey(album.id, id, "original"),
      thumb: thumb ? guestMediaKey(album.id, id, "thumb") : null,
      preview: preview ? guestMediaKey(album.id, id, "preview") : null,
    };
    const { error } = await admin.from("guest_media").upsert({
      id, album_id: album.id, submission_id: submission!.id, kind, filename, content_type: contentType, size_bytes: size,
      duration_seconds: kind === "video" ? duration : null, taken_at: takenAt, is_original: isOriginal,
      original_key: keys.original, thumb_key: keys.thumb, preview_key: keys.preview, status: "pending",
    }, { onConflict: "id" });
    if (error) throw error;

    const items = [
      { key: keys.original, content_type: contentType, content_length: size },
      ...(thumb && keys.thumb ? [{ key: keys.thumb, content_type: thumb.contentType, content_length: thumb.size }] : []),
      ...(preview && keys.preview ? [{ key: keys.preview, content_type: preview.contentType, content_length: preview.size }] : []),
    ];
    const { urls } = await callGuestStorage<{ urls: Record<string, string> }>("presign-put", { items });
    return NextResponse.json({
      done: false,
      original: urls[keys.original],
      thumb: keys.thumb ? urls[keys.thumb] : null,
      preview: keys.preview ? urls[keys.preview] : null,
    });
  } catch (error) {
    if (error instanceof GuestRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[guest media presign]", error);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

/** 썸네일·미리보기: 없으면 null, 형식이 틀리면 undefined */
function derived(value: unknown): Derived | undefined {
  if (value === null || value === undefined) return null;
  const { contentType, size } = value as { contentType?: unknown; size?: unknown };
  return contentType === "image/jpeg" && typeof size === "number" && Number.isSafeInteger(size) && size > 0 && size <= DERIVED_MAX_BYTES
    ? { contentType, size } : undefined;
}
