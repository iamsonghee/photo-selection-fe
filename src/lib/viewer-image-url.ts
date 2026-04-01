import type { Photo } from "@/types";

/** 뷰어·풀스크린용 (r2_preview_url ?? r2_thumb_url). previewUrl 미설정 시 썸네일 url */
export function viewerImageUrl(photo: Pick<Photo, "url"> & { previewUrl?: string | null }): string {
  return photo.previewUrl ?? photo.url;
}
