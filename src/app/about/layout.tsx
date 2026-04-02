import type { Metadata } from "next";
import Script from "next/script";
import "./about.css";

export const metadata: Metadata = {
  title: "PhotoSelect 소개 — 사진작가와 고객을 잇는 셀렉 워크플로우",
  description:
    "업로드부터 셀렉, 보정·납품까지 한곳에서. 링크 공유 한 번으로 고객과 작업을 정리하세요.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://code.iconify.design/iconify-icon/2.3.0/iconify-icon.min.js"
        strategy="lazyOnload"
      />
      {children}
    </>
  );
}
