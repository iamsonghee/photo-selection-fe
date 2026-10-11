import type { Metadata, Viewport } from "next";
import { EntryPage } from "@/components/entry/EntryPage";
import { BRAND_LOGO_PNG } from "@/lib/brand-assets";
import { OG_MAIN_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site-metadata";

const title = "A-CUT | 작가·스튜디오 · 내 사진 셀렉";
const description = "받은 사진을 직접 셀렉하거나, 고객과 사진·보정 요청을 주고받으세요.";

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

  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <EntryPage />
    </>
  );
}
