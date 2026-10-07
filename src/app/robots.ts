import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";

/**
 * 고객·작가·관리자 화면은 next.config.ts의 `X-Robots-Tag: noindex`로 검색에서 뺀다.
 * 크롤러가 그 헤더를 읽어야 하므로 여기서는 막지 않고, 크롤링 자체가 필요 없는 API·인증 콜백만 막는다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
