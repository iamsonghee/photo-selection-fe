/**
 * Phase A — PIN 쿠키 인증 e2e 테스트
 *
 * 실행: npx playwright test tests/e2e/customer/pin-auth.spec.ts
 *
 * 전제: .env.local 에 PIN_COOKIE_SECRET 설정 필요.
 * 테스트 프로젝트는 PIN 없는 프로젝트(access_pin = null)로 생성.
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "crypto";
import { setupFullProject, setProjectPin, deleteTestProject, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

// ─── 서명 헬퍼 (customer-auth-server.ts 와 동일) ─────────────────────────

const SECRET = process.env.PIN_COOKIE_SECRET ?? "";

function signCookie(token: string, timestampOverride?: number): string {
  const timestamp = (timestampOverride ?? Math.floor(Date.now() / 1000)).toString();
  const sig = createHmac("sha256", SECRET)
    .update(`${token}:${timestamp}`)
    .digest("base64url");
  return `${timestamp}.${sig}`;
}

function cookieName(token: string) {
  return `pin_verified_${token}`;
}

// ─── 테스트 픽스처 ─────────────────────────────────────────────────────────

let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 3);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

// ─── 공통: 쿠키를 직접 세팅해서 /api/c/photos 호출 ──────────────────────

async function callPhotosApi(
  context: BrowserContext,
  token: string,
  cookieValue: string | null
) {
  if (cookieValue !== null) {
    await context.addCookies([
      {
        name: cookieName(token),
        value: cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  const res = await context.request.get(
    `/api/c/photos?token=${encodeURIComponent(token)}`
  );
  return res;
}

// ─── 테스트 케이스 ─────────────────────────────────────────────────────────

test.describe("Phase A — PIN 쿠키 인증", () => {
  test("T1: PIN 쿠키 없이 /api/c/photos 호출 → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const res = await callPhotosApi(ctx, project.accessToken, null);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    await ctx.close();
  });

  test("T2: 위조 쿠키 '1' → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const res = await callPhotosApi(ctx, project.accessToken, "1");
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("T3: 다른 token으로 서명한 쿠키 → 401", async ({ browser }) => {
    if (!SECRET) {
      test.skip(true, "PIN_COOKIE_SECRET not set — skipping crypto tests");
      return;
    }
    const ctx = await browser.newContext();
    // 다른 token으로 서명한 유효한 쿠키를 현재 token 이름으로 세팅
    const wrongTokenCookie = signCookie("completely-different-token");
    const res = await callPhotosApi(ctx, project.accessToken, wrongTokenCookie);
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("T4: 만료된 쿠키 (timestamp 25시간 전) → 401", async ({ browser }) => {
    if (!SECRET) {
      test.skip(true, "PIN_COOKIE_SECRET not set — skipping crypto tests");
      return;
    }
    const ctx = await browser.newContext();
    const expiredTs = Math.floor(Date.now() / 1000) - 25 * 3600;
    const expiredCookie = signCookie(project.accessToken, expiredTs);
    const res = await callPhotosApi(ctx, project.accessToken, expiredCookie);
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("T5: 정상 PIN 인증 후 /api/c/photos → 200", async ({ browser }) => {
    if (!SECRET) {
      test.skip(true, "PIN_COOKIE_SECRET not set — restart dev server after adding to .env.local");
      return;
    }
    const ctx = await browser.newContext();
    // PIN 없는 프로젝트 → 직접 서명 쿠키로 검증
    const validCookie = signCookie(project.accessToken);
    const res = await callPhotosApi(ctx, project.accessToken, validCookie);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("project");
    expect(body).toHaveProperty("photos");
    await ctx.close();
  });

  test("T5b: 직접 서명한 쿠키 세팅 후 /api/c/photos → 200", async ({ browser }) => {
    if (!SECRET) {
      test.skip(true, "PIN_COOKIE_SECRET not set — skipping crypto tests");
      return;
    }
    const ctx = await browser.newContext();
    const validCookie = signCookie(project.accessToken);
    const res = await callPhotosApi(ctx, project.accessToken, validCookie);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("project");
    await ctx.close();
  });
});

// ─── middleware redirect 확인 ─────────────────────────────────────────────

test.describe("Phase A — middleware redirect", () => {
  test("M1: 쿠키 없이 /c/TOKEN/gallery 접근 → middleware가 /pin으로 redirect", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // redirect 경로 수집 (302/307/308 응답의 Location 헤더)
    const redirectedVia: string[] = [];
    page.on("response", (res) => {
      if ([302, 307, 308].includes(res.status())) {
        redirectedVia.push(res.headers()["location"] ?? "");
      }
    });

    // PIN 없는 프로젝트: middleware → /pin → auto-verify → (쿠키 발급) → /gallery 복귀
    // 최종 URL은 다시 /gallery 가 될 수 있으므로 최종 URL이 아닌 redirect 체인으로 검증
    await page.goto(`/c/${project.accessToken}/gallery`);

    // middleware 의 첫 redirect 목적지가 /pin 을 경유했는지 확인
    expect(redirectedVia.some((url) => url.includes("/pin"))).toBe(true);
    await ctx.close();
  });

  test("M2: 정상 쿠키로 /c/TOKEN/gallery 접근 → redirect 없음", async ({ browser }) => {
    if (!SECRET) {
      test.skip(true, "PIN_COOKIE_SECRET not set — skipping crypto tests");
      return;
    }
    const ctx = await browser.newContext();
    await ctx.addCookies([
      {
        name: cookieName(project.accessToken),
        value: signCookie(project.accessToken),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await ctx.newPage();
    await page.goto(`/c/${project.accessToken}/gallery`, { waitUntil: "commit" });
    // pin 페이지로 redirect 되지 않아야 함
    expect(page.url()).not.toContain("/pin");
    await ctx.close();
  });
});

// ─── PIN 폼 UI 흐름 (regression: 인증 직후 목적지 렌더링) ────────────────────
// BUG-001: PinForm 성공 후 router.replace(from) 로 클라이언트 사이드 전환하면
// [token] 세그먼트를 감싸는 SelectionProvider가 리마운트되지 않아 /pin 페이지
// 진입 시 이미 실패했던 /api/c/photos fetch 결과(project=null)가 유지되어
// 갤러리가 "INVALID_TOKEN"을 표시했다. window.location.href 로 전체 페이지
// 이동을 강제해 새 쿠키로 fetch가 재실행되도록 수정했다.
test.describe("Phase A — PIN 폼 UI 흐름", () => {
  let pinProject: TestProject;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    pinProject = await setupFullProject(page, 3);
    await setProjectPin(page, pinProject.projectId, "1234");
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!pinProject?.projectId) return;
    const page = await browser.newPage();
    await loginAsPhotographer(page);
    await deleteTestProject(page, pinProject.projectId);
    await page.close();
  });

  test("U1: 올바른 PIN 입력 후 새로고침 없이 갤러리가 정상 렌더링된다", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(pinProject.galleryUrl);
    await expect(page).toHaveURL(/\/pin/);

    for (const digit of "1234") {
      await page.keyboard.press(digit);
    }

    await page.waitForURL(/\/gallery/, { timeout: 10_000 });
    await expect(page.locator(".gl-header-project-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("INVALID_TOKEN")).toHaveCount(0);

    await ctx.close();
  });
});
