import type { Metadata } from "next";
import "./landing/landing.css";

const title = "A-CUT | 고객의 사진 셀렉부터 보정본 확정까지";
const description = "사진작가를 위한 고객 셀렉·보정 피드백 관리. 함께 찜하고 AI 유사컷을 비교하며, 선택 결과부터 보정본 확정까지 한곳에서 관리하세요.";
// 카톡/아이메시지 등은 og:image를 자체 캐시하고 우리 서버 캐시 헤더를 보지 않는다.
// 이미지 파일을 바꿀 때는 이 REV도 함께 올려서 URL 자체를 바꿔야 플랫폼이 재스캔한다.
const OG_MAIN_IMAGE_REV = "2";
const ogImage = { url: `/og/main.jpg?v=${OG_MAIN_IMAGE_REV}`, width: 1200, height: 630, alt: "A-CUT — 사진 셀렉·보정을 한 곳에서" };

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [ogImage], type: "website", locale: "ko_KR" },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
};

export { default } from "./landing/page";
