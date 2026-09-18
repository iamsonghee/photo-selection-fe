/**
 * 프로필 이미지는 외부 연동 없이 이 서비스에 등록한 이미지만 사용합니다.
 * 등록된 이미지가 없으면 이 기본 이미지를 표시합니다.
 */
export const DEFAULT_PROFILE_IMAGE = "/images/default-profile-v2.png";

/** 이 서비스에 등록된 URL만 사용, 없거나 비어 있으면 기본 이미지 반환 */
export function getProfileImageUrl(url: string | null | undefined): string {
  return url?.trim() || DEFAULT_PROFILE_IMAGE;
}

/** 도메인만 입력한 외부 링크도 HTTPS 주소로 정규화하고, 웹 링크 외 스킴은 거부합니다. */
export function normalizeExternalHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
