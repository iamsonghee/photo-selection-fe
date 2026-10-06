/**
 * 로그인 후 돌아갈 경로를 OAuth 왕복 동안 쿠키에 잠깐 남겨두고, `/auth/callback`이 서버에서 읽어
 * 그 경로로 바로 보낸다.
 *
 * Supabase OAuth의 redirectTo URL에 쿼리스트링(`?next=`)을 얹는 방식은 Supabase 프로젝트의
 * "Redirect URLs" 허용 목록과 정확히 일치해야 통과되는데, 실제로 콜백이 거부됐다(2026-07-27 실측).
 * 그래서 redirectTo URL은 항상 `/auth/callback` 그대로 두고 목적지만 따로 전달한다.
 *
 * 2026-07-27~10-06에는 sessionStorage에 남겨 작가 대시보드(`/photographer/dashboard`)가 소비했다.
 * 그 구조에서는 셀프 고객도 로그인마다 작가 대시보드를 거쳐야 했고(sessionStorage가 막힌 환경에서는
 * 거기 남음), 콜백이 로그인 출처를 몰라 셀프 고객 로그인에도 작가 가입·첫 로그인 지표가 쌓였다.
 * 쿠키는 Supabase의 PKCE code verifier 쿠키와 같은 경로(SameSite=Lax 최상위 이동)로 콜백에
 * 도착하므로, 로그인이 되는 환경이면 늘 함께 온다. 콜백이 읽은 뒤 지운다.
 */
export const POST_LOGIN_REDIRECT_COOKIE = "acut_post_login_redirect";

/** 복귀 경로가 없거나 신뢰할 수 없을 때 도착하는 기본 경로. */
export const DEFAULT_POST_LOGIN_PATH = "/photographer/dashboard";

/** 셀프 고객 서비스의 로그인 착지. 이 경로로 시작한 로그인은 작가 가입·첫 로그인 지표를 남기지 않는다. */
export const CUSTOMER_SELECT_POST_LOGIN_PATH = "/customer-select";

/** OAuth 동의 화면에서 머무는 시간을 넉넉히 덮되, 취소한 시도가 오래 남지는 않게. */
const POST_LOGIN_REDIRECT_MAX_AGE_SECONDS = 10 * 60;

/**
 * 쿠키(또는 쿼리)로 받은 복귀 경로 중 같은 출처의 절대 경로만 통과시킨다 — 열린 리다이렉트 방지.
 * 비어 있거나 신뢰할 수 없으면 기본 목적지.
 */
export function resolvePostLoginPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_POST_LOGIN_PATH;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (path.length > 512) return DEFAULT_POST_LOGIN_PATH;
  // `//host`·`/\host`는 브라우저가 다른 출처로 해석한다. 공백·제어 문자는 헤더 주입 여지가 있다.
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return DEFAULT_POST_LOGIN_PATH;
  if (/[\s\u0000-\u001f\u007f]/.test(path)) return DEFAULT_POST_LOGIN_PATH;
  return path;
}

/** 셀프 고객 서비스에서 시작한 로그인인지 — 콜백이 작가 지표 기록을 건너뛰는 기준. */
export function isCustomerSelectLogin(path: string): boolean {
  return path === CUSTOMER_SELECT_POST_LOGIN_PATH || path.startsWith(`${CUSTOMER_SELECT_POST_LOGIN_PATH}/`);
}

/** 로그인 시작 직전에 호출한다. 기본 목적지는 저장하지 않아도 되지만 저장해도 같은 곳으로 간다. */
export function setPostLoginRedirect(path: string): void {
  writePostLoginCookie(encodeURIComponent(path), POST_LOGIN_REDIRECT_MAX_AGE_SECONDS);
}

/** 취소된 이전 시도의 복귀 경로가 다음 로그인에 재사용되지 않게 지운다. */
export function clearPostLoginRedirect(): void {
  writePostLoginCookie("", 0);
}

function writePostLoginCookie(value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  // http://localhost에서는 Secure 쿠키가 무시되므로 https일 때만 붙인다(supabase/client.ts와 같은 규칙).
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${POST_LOGIN_REDIRECT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
