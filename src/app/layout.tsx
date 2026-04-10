import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_LOGO_PNG } from "@/lib/brand-assets";

export const metadata: Metadata = {
  title: "PhotoSelect — 사진작가를 위한 셀렉 워크플로우",
  description: "사진작가와 고객이 함께하는 사진 셀렉·보정 워크플로우",
  icons: {
    icon: BRAND_LOGO_PNG,
    apple: BRAND_LOGO_PNG,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen bg-[#0a0b0d] text-zinc-200 antialiased"
        suppressHydrationWarning
      >
        {/* 확장(엔딕/WXT 등)이 DOM을 주입하면 hydration mismatch 발생. 직후 + rAF + 다음 태스크에 정리. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
function clean(){
  try {
    var el = document.getElementById('__endic_crx__');
    if (el) el.remove();
    document.querySelectorAll('[data-wxt-integrated]').forEach(function(e){ e.removeAttribute('data-wxt-integrated'); });
  } catch (_) {}
}
clean();
if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(clean);
setTimeout(clean, 0);
`,
          }}
        />
        <div suppressHydrationWarning className="contents">
          {children}
        </div>
      </body>
    </html>
  );
}
