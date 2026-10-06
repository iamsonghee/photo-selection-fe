/** 하객 사진 모으기 — 서버·클라이언트 공용 타입과 표시 함수. */

export type GuestMediaKind = "photo" | "video";

export type GuestAlbumInfo = {
  id: string;
  name: string;
  /** 결혼식 날짜(KST, YYYY-MM-DD) — 보관 기간의 기준 */
  weddingDate: string;
  /** 예식 시작 시간(HH:mm) */
  ceremonyTime: string | null;
  venue: string | null;
  greeting: string | null;
  uploadToken: string;
  closed: boolean;
};

/** 화면에 내려보내는 파일 하나(ready만). URL은 공개 주소 — 키가 추측할 수 없는 UUID다. */
export type GuestMedia = {
  id: string;
  kind: GuestMediaKind;
  fileName: string;
  originalUrl: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  durationSeconds: number | null;
  uploadedAt: string;
  guestName: string;
  guestMessage: string | null;
};

export type GuestUploadLimits = {
  photoMaxMb: number;
  videoMaxMb: number;
  retentionDays: number;
};

export const DEFAULT_GUEST_GREETING = "오늘 찍은 사진과 영상을 보내 주세요.";
export const GUEST_NAME_MAX = 30;
export const GUEST_MESSAGE_MAX = 300;
export const GUEST_GREETING_MAX = 100;

/** 2026.10.03 (토) 오후 12:30 */
export function formatWeddingDateTime(date: string, time?: string | null) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  let text = `${date.replaceAll("-", ".")} (${weekday})`;
  if (time) {
    const [h, min] = time.split(":").map(Number);
    text += ` ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(min).padStart(2, "0")}`;
  }
  return text;
}

/** 날짜·시간 · 예식장 */
export function weddingMeta(album: Pick<GuestAlbumInfo, "weddingDate" | "ceremonyTime" | "venue">) {
  return [formatWeddingDateTime(album.weddingDate, album.ceremonyTime), album.venue].filter(Boolean).join(" · ");
}

/** 결혼식 날짜 + 보관 일수 → YYYY-MM-DD */
export function retentionEndDate(weddingDate: string, days: number) {
  const [y, m, d] = weddingDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function countMedia(media: Pick<GuestMedia, "kind">[]) {
  const photos = media.filter((item) => item.kind === "photo").length;
  return { photos, videos: media.length - photos };
}

export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function formatUploadedAt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}

/** 사진 N장 · 영상 N개 */
export function mediaSummary({ photos, videos }: { photos: number; videos: number }) {
  return [photos ? `사진 ${photos.toLocaleString()}장` : null, videos ? `영상 ${videos.toLocaleString()}개` : null].filter(Boolean).join(" · ") || "0개";
}

export function guestUploadPath(token: string) {
  return `/g/${token}`;
}
