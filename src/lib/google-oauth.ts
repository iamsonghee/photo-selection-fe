/**
 * Google OAuth에 전달하는 쿼리 파라미터.
 * prompt=select_account 로 계정 선택 화면을 띄워, 로그아웃 후에도 다른 구글 계정으로 로그인할 수 있게 한다.
 */
export const GOOGLE_OAUTH_QUERY_PARAMS = {
  prompt: "select_account",
} as const;
