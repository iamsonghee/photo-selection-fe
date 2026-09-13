import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
