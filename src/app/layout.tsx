import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_APPLE_TOUCH_ICON_PNG, BRAND_MARK_SVG } from "@/lib/brand-assets";
import { SITE_URL } from "@/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "A-CUT — 사진작가를 위한 셀렉 워크플로우",
  description: "사진작가와 고객이 함께하는 사진 셀렉·보정 워크플로우",
  icons: {
    icon: [{ url: BRAND_MARK_SVG, type: "image/svg+xml" }],
    apple: [{ url: BRAND_APPLE_TOUCH_ICON_PNG, sizes: "180x180", type: "image/png" }],
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
      <body
        className="min-h-screen bg-background text-foreground antialiased"
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
