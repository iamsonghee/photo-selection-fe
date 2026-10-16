import { chromium, webkit, expect, test } from "@playwright/test";

const projectId = "11111111-1111-4111-8111-111111111111";

for (const browserName of ["chromium", "webkit"] as const) {
  test(`${browserName}: mobile selected delete opens confirmation and submits once`, async ({}, testInfo) => {
    test.setTimeout(60_000);
    const browser = await ({ chromium, webkit })[browserName].launch({ timeout: 15_000 });
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL,
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      // Mock both session and data so this regression never deletes real photos.
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const jwt = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: projectId, aud: "authenticated", exp: expires })}.test-signature`;
      const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
      await context.addCookies([{ name: storageKey, value: `base64-${encode({ access_token: jwt,
        refresh_token: "mock-refresh", expires_at: expires, token_type: "bearer",
        user: { id: projectId, aud: "authenticated", role: "authenticated" } })}`,
        url: testInfo.project.use.baseURL!, sameSite: "Lax" }]);
      let deleted = false;
      let deleteRequests = 0;
      await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
      await page.route("**/api/photographer/**", route => route.fulfill({ json: {} }));
      await page.route("**/auth/v1/user", route => route.fulfill({ json: {
        id: projectId, aud: "authenticated", role: "authenticated", email: "delete-test@example.test",
        app_metadata: {}, user_metadata: {}, created_at: "2026-10-16T00:00:00Z",
      } }));
      await page.route("**/rest/v1/photographers?**", route => route.fulfill({ json: {
        id: projectId, auth_id: projectId, name: "테스트 작가",
      } }));
      await page.route("**/rest/v1/projects?**", route => route.fulfill({ json: {
        id: projectId, photographer_id: projectId, name: "선택 삭제 검증", customer_name: "테스트",
        required_count: 1, photo_count: deleted ? 0 : 1, status: "preparing", include_original: false,
        access_token: "test-delete-token", created_at: "2026-10-16T00:00:00Z",
      } }));
      await page.route("**/rest/v1/photos?**", route => route.fulfill({ json:
        !deleted && new URL(route.request().url()).searchParams.get("offset") === "0" ? [{
          id: "test-photo", project_id: projectId, number: 1, original_filename: "sample.jpg",
          r2_thumb_url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        }] : [],
      }));
      await page.route(`**/api/photographer/projects/${projectId}/photos/selected`, route => {
        expect(route.request().method()).toBe("DELETE");
        expect(route.request().postDataJSON()).toEqual({ photoIds: ["test-photo"] });
        deleteRequests++;
        deleted = true;
        return route.fulfill({ json: { deletedCount: 1, photoCount: 0 } });
      });
      await page.goto(`/photographer/projects/${projectId}/upload`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-mobile-selection-checkbox]").tap();
      const more = page.locator('summary[aria-label="선택 사진 작업 더보기"]');
      await more.tap();
      await page.getByRole("menuitem", { name: "사진 1장 삭제", exact: true }).tap();
      const dialog = page.getByRole("dialog", { name: "원본 1장을 삭제할까요?", exact: true });
      await expect(dialog).toBeVisible();
      expect(deleteRequests).toBe(0);
      await dialog.getByRole("button", { name: "취소", exact: true }).tap();
      await expect(dialog).toBeHidden();
      await more.tap();
      await page.getByRole("menuitem", { name: "사진 1장 삭제", exact: true }).tap();
      await dialog.getByRole("button", { name: "원본 삭제", exact: true }).tap();
      await expect(page.locator("[data-original-photo-card]")).toHaveCount(0);
      await expect(dialog).toBeHidden();
      expect(deleteRequests).toBe(1);
    } finally {
      await browser.close();
    }
  });
}
