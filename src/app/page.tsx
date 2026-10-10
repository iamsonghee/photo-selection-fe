import type { Metadata, Viewport } from "next";
import LandingPage from "./landing/page";
import { LANDING_FAQ } from "./landing/faq";
import { BRAND_LOGO_PNG } from "@/lib/brand-assets";
import { OG_MAIN_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site-metadata";
import "./landing/landing.css";

const title = "A-CUT | 고객의 사진 셀렉부터 보정본 확정까지";
const description = "사진작가를 위한 고객 셀렉·보정 피드백 관리. 함께 찜하고 AI 유사컷을 비교하며, 선택 결과부터 보정본 확정까지 한곳에서 관리하세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  verification: { other: { "naver-site-verification": "f3a12f0599e3ff5dfdd9c95703783d6e3580e267" } },
  openGraph: { title, description, url: "/", siteName: SITE_NAME, images: [OG_MAIN_IMAGE], type: "website", locale: "ko_KR" },
  twitter: { card: "summary_large_image", title, description, images: [OG_MAIN_IMAGE] },
};

// 루트 viewport는 브라우저 확대를 막는다(maximumScale 1). 소개 페이지인 랜딩은 확대를 허용한다(접근성).
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

// 검색 엔진용 구조화 데이터. 화면에 있는 사실(사업자 정보·FAQ)만 담고 후기·평점은 넣지 않는다.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: ["A컷", "ACUT"],
      legalName: "순한설기",
      url: SITE_URL,
      logo: `${SITE_URL}${BRAND_LOGO_PNG}`,
      email: "multihatter@gmail.com",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: ["A컷", "ACUT"],
      url: SITE_URL,
      inLanguage: "ko-KR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: LANDING_FAQ.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LandingPage />
    </>
  );
}
