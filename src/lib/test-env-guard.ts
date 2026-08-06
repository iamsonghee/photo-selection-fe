import "server-only";

/**
 * 테스트 전용 API(test-login/test-setup) 활성화 여부.
 * VERCEL_ENV가 "production"이면 ENABLE_TEST_LOGIN 값과 무관하게 항상 비활성화한다
 * (Vercel 환경변수 설정 실수로 프로덕션에 인증 우회가 뚫리는 것을 코드 레벨에서 차단).
 */
export function isTestLoginEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.ENABLE_TEST_LOGIN === "true";
}
