import { expect, test } from "@playwright/test";

test("원본 포함 프로젝트의 미전송 원본 수를 목록 경고 배지로 표시한다", async ({ browser }, testInfo) => {
  const projectId = "22222222-2222-4222-8222-222222222222";
  let recoveryQuerySeen = false;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  try {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const jwt = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: projectId, aud: "authenticated", exp: expires })}.test-signature`;
    const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
    await context.addCookies([{ name: storageKey, value: `base64-${encode({ access_token: jwt, refresh_token: "mock-refresh", expires_at: expires,
      token_type: "bearer", user: { id: projectId, aud: "authenticated", role: "authenticated" } })}`,
      url: testInfo.project.use.baseURL!, sameSite: "Lax" }]);
    await page.route("**/auth/v1/user", route => route.fulfill({ json: {
      id: projectId, aud: "authenticated", role: "authenticated", email: "warning-test@example.test",
      app_metadata: {}, user_metadata: {}, created_at: "2026-09-18T00:00:00Z",
    } }));
    await page.route("**/rest/v1/photographers?**", route => route.fulfill({ json: {
      id: projectId, auth_id: projectId, name: "테스트 작가", studio_name: "테스트 작가",
    } }));
    await page.route("**/api/photographer/profile", route => route.fulfill({ json: {
      id: projectId, authId: projectId, name: "테스트 작가", studioName: "테스트 작가",
      email: "warning-test@example.test",
    } }));
    await page.route("**/rest/v1/projects?**", route => route.fulfill({ json: [{
      id: projectId, photographer_id: projectId, name: "원본 누락 프로젝트", customer_name: "테스트 고객",
      shoot_date: "2026-09-18", deadline: "2026-09-30", required_count: 1, photo_count: 3,
      status: "selecting", include_original: true, access_token: "warning-token", max_revision_count: 0,
      revision_round: 0, cover_photo_id: null, created_at: "2026-09-18T00:00:00Z", updated_at: "2026-09-18T00:00:00Z",
    }] }));
    await page.route("**/rest/v1/photos?**", route => {
      const url = decodeURIComponent(route.request().url());
      recoveryQuerySeen ||= url.includes("original_status.is.null") && url.includes("awaiting_upload") && url.includes("failed");
      return url.includes("original_status")
        ? route.fulfill({ status: 200, headers: {
            "access-control-expose-headers": "Content-Range",
            "content-range": "0-1/2",
          } })
        : route.fulfill({ json: [] });
    });
    await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
      tier: "beta", current: 1, max: 10, maxPhotosPerProject: 2000, betaStatus: "approved",
    } }));

    await page.goto("/photographer/projects");
    await expect(page.getByRole("region", { name: "PC 프로젝트 목록" })
      .getByText("원본 미업로드 2장", { exact: true })).toBeVisible();
    expect(recoveryQuerySeen).toBe(true);
  } finally {
    await context.close();
  }
});
