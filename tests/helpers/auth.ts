// eslint-disable-next-line @typescript-eslint/no-require-imports
type Page = import("@playwright/test").Page;

/**
 * 테스트용 작가 계정으로 로그인.
 * page.request 는 브라우저 컨텍스트와 쿠키를 공유하므로
 * 이 함수 호출 후 page.goto() 를 하면 인증 상태가 유지됩니다.
 */
export async function loginAsPhotographer(page: Page) {
  const res = await page.request.post("/api/auth/test-login", {
    data: {
      email: process.env.TEST_PHOTOGRAPHER_EMAIL!,
      password: process.env.TEST_PHOTOGRAPHER_PASSWORD!,
    },
  });

  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`Login failed (${res.status()}): ${body}`);
  }

  return res.json();
}
