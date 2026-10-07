/**
 * 파비콘 등에 쓰는 정사각 마크(SVG). 파일 교체 시 `BRAND_MARK_REV`만 올리면
 * 브라우저 캐시를 함께 끊을 수 있습니다.
 */
export const BRAND_MARK_REV = "3";
export const BRAND_MARK_SVG = `/brand/a-cut-mark.svg?rev=${BRAND_MARK_REV}`;

/**
 * 같은 마크의 PNG. iOS 홈 화면 아이콘은 SVG를 쓰지 못하고 투명 모서리를 검게 채우므로
 * 180px 꽉 찬 정사각으로, 검색 결과용 로고(구조화 데이터)는 512px로 둡니다.
 */
export const BRAND_PNG_REV = "1";
export const BRAND_APPLE_TOUCH_ICON_PNG = `/brand/a-cut-apple-touch-icon.png?rev=${BRAND_PNG_REV}`;
export const BRAND_LOGO_PNG = `/brand/a-cut-logo-512.png?rev=${BRAND_PNG_REV}`;
