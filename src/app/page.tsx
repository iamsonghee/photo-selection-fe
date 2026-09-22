import type { Metadata } from "next";
import "./landing/landing.css";

const title = "A-CUT | 고객의 사진 셀렉부터 보정본 확정까지";
const description = "사진작가를 위한 고객 셀렉·보정 피드백 관리. 함께 찜하고 AI 유사컷을 비교하며, 선택 결과부터 보정본 확정까지 한곳에서 관리하세요.";
const ogImage = { url: "/og/main.jpg", width: 1200, height: 630, alt: "A-CUT — 사진 셀렉·보정을 한 곳에서" };

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [ogImage], type: "website", locale: "ko_KR" },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
};

export { default } from "./landing/page";
