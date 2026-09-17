import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const projectId = "11111111-1111-4111-8111-111111111111";
const scenarios: { width: number; height: number; fallback?: boolean; retry?: boolean }[] = [
  { width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 },
  { width: 1440, height: 1000, fallback: true }, { width: 390, height: 844, retry: true },
];
for (const viewport of scenarios) {
  test(`upload progress and storage confirmation at ${viewport.width}px${viewport.fallback ? " fallback" : viewport.retry ? " recovery" : ""}`, async ({ browser }, testInfo) => {
    test.setTimeout(60_000);
    let allowConfirm = () => {};
    let allowPreview = () => {};
    let finalized = false, recovered = false, previewRegistered = false, selectionActivated = false;
    const context = await browser.newContext({
      viewport,
      baseURL: testInfo.project.use.baseURL,
      ...(viewport.width < 768 ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    page.on("pageerror", error => console.error("upload browser error", error.message));
    try {
      const login = { userId: projectId };
      // Entirely mocked session: never contact the shared test account or production database.
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const jwt = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: projectId, aud: "authenticated", exp: expires })}.test-signature`;
      const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
      await context.addCookies([{ name: storageKey, value: `base64-${encode({ access_token: jwt, refresh_token: "mock-refresh", expires_at: expires,
        token_type: "bearer", user: { id: projectId, aud: "authenticated", role: "authenticated" } })}`,
        url: testInfo.project.use.baseURL!, sameSite: "Lax" }]);
      await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
      await page.route("**/api/photographer/**", route => route.fulfill({ json: {} }));
      // More-specific routes below take precedence over these read-only defaults.
      await page.route("**/auth/v1/user", route => route.fulfill({ json: {
        id: login.userId, aud: "authenticated", role: "authenticated", email: "upload-test@example.test",
        app_metadata: {}, user_metadata: {}, created_at: "2026-09-11T00:00:00Z",
      } }));
      await page.route("**/rest/v1/photographers?**", route => route.fulfill({ json: {
        id: projectId, auth_id: login.userId, name: "테스트 작가", studio_name: "테스트 작가",
      } }));
      await page.route("**/rest/v1/projects?**", route => route.fulfill({ json: {
        id: projectId, photographer_id: projectId, name: "업로드 진행률 검증", customer_name: "테스트",
        required_count: 1, photo_count: previewRegistered ? 1 : 0, status: "preparing", include_original: true,
        access_token: "test-upload-token", created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T00:00:00Z",
      } }));
      await page.route("**/rest/v1/photos?**", route => route.fulfill({ json: [] }));
      await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
        tier: "beta", current: 1, max: 50, maxPhotosPerProject: 1000, betaStatus: "approved",
      } }));
      await page.route("**/api/photographer/project-logs", route => route.fulfill({ json: { ok: true } }));
      await page.route(`**/api/photographer/projects/${projectId}/status`, async route => {
        expect(route.request().method()).toBe("PATCH");
        expect(route.request().postDataJSON()).toEqual({ status: "selecting" });
        selectionActivated = true;
        await route.fulfill({ json: { status: "selecting" } });
      });
      await page.route("**/originals/pending?**", route => route.fulfill({ json: { jobs: viewport.retry && finalized && !recovered ? [{
        id: "test-job", original_filename: "sample.jpg", original_file_size: null, original_last_modified: null, created_at: new Date().toISOString(),
      }] : [] } }));
      await page.route("**/originals/finalize", route => {
        finalized = true;
        return route.fulfill({ json: { ok: !viewport.retry, total: 1, accepted: viewport.retry ? 0 : 1, completed: viewport.retry ? 0 : 1, incomplete: viewport.retry ? 1 : 0, missing_jobs: 0 } });
      });
      await page.route("**/originals/presign", route => route.fulfill({ status: viewport.fallback ? 503 : 200, json: {
        deferred: false, url: "http://localhost:3001/__upload-test/r2", content_type: "image/jpeg", source_key: "test", expires_at: "2099-01-01",
      } }));
      await page.route("**/originals/recover", route => route.fulfill({ json: {
        status: "needs_upload", url: "http://localhost:3001/__upload-test/r2", content_type: "image/jpeg", source_key: "test",
      } }));
      const previewGate = new Promise<void>(resolve => { allowPreview = resolve; });
      const confirmation = new Promise<void>(resolve => { allowConfirm = resolve; });
      await page.route("**/originals/confirm", async route => {
        await confirmation;
        if (viewport.retry) recovered = true;
        await route.fulfill({ json: { ok: true } });
      });
      await page.route(/\/api\/(?:photographer\/)?upload\/photos$/, async route => {
        if (!viewport.fallback) await previewGate;
        const body = route.request().postDataBuffer()?.toString();
        expect(body).not.toContain('name="early_original_upload"');
        previewRegistered = true;
        await route.fulfill({ json: {
        uploaded: 1, rejected: [], original_presigned: [{ job_id: "test-job", url: "http://localhost:3001/__upload-test/r2", content_type: "image/jpeg", source_key: "test", expires_at: "2099-01-01" }],
      } });
      });
      // Deterministic slow PUT, only for our fake URL. All other XHRs use the real implementation.
      await page.addInitScript(({ retry }) => {
        const testWindow = window as unknown as { allowRecovery: boolean; putCount: number; advanceUpload?: (fraction: number, complete?: boolean) => void };
        testWindow.allowRecovery = false; testWindow.putCount = 0;
        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        const mocked = new WeakSet<XMLHttpRequest>();
        XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]) {
          if (method === "PUT" && String(url).includes("/__upload-test/r2")) mocked.add(this);
          return Reflect.apply(nativeOpen, this, [method, url, ...rest]);
        };
        XMLHttpRequest.prototype.send = function(body) {
          if (!mocked.has(this)) return nativeSend.call(this, body);
          testWindow.putCount++;
          if (retry && !testWindow.allowRecovery) {
            setTimeout(() => {
              Object.defineProperty(this, "status", { value: 500 });
              this.dispatchEvent(new ProgressEvent("load"));
            }, 20);
            return;
          }
          const size = (body as Blob).size;
          const progress = (fraction: number) => this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: Math.floor(size * fraction), total: size }));
          testWindow.advanceUpload = (fraction, complete = false) => {
            progress(fraction);
            if (complete) {
              Object.defineProperty(this, "status", { value: 200 });
              this.dispatchEvent(new ProgressEvent("load"));
              delete testWindow.advanceUpload;
            }
          };
        };
        (window as unknown as { uploadReports: unknown[] }).uploadReports = [];
        window.addEventListener("acut:upload-performance", event => (window as unknown as { uploadReports: unknown[] }).uploadReports.push((event as CustomEvent).detail));
      }, { retry: !!viewport.retry });
      const url = `/photographer/projects/${projectId}/upload`;
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(async error => {
        if (!String(error).includes("ERR_ABORTED")) throw error;
        await page.goto(url, { waitUntil: "domcontentloaded" });
      });
      const advance = async (fraction: number, complete = false) => {
        await expect.poll(() => page.evaluate(() => typeof (window as unknown as { advanceUpload?: unknown }).advanceUpload), { timeout: 15000 }).toBe("function");
        await page.evaluate(({ fraction, complete }) => (window as unknown as { advanceUpload: (n: number, complete: boolean) => void }).advanceUpload(fraction, complete), { fraction, complete });
      };
      await page.locator('input[type="file"]').first().setInputFiles(path.join(__dirname, "../../fixtures/sample.jpg"));
      await page.getByRole("button", { name: "업로드 시작", exact: true }).click();
      if (viewport.retry) {
        allowPreview();
        const retryButton = page.locator(".prj-mobile-progress").getByRole("button", { name: "실패 원본 1장 재시도" });
        await expect(retryButton).toBeVisible({ timeout: 30_000 });
        expect(await page.evaluate(() => (window as unknown as { putCount: number }).putCount)).toBe(5);
        await page.getByRole("button", { name: "업로드 오류 닫기", exact: true }).filter({ visible: true }).click();
        await expect(page.locator(".prj-mobile-progress")).toHaveCSS("opacity", "1");
        await expect(retryButton).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("original-recovery.png") });
        await page.evaluate(() => { (window as unknown as { allowRecovery: boolean }).allowRecovery = true; });
        allowConfirm();
        await retryButton.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
        await advance(1, true);
        await expect(page.getByText("원본 업로드 복구 완료!", { exact: true })).toBeVisible({ timeout: 15000 });
        expect(await page.evaluate(() => (window as unknown as { putCount: number }).putCount)).toBe(6);
        return;
      }
      const status = viewport.width < 768 ? page.locator(".prj-mobile-progress [role=status]") : page.locator(".prj-upload-bottom-status");
      if (viewport.width === 1440 && !viewport.fallback) {
        await page.getByRole("navigation", { name: "현재 위치" }).getByRole("button", { name: "업로드 진행률 검증", exact: true }).click();
        const leaveDialog = page.getByRole("dialog", { name: "사진 업로드가 진행 중입니다" });
        await expect(leaveDialog).toBeVisible();
        await leaveDialog.getByRole("button", { name: "업로드 계속" }).click();
        await expect(page).toHaveURL(url);
      }
      // 모든 기기에서 셀렉용 프리뷰 등록이 끝나기 전에는 원본 PUT을 시작하지 않는다.
      allowPreview();
      await advance(0.25);
      await expect(status).toContainText(/원본 전송 중 · 2[45]%/, { timeout: 20_000 });
      await expect(status).toContainText("0/1장 저장 완료");
      await expect(page.getByText("원본 업로드 중 · 화면을 닫지 마세요", { exact: true })).toBeVisible();
      await advance(0.75);
      await expect(status).toContainText(/7[45]%/);
      await expect(page.getByRole("button", { name: "셀렉 요청하기", exact: true })).toBeEnabled({ timeout: 15000 });
      if (viewport.width === 1440 && !viewport.fallback) {
        await page.getByRole("button", { name: "셀렉 요청하기", exact: true }).click();
        const requestDialog = page.getByRole("dialog", { name: "고객에게 셀렉 요청하기" });
        expect(await page.evaluate(() => typeof (window as unknown as { advanceUpload?: unknown }).advanceUpload)).toBe("function");
        await requestDialog.getByRole("checkbox").check();
        await requestDialog.getByRole("button", { name: "1장 셀렉 요청하기" }).click();
        const shareDialog = page.getByRole("dialog", { name: "고객 초대 링크가 활성화되었습니다" });
        await expect(shareDialog).toBeVisible();
        expect(selectionActivated).toBe(true);
        await shareDialog.getByText("닫기", { exact: true }).click();
      }
      await advance(1, true);
      await expect(status).toContainText("저장 확인 중");
      await expect(status).toContainText("0/1장 저장 완료");
      const box = await status.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      await page.screenshot({ path: testInfo.outputPath(`upload-${viewport.width}.png`) });
      allowConfirm();
      await expect(page.getByText("업로드 완료!", { exact: true })).toBeVisible({ timeout: 15000 });
      const reports = await page.evaluate(() => (window as unknown as { uploadReports: Array<{
        outcome: string;
        device: string;
        version?: number;
        originalConcurrency?: { initial: number; current: number; minimum: number; adjustments: number; measuredWindows: number } | null;
      }> }).uploadReports);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ outcome: "completed", device: viewport.width < 768 ? "mobile" : "pc" });
      if (viewport.width >= 768) {
        expect(reports[0]).toMatchObject({
          version: 3,
          originalConcurrency: { initial: 2, current: 2, minimum: 1, adjustments: 0, measuredWindows: 0 },
        });
      }
    } finally {
      allowPreview();
      allowConfirm();
      await context.close().catch(() => {});
    }
  });
}

test("activated project can reopen the upload page only to recover unfinished originals", async ({ browser }, testInfo) => {
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
    await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
    await page.route("**/api/photographer/**", route => route.fulfill({ json: {} }));
    await page.route("**/auth/v1/user", route => route.fulfill({ json: {
      id: projectId, aud: "authenticated", role: "authenticated", email: "recovery-test@example.test",
      app_metadata: {}, user_metadata: {}, created_at: "2026-09-17T00:00:00Z",
    } }));
    await page.route("**/rest/v1/photographers?**", route => route.fulfill({ json: {
      id: projectId, auth_id: projectId, name: "테스트 작가", studio_name: "테스트 작가",
    } }));
    await page.route("**/rest/v1/projects?**", route => route.fulfill({ json: {
      id: projectId, photographer_id: projectId, name: "원본 복구 검증", customer_name: "테스트",
      required_count: 1, photo_count: 2, status: "selecting", include_original: true,
      access_token: "test-upload-token", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
    } }));
    await page.route("**/rest/v1/photos?**", route => route.fulfill({ json: new URL(route.request().url()).searchParams.get("offset") === "0" ? [
      { id: "missing-original", project_id: projectId, number: 1, r2_thumb_url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", r2_preview_url: null, original_filename: "missing.jpg", original_status: "awaiting_upload" },
      { id: "processing-original", project_id: projectId, number: 2, r2_thumb_url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", r2_preview_url: null, original_filename: "processing.jpg", original_status: "processing" },
    ] : [] }));
    await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
      tier: "beta", current: 1, max: 50, maxPhotosPerProject: 1000, betaStatus: "approved",
    } }));
    await page.route("**/originals/pending?**", route => route.fulfill({ json: { jobs: [{
      id: "unfinished-job", original_filename: "sample.jpg", original_file_size: 1234,
      original_last_modified: 0, created_at: "2026-09-17T00:00:00Z",
    }] } }));
    await page.goto(`/photographer/projects/${projectId}/upload?recover=1`);
    await expect(page).toHaveURL(/\/upload\?recover=1$/);
    await expect(page.getByText("원본 1장 확인 필요 · 완료된 사진은 다시 보내지 않습니다", { exact: true })).toBeVisible();
    await expect(page.locator("[data-original-photo-card]").filter({ hasText: "원본 누락" })).toHaveCount(1);
    await expect(page.locator("[data-original-photo-card]").filter({ hasText: "processing.jpg" }).getByText("원본 누락", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "사진 추가" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("mobile registers every preview before allowing the first original PUT", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: testInfo.project.use.baseURL,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const jwt = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: projectId, aud: "authenticated", exp: expires })}.test-signature`;
    const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
    await context.addCookies([{ name: storageKey, value: `base64-${encode({ access_token: jwt, refresh_token: "mock-refresh", expires_at: expires,
      token_type: "bearer", user: { id: projectId, aud: "authenticated", role: "authenticated" } })}`,
      url: testInfo.project.use.baseURL!, sameSite: "Lax" }]);
    await page.addInitScript(() => {
      const state = window as unknown as { uploadOrder: string[] };
      state.uploadOrder = [];
      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSend = XMLHttpRequest.prototype.send;
      const mocked = new WeakSet<XMLHttpRequest>();
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]) {
        if (method === "PUT" && String(url).includes("/__upload-burst/r2")) mocked.add(this);
        return Reflect.apply(nativeOpen, this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.send = function(body) {
        if (!mocked.has(this)) return nativeSend.call(this, body);
        state.uploadOrder.push("original");
        const size = (body as Blob).size;
        this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: size, total: size }));
        Object.defineProperty(this, "status", { value: 200 });
        setTimeout(() => this.dispatchEvent(new ProgressEvent("load")), 0);
      };
    });
    let previewCount = 0;
    let reservationCount = 0;
    await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
    await page.route("**/api/photographer/**", route => route.fulfill({ json: {} }));
    await page.route("**/auth/v1/user", route => route.fulfill({ json: {
      id: projectId, aud: "authenticated", role: "authenticated", email: "burst-test@example.test",
      app_metadata: {}, user_metadata: {}, created_at: "2026-09-17T00:00:00Z",
    } }));
    await page.route("**/rest/v1/photographers?**", route => route.fulfill({ json: {
      id: projectId, auth_id: projectId, name: "테스트 작가", studio_name: "테스트 작가",
    } }));
    await page.route("**/rest/v1/projects?**", route => route.fulfill({ json: {
      id: projectId, photographer_id: projectId, name: "모바일 순서 검증", customer_name: "테스트",
      required_count: 1, photo_count: previewCount, status: "preparing", include_original: true,
      access_token: "test-upload-token", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
    } }));
    await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
      tier: "beta", current: 1, max: 50, maxPhotosPerProject: 1000, betaStatus: "approved",
    } }));
    await page.route("**/originals/pending?**", route => route.fulfill({ json: { jobs: [] } }));
    await page.route("**/originals/presign", route => {
      const index = ++reservationCount;
      return route.fulfill({ json: { deferred: false, url: `http://localhost:3001/__upload-burst/r2/${index}`,
        content_type: "image/jpeg", source_key: `source-${index}`, expires_at: "2099-01-01" } });
    });
    await page.route("**/originals/confirm", route => route.fulfill({ json: { ok: true } }));
    await page.route("**/originals/finalize", route => route.fulfill({ json: {
      ok: true, total: 6, accepted: 6, completed: 6, incomplete: 0, missing_jobs: 0,
    } }));
    await page.route(/\/api\/(?:photographer\/)?upload\/photos$/, async route => {
      const index = ++previewCount;
      await page.evaluate(() => (window as unknown as { uploadOrder: string[] }).uploadOrder.push("preview"));
      await route.fulfill({ json: { uploaded: 1, rejected: [], original_presigned: [{
        job_id: `job-${index}`, url: `http://localhost:3001/__upload-burst/r2/${index}`,
        content_type: "image/jpeg", source_key: `source-${index}`, expires_at: "2099-01-01",
      }] } });
    });

    await page.goto(`/photographer/projects/${projectId}/upload`);
    const sample = fs.readFileSync(path.join(__dirname, "../../fixtures/sample.jpg"));
    await page.locator('input[type="file"]').first().setInputFiles(Array.from({ length: 6 }, (_, index) => ({
      name: `sample-${index + 1}.jpg`, mimeType: "image/jpeg", buffer: sample,
    })));
    await page.getByRole("button", { name: "업로드 시작", exact: true }).click();
    await expect(page.getByText("업로드 완료!", { exact: true })).toBeVisible({ timeout: 30_000 });
    const order = await page.evaluate(() => (window as unknown as { uploadOrder: string[] }).uploadOrder);
    expect(reservationCount).toBe(0);
    expect(order.indexOf("original")).toBe(6);
    expect(order.filter((event) => event === "preview")).toHaveLength(6);
    expect(order.filter((event) => event === "original")).toHaveLength(6);
  } finally {
    await context.close();
  }
});
