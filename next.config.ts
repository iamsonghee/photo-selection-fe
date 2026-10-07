import type { NextConfig } from "next";

// 고객 사진·작가 작업·관리 화면과 API는 검색에 노출하지 않는다(색인 대상은 src/app/sitemap.ts).
const NOINDEX_SOURCES = [
  "/c/:path*",
  "/g/:path*",
  "/photographer/:path*",
  "/customer-select/:path*",
  "/admin/:path*",
  "/auth/:path*",
  "/api/:path*",
  "/beta/apply/complete",
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return NOINDEX_SOURCES.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  async redirects() {
    // `/`와 같은 랜딩을 그리던 중복 주소. 외부에 남은 링크는 홈으로 보낸다.
    return [{ source: "/landing", destination: "/", permanent: true }];
  },
  // 아이폰 실기기 LAN/터널 테스트용 — BE의 무료 cloudflared 터널이 자주 끊겨서 대신 FE(ngrok
  // 고정 도메인) 하나만 공개하고, 브라우저의 /api-be 요청을 이 dev 서버가 로컬 BE로 프록시한다.
  // 프로덕션 빌드에서는 비활성화.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api-be/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
