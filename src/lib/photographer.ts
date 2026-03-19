/**
 * 프로필 이미지는 외부 연동 없이 이 서비스에 등록한 이미지만 사용합니다.
 * 등록된 이미지가 없으면 이 기본 이미지를 표시합니다.
 */
export const DEFAULT_PROFILE_IMAGE = "/images/default-profile.svg";

/** 이 서비스에 등록된 URL만 사용, 없거나 비어 있으면 기본 이미지 반환 */
export function getProfileImageUrl(url: string | null | undefined): string {
  return url?.trim() || DEFAULT_PROFILE_IMAGE;
}
