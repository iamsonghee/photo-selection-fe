import "server-only";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/supabase-admin";
import { getAppSettings } from "@/lib/app-settings";
import type { GuestAlbumInfo, GuestMedia, GuestUploadLimits } from "@/lib/guest-album";

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const INTERNAL_PRESIGN_SECRET = process.env.INTERNAL_PRESIGN_SECRET ?? "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "https://img.acut.kr").replace(/\/$/, "");

/** 하객 브라우저 식별 쿠키. 서버가 심는 httpOnly 쿠키라 Safari의 7일 스크립트 저장소 제한을 받지 않는다. */
export const GUEST_DEVICE_COOKIE = "acut_guest_device";
const GUEST_DEVICE_MAX_AGE = 60 * 60 * 24 * 400;

export type GuestAlbumRow = {
  id: string;
  owner_id: string;
  name: string;
  wedding_date: string;
  ceremony_time: string | null;
  venue: string | null;
  greeting: string | null;
  upload_token: string;
  closed_at: string | null;
  created_at: string;
};

export const GUEST_ALBUM_COLUMNS = "id, owner_id, name, wedding_date, ceremony_time, venue, greeting, upload_token, closed_at, created_at";

export function toGuestAlbumInfo(row: GuestAlbumRow): GuestAlbumInfo {
  return {
    id: row.id,
    name: row.name,
    weddingDate: row.wedding_date,
    ceremonyTime: row.ceremony_time ? row.ceremony_time.slice(0, 5) : null,
    venue: row.venue,
    greeting: row.greeting,
    uploadToken: row.upload_token,
    closed: Boolean(row.closed_at),
  };
}

export function newUploadToken() {
  return randomBytes(16).toString("base64url");
}

export function r2PublicUrl(key: string) {
  return `${R2_PUBLIC_URL}/${key}`;
}

export function guestMediaKey(albumId: string, mediaId: string, part: "original" | "thumb" | "preview") {
  return `guest-albums/${albumId}/${mediaId}/${part}`;
}

/** 앨범마다 다른 해시 — 같은 브라우저라도 앨범끼리 연결되지 않는다. */
export function deviceHash(albumId: string, deviceKey: string) {
  return createHash("sha256").update(`${albumId}:${deviceKey}`).digest("hex");
}

/** 현재 요청의 하객 식별 키. 없으면 null(조회 화면은 새로 만들지 않는다). */
export async function readGuestDeviceKey() {
  const value = (await cookies()).get(GUEST_DEVICE_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
}

/** 업로드할 때 식별 키를 읽거나 새로 심는다(Route Handler 안에서만 호출). */
export async function ensureGuestDeviceKey() {
  const existing = await readGuestDeviceKey();
  if (existing) return existing;
  const key = randomBytes(32).toString("base64url");
  (await cookies()).set(GUEST_DEVICE_COOKIE, key, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GUEST_DEVICE_MAX_AGE,
  });
  return key;
}

export async function getGuestAlbumByToken(token: string): Promise<GuestAlbumRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await getAdminClient().from("guest_albums").select(GUEST_ALBUM_COLUMNS).eq("upload_token", token).maybeSingle();
  return (data as GuestAlbumRow | null) ?? null;
}

/** 로그인한 소유자의 앨범만. 남의 앨범·없는 앨범은 null. */
export async function getOwnedGuestAlbum(albumId: string, ownerId: string): Promise<GuestAlbumRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(albumId)) return null;
  const { data } = await getAdminClient().from("guest_albums").select(GUEST_ALBUM_COLUMNS).eq("id", albumId).eq("owner_id", ownerId).maybeSingle();
  return (data as GuestAlbumRow | null) ?? null;
}

export type GuestAlbumSummary = { id: string; name: string; weddingDate: string; closed: boolean; createdAt: string; mediaCount: number; coverUrl: string | null };

/** 내 프로젝트 목록용. 테이블이 아직 없거나(마이그레이션 전) 실패하면 빈 목록 — 목록 화면을 깨지 않는다. */
export async function listOwnerGuestAlbums(ownerId: string): Promise<GuestAlbumSummary[]> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("guest_albums").select("id, name, wedding_date, closed_at, created_at").eq("owner_id", ownerId).order("created_at", { ascending: false });
  if (error) {
    console.warn("[guest albums list]", error.message);
    return [];
  }
  return Promise.all((data ?? []).map(async (row) => {
    const ready = admin.from("guest_media").select("id", { count: "exact", head: true }).eq("album_id", row.id).eq("status", "ready");
    const cover = admin.from("guest_media").select("thumb_key").eq("album_id", row.id).eq("status", "ready").not("thumb_key", "is", null)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const [{ count }, { data: first }] = await Promise.all([ready, cover]);
    return {
      id: row.id, name: row.name, weddingDate: row.wedding_date, closed: Boolean(row.closed_at), createdAt: row.created_at,
      mediaCount: count ?? 0, coverUrl: first?.thumb_key ? r2PublicUrl(first.thumb_key) : null,
    };
  }));
}

export async function getGuestUploadLimits(): Promise<GuestUploadLimits> {
  const settings = await getAppSettings();
  return { photoMaxMb: settings.guestPhotoMaxMb, videoMaxMb: settings.guestVideoMaxMb, retentionDays: settings.guestRetentionDays };
}

type MediaRow = {
  id: string;
  kind: "photo" | "video";
  filename: string;
  original_key: string;
  thumb_key: string | null;
  preview_key: string | null;
  duration_seconds: number | null;
  is_original: boolean;
  created_at: string;
  submission_id: string;
};
type SubmissionRow = { id: string; name: string; message: string | null; device_hash: string };

const MEDIA_COLUMNS = "id, kind, filename, original_key, thumb_key, preview_key, duration_seconds, is_original, created_at, submission_id";

/**
 * 앨범의 올라온 파일(ready)과 참여 하객 수. deviceHash를 주면 그 브라우저가 보낸 것만.
 * ponytail: 한 번에 다 읽는다(범위 1,000행씩). 앨범당 수천 개를 넘으면 페이지 나누기.
 */
export async function listGuestMedia(albumId: string, onlyDeviceHash?: string): Promise<{ media: GuestMedia[]; guests: number }> {
  const admin = getAdminClient();
  let submissionsQuery = admin.from("guest_submissions").select("id, name, message, device_hash").eq("album_id", albumId);
  if (onlyDeviceHash) submissionsQuery = submissionsQuery.eq("device_hash", onlyDeviceHash);
  const { data: submissions, error: submissionError } = await submissionsQuery;
  if (submissionError) throw submissionError;
  const byId = new Map((submissions as SubmissionRow[]).map((row) => [row.id, row]));
  if (!byId.size) return { media: [], guests: 0 };

  const rows: MediaRow[] = [];
  for (let from = 0; ; from += 1000) {
    let query = admin.from("guest_media").select(MEDIA_COLUMNS).eq("album_id", albumId).eq("status", "ready")
      .order("created_at", { ascending: true }).order("id").range(from, from + 999);
    if (onlyDeviceHash) query = query.in("submission_id", [...byId.keys()]);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as MediaRow[]));
    if (data.length < 1000) break;
  }

  const media = rows.flatMap((row): GuestMedia[] => {
    const submission = byId.get(row.submission_id);
    if (!submission) return [];
    return [{
      id: row.id,
      kind: row.kind,
      fileName: row.filename,
      originalUrl: r2PublicUrl(row.original_key),
      thumbUrl: row.thumb_key ? r2PublicUrl(row.thumb_key) : null,
      previewUrl: row.preview_key ? r2PublicUrl(row.preview_key) : null,
      durationSeconds: row.duration_seconds,
      isOriginal: row.is_original,
      uploadedAt: row.created_at,
      guestName: submission.name,
      guestMessage: submission.message,
    }];
  });
  const guests = new Set(rows.map((row) => byId.get(row.submission_id)?.device_hash).filter(Boolean)).size;
  return { media, guests };
}

export class GuestRequestError extends Error {
  constructor(public status: number, public code: "not_found" | "closed" | "forbidden" | "invalid" | "too_large" | "incomplete", message: string) {
    super(message);
  }
}

export const GUEST_CLOSED_MESSAGE = "업로드가 마감됐어요. 신랑신부가 사진 고르기를 시작했어요.";

/** 하객 요청 공통 확인: 열려 있는 앨범 + (submissionId가 있으면) 이 브라우저가 만든 묶음. */
export async function authorizeGuest(token: string, submissionId?: string) {
  const album = await getGuestAlbumByToken(token);
  if (!album) throw new GuestRequestError(404, "not_found", "앨범을 찾을 수 없어요. 링크를 다시 확인해 주세요.");
  if (album.closed_at) throw new GuestRequestError(409, "closed", GUEST_CLOSED_MESSAGE);
  if (submissionId === undefined) return { album, submission: null };
  const deviceKey = await readGuestDeviceKey();
  if (!deviceKey || !/^[0-9a-f-]{36}$/i.test(submissionId)) throw new GuestRequestError(403, "forbidden", "처음부터 다시 보내 주세요.");
  const { data } = await getAdminClient().from("guest_submissions").select("id, device_hash")
    .eq("id", submissionId).eq("album_id", album.id).maybeSingle();
  if (!data || data.device_hash !== deviceHash(album.id, deviceKey)) throw new GuestRequestError(403, "forbidden", "처음부터 다시 보내 주세요.");
  return { album, submission: data as { id: string; device_hash: string } };
}

/** FastAPI 하객 업로드 내부 API(R2 서명·확인·삭제). */
export async function callGuestStorage<T>(path: "presign-put" | "head" | "delete", body: unknown): Promise<T> {
  if (!INTERNAL_PRESIGN_SECRET) throw new Error("INTERNAL_PRESIGN_SECRET is not set");
  const res = await fetch(`${BACKEND_URL}/api/guest-upload/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${INTERNAL_PRESIGN_SECRET}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`guest storage ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}
