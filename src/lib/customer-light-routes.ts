/**
 * 고객 화면 중 "라이트"(흰 바탕) 화면인지 판별한다.
 *
 * 사진 상세(셀렉 뷰어 `/viewer/[photoId]`, 보정본 검토 상세 `/review/[photoId]`)와
 * 소개 화면(`/about`)은 의도적으로 다크라 제외한다 — Dark Photo Workspace 전역
 * 배경(`--background`)과 이미 같은 색이라 새는 곳이 없다.
 *
 * 작가 쪽 `isPhotographerLightRoute`(src/lib/photographer-sidebar-routes.ts)와
 * 같은 목적·같은 모양의 판별기다.
 */
export function isCustomerLightRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const segments = pathname.split("/").filter(Boolean);
  // ["c", token, ...rest] — token은 매번 달라 값으로 비교하지 않고 자리만 확인한다.
  if (segments[0] !== "c" || !segments[1]) return false;
  const rest = segments.slice(2);
  if (rest.length === 0) return true; // /c/[token] — 초대 화면
  if (rest.length !== 1) return false; // 사진 상세( .../viewer/[photoId] 등)는 다크
  return ["gallery", "locked", "review", "delivered", "confirmed", "pin"].includes(rest[0]);
}
