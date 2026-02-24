import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoSelect — 사진작가를 위한 셀렉 워크플로우",
  description: "사진작가와 고객이 함께하는 사진 셀렉·보정 워크플로우",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[#0a0b0d] text-zinc-200 antialiased">
        {children}
      </body>
    </html>
  );
}
