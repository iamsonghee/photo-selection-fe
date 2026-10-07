/**
 * 검색·공유 미리보기에 쓰는 공개 사이트 기본값.
 * 대표 주소는 www다(apex `acut.kr`은 Vercel이 www로 308 리다이렉트한다).
 */
export const SITE_URL = "https://www.acut.kr";
export const SITE_NAME = "A-CUT";

// 카톡/아이메시지 등은 og:image를 자체 캐시하고 우리 서버 캐시 헤더를 보지 않는다.
// 이미지 파일을 바꿀 때는 이 REV도 함께 올려서 URL 자체를 바꿔야 플랫폼이 재스캔한다.
const OG_MAIN_IMAGE_REV = "2";
export const OG_MAIN_IMAGE = {
  url: `/og/main.jpg?v=${OG_MAIN_IMAGE_REV}`,
  width: 1200,
  height: 630,
  alt: "A-CUT — 사진 셀렉·보정을 한 곳에서",
};
