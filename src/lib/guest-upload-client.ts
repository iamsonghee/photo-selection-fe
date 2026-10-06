/**
 * 하객 업로드(브라우저): 미리보기 만들기 → 업로드 주소 받기 → R2에 직접 PUT → 서버 확인.
 * 원본은 고른 파일 그대로 올린다(영상 압축 없음). 썸네일·미리보기는 화면 표시용 JPEG.
 */
import { compressImageForUpload } from "@/lib/upload-client-compress";
import { readTakenAt } from "@/lib/exif-taken-at";
import type { GuestMediaKind } from "@/lib/guest-album";

export class GuestUploadError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type Prepared = {
  takenAt: string | null;
  durationSeconds: number | null;
  thumb: Blob | null;
  preview: Blob | null;
};

const THUMB_EDGE = 480;
const PREVIEW_EDGE = 1600;
const DERIVED_MAX_BYTES = 5 * 1024 * 1024;

export function mediaKindOf(file: File): GuestMediaKind | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/** 썸네일 만들기에 실패해도 업로드는 계속한다(신랑신부 화면에 기본 아이콘으로 보임). */
async function preparePhoto(file: File): Promise<Prepared> {
  const jpeg = async (maxEdge: number) => {
    try {
      const out = await compressImageForUpload(file, { maxEdge, jpegQuality: 0.82, skipBelowBytes: 0 });
      return out.type === "image/jpeg" && out.size <= DERIVED_MAX_BYTES ? out : null;
    } catch {
      return null;
    }
  };
  const [taken, thumb, preview] = await Promise.all([readTakenAt(file), jpeg(THUMB_EDGE), jpeg(PREVIEW_EDGE)]);
  return { takenAt: taken.source === "exif" ? taken.takenAt : null, durationSeconds: null, thumb, preview };
}

/** 영상 첫 장면(0.5초 지점)을 그려 썸네일·미리보기로 쓴다. 기기에서 못 그리면 없이 올린다. */
async function prepareVideo(file: File): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
      video.src = url;
    }), 10000);
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    await withTimeout(new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.5, (duration ?? 1) / 2);
    }), 5000).catch(() => undefined);
    const draw = (maxEdge: number) => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob && blob.size <= DERIVED_MAX_BYTES ? blob : null), "image/jpeg", 0.8));
    };
    if (!video.videoWidth) return { takenAt: null, durationSeconds: duration, thumb: null, preview: null };
    return { takenAt: null, durationSeconds: duration, thumb: await draw(THUMB_EDGE), preview: await draw(PREVIEW_EDGE) };
  } catch {
    return { takenAt: null, durationSeconds: null, thumb: null, preview: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new GuestUploadError("인터넷 연결을 확인해 주세요.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GuestUploadError(data.error ?? "잠시 후 다시 시도해 주세요.", data.code);
  return data as T;
}

/** R2 PUT. fetch는 업로드 진행률을 주지 않아 XHR을 쓴다. Content-Type은 서명과 같아야 한다. */
function put(url: string, blob: Blob, contentType: string, onProgress?: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new GuestUploadError("파일을 올리지 못했어요. 다시 보내 주세요.", "put")));
    xhr.onerror = () => reject(new GuestUploadError("인터넷 연결을 확인해 주세요.", "network"));
    xhr.send(blob);
  });
}

export async function createGuestSubmission(token: string, name: string, message: string) {
  const { submissionId } = await postJson<{ submissionId: string }>(`/api/guest/${token}/submissions`, { name, message });
  return submissionId;
}

/** 파일 하나 올리기. id는 파일마다 고정(재시도해도 같은 행). onProgress는 0~1. */
export async function uploadGuestFile(token: string, submissionId: string, id: string, file: File, onProgress: (ratio: number) => void) {
  const kind = mediaKindOf(file);
  if (!kind) throw new GuestUploadError("사진과 영상만 보낼 수 있어요.", "invalid");
  const prepared = kind === "photo" ? await preparePhoto(file) : await prepareVideo(file);
  onProgress(0.03);
  const target = await postJson<{ done: boolean; original?: string; thumb?: string | null; preview?: string | null }>(`/api/guest/${token}/media/presign`, {
    submissionId, id, kind, contentType: file.type, size: file.size, filename: file.name,
    durationSeconds: prepared.durationSeconds, takenAt: prepared.takenAt,
    thumb: prepared.thumb ? { contentType: "image/jpeg", size: prepared.thumb.size } : null,
    preview: prepared.preview ? { contentType: "image/jpeg", size: prepared.preview.size } : null,
  });
  if (target.done) return onProgress(1);
  await Promise.all([
    put(target.original!, file, file.type, (ratio) => onProgress(0.03 + ratio * 0.92)),
    // 썸네일·미리보기 실패는 원본을 막지 않는다 — 서버가 없는 것으로 기록한다.
    target.thumb && prepared.thumb ? put(target.thumb, prepared.thumb, "image/jpeg").catch(() => undefined) : null,
    target.preview && prepared.preview ? put(target.preview, prepared.preview, "image/jpeg").catch(() => undefined) : null,
  ]);
  await postJson(`/api/guest/${token}/media/complete`, { submissionId, id });
  onProgress(1);
}
