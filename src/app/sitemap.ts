import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";

/**
 * 검색에 노출할 공개 페이지. 정확한 수정일을 알 수 없어 lastModified는 넣지 않는다
 * (부정확한 lastmod는 검색 엔진이 무시하게 된다). 공개 페이지를 추가하면 여기에도 넣는다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/beta/apply", "/terms", "/privacy"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
