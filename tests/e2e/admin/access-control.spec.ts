import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

/**
 * /admin/** 접근 제어 회귀 테스트.
 *
 * App Router에서 layout과 자식 page는 병렬로 렌더링될 수 있어, layout의 redirect()만으로는
 * 인증되지 않은 요청에도 자식 page의 데이터(실제 작가 이메일, 프로젝트명 등)가 RSC 스트림에
 * 실려 응답 본문에 포함되는 것을 막지 못했다(발견 시점: 2026-07-26). 실제 브라우저는 클라이언트
 * 라우터가 곧바로 재이동시켜 화면엔 안 보이지만, raw HTTP 응답 자체에는 데이터가 이미 담겨 있었다.
 * 미들웨어(`src/middleware.ts`)에서 렌더링 시작 전에 진짜 HTTP 리다이렉트를 보내도록 수정했다.
 *
 * 이 테스트는 `page.request`(브라우저 JS 실행 없이 raw HTTP 요청)로 정확히 그 취약점 재현 조건을
 * 검사한다 — `page.goto()`로는 클라이언트 라우팅이 데이터를 가려버려 이 문제를 잡아내지 못한다.
 */

const ADMIN_ROUTES = ["/admin", "/admin/projects", "/admin/users", "/admin/settings", "/admin/feedback", "/admin/logs"];

test.describe("관리자 — 접근 제어(raw HTTP, 데이터 유출 방지)", () => {
  test("비로그인 상태로 /admin/** raw 요청 시 즉시 리다이렉트되고 응답 본문에 데이터가 전혀 없다", async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      const res = await page.request.get(route, { maxRedirects: 0 }).catch((e) => e);
      // Playwright는 3xx를 기본적으로 따라가므로 maxRedirects:0으로 리다이렉트 자체를 검사한다.
      expect(res.status(), `${route} 는 리다이렉트(3xx)여야 함`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      const location = res.headers()["location"];
      expect(location, `${route} 의 Location 헤더`).toBe("/");

      // 리다이렉트 응답 본문에 리다이렉트 대상 경로 외의 실제 데이터(이메일, 프로젝트/작가 정보 등)가
      // 없어야 한다 — 정확히 0바이트일 필요는 없다(Next.js가 리다이렉트 경로 자체를 폴백 본문으로
      // 넣는 것은 정상). 이 취약점의 특징적 마커(RSC 컴포넌트 트리 직렬화, 실제 이메일 등)만 검사한다.
      const body = await res.text();
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toContain("photographerName");
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toMatch(/@gmail\.com|@naver\.com/);
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toContain('"$');
    }
  });

  test("관리자가 아닌 로그인 사용자가 /admin/** raw 요청 시 /photographer/dashboard로 리다이렉트되고 데이터가 없다", async ({ page }) => {
    await loginAsPhotographer(page);

    for (const route of ADMIN_ROUTES) {
      const res = await page.request.get(route, { maxRedirects: 0 });
      expect(res.status(), `${route} 는 리다이렉트(3xx)여야 함`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      const location = res.headers()["location"];
      expect(location, `${route} 의 Location 헤더`).toBe("/photographer/dashboard");

      // 리다이렉트 응답 본문에 리다이렉트 대상 경로 외의 실제 데이터(이메일, 프로젝트/작가 정보 등)가
      // 없어야 한다 — 정확히 0바이트일 필요는 없다(Next.js가 리다이렉트 경로 자체를 폴백 본문으로
      // 넣는 것은 정상). 이 취약점의 특징적 마커(RSC 컴포넌트 트리 직렬화, 실제 이메일 등)만 검사한다.
      const body = await res.text();
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toContain("photographerName");
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toMatch(/@gmail\.com|@naver\.com/);
      expect(body, `${route} 응답 본문에 민감 데이터가 없어야 함`).not.toContain('"$');
    }
  });
});
