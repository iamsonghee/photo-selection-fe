/**
 * 순수 상수/함수만 포함 — next/headers 등 서버 전용 의존성이 없어 클라이언트 컴포넌트에서도
 * 안전하게 import할 수 있다. 세션을 읽는 getAdminUser()는 src/lib/admin-auth.ts에 있다.
 */
export const ADMIN_EMAILS = ["realsong88@gmail.com", "hilee6461@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
