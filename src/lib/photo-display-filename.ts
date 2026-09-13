import type { Photo } from "@/types";

/**
 * 원본 파일명은 다운로드·매칭을 위해 DB 값을 그대로 보존한다.
 * 화면에서는 확장자만 소문자로 통일해 업로드 중/저장 완료 사진이 같은 규칙으로 보이게 한다.
 */
export function formatPhotoDisplayFilename(filename: string): string {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return trimmed;
  return `${trimmed.slice(0, dot)}${trimmed.slice(dot).toLocaleLowerCase()}`;
}

/** 원본/셀렉 갤러리와 상세 뷰어가 공유하는 사진 표시 파일명 규칙. */
export function getPhotoDisplayFilename(photo: Photo, fallbackIndex?: number): string {
  const source = photo.originalFilename?.trim();
  if (source) return formatPhotoDisplayFilename(source);
  const sequence = Number.isFinite(photo.orderIndex) ? photo.orderIndex : (fallbackIndex ?? 0) + 1;
  return `FRAME_${String(sequence).padStart(4, "0")}`;
}
