/**
 * 로그인 후 돌아갈 경로를 브라우저에 잠깐 저장해뒀다가 사용한다.
 *
 * Supabase OAuth의 redirectTo URL에 쿼리스트링(`?next=`)을 얹는 방식은 Supabase 프로젝트의
 * "Redirect URLs" 허용 목록과 정확히 일치해야 통과되는데, 이 목록에 쿼리스트링 없는 콜백 URL만
 * 등록돼 있으면 OAuth 콜백 자체가 거부된다(대시보드 설정을 바꿔야 하는 외부 의존성이 생김).
 * 대신 redirectTo URL은 항상 그대로 두고(`/auth/callback`, 항상 `/photographer/dashboard`로
 * 이동), "다음엔 어디로 갈지"만 sessionStorage에 남겨뒀다가 그 착지 페이지에서 소비한다.
 */
const KEY = "acut_post_login_redirect";

export function setPostLoginRedirect(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // sessionStorage 접근 불가(프라이빗 모드 등) — 무시, 기본 목적지로 이동될 뿐
  }
}

/** 저장된 경로를 읽고 즉시 지운다(1회성). */
export function consumePostLoginRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    if (path) sessionStorage.removeItem(KEY);
    return path;
  } catch {
    return null;
  }
}

/**
 * 지우지 않고 값만 확인한다 — 착지 페이지가 첫 렌더에서(이펙트가 아니라) 곧바로 로딩 화면을
 * 보여줄지 판단하는 용도. 실제 소비(제거)는 여전히 `consumePostLoginRedirect()`가 담당한다.
 */
export function peekPostLoginRedirect(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
