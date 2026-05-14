import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import path from "path";

// .env.local 로드 (TEST_PHOTOGRAPHER_EMAIL, TEST_PHOTOGRAPHER_PASSWORD, ENABLE_TEST_LOGIN)
config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,      // 테스트 간 세션 충돌 방지
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                // 순차 실행 (DB 상태 일관성)
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 쿠키 자동 관리 (page.request.post → 브라우저 컨텍스트 공유)
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // 로컬에서 Next.js 서버 자동 시작
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev -- -p 3001",
        url: "http://localhost:3001",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
