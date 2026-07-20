import type { Photo } from "@/types";

/** AI 흔들림/눈감음 경고 배지 텍스트. 둘 다 아니면 null(배지 미노출).
 * 정보성일 뿐 셀렉/보정을 막지 않는다 — 작가 업로드 화면/고객 갤러리 양쪽에서 공유. */
export function qualityWarningLabel(photo: Photo): string | null {
  const reasons: string[] = [];
  if (photo.isBlurry === true) reasons.push("흔들림 의심");
  if (photo.faceDetected === true && photo.eyesClosed === true) reasons.push("눈 감음 의심");
  return reasons.length ? reasons.join(", ") : null;
}
