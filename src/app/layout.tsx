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
    <html lang="ko" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#0a0b0d] text-zinc-200 antialiased"
        suppressHydrationWarning
      >
        {/* 확장 프로그램(엔딕, WXT 등)이 body 직하위에 노드를 주입하면 Next 뷰포트/메타 경계와
            hydration mismatch가 발생할 수 있음. 개발 시 시크릿 창 또는 확장 비활성화로 확인 권장. */}
        <div suppressHydrationWarning className="contents">
          {children}
        </div>
      </body>
    </html>
  );
}
