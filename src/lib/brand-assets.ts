/**
 * `public/brand/a-cut-logo.png` 교체 시 `REV`만 올리면
 * 브라우저·파비콘·(과거) 이미지 최적화 캐시를 함께 끊을 수 있음.
 */
export const BRAND_LOGO_REV = "8";
export const BRAND_LOGO_PNG = `/brand/a-cut-logo.png?rev=${BRAND_LOGO_REV}`;
