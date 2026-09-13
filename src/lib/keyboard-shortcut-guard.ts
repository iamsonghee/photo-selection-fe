/**
 * 앱 단축키가 브라우저/OS가 이미 쓰고 있는 조합키를 가로채지 않게 막는 공통 가드.
 *
 * (2026-09-13) 보정본 검토 상세의 `R`(재보정) 단축키가 `e.code === "KeyR"`만 보고 반응해서,
 * 맥에서 새로고침(Cmd+R)을 누르면 재보정 버튼이 같이 눌렸다 — Cmd/Ctrl이 눌려 있는지는
 * 전혀 확인하지 않았기 때문이다. 같은 패턴(`e.code`/`e.key`만 비교)을 쓰는 다른 화면들을
 * 훑어보니 같은 문제가 더 있었다:
 *
 *  - `Digit1`~`Digit5`(고객 뷰어 별점) — Cmd/Ctrl+1~9는 브라우저 탭 전환(Chrome·Edge·Firefox·
 *    Safari, 맥·윈도우 공통)
 *  - `KeyF`(고객 뷰어 찜) — Cmd/Ctrl+F는 페이지 내 찾기
 *  - `KeyG`(작가 원본 뷰어 그룹 토글) — Cmd/Ctrl+G는 다음 찾기(Safari·Firefox·Chrome)
 *  - 방향키(사진 이동 전반) — **윈도우**에서 Alt+←/→는 브라우저 뒤로/앞으로 가기다. 이 앱의
 *    방향키 핸들러들이 전부 `e.preventDefault()`를 부르므로, 윈도우 사용자가 Alt+←로 뒤로
 *    가려 하면 그 자체가 씹히고 대신 사진이 넘어갔다.
 *
 * 다섯 군데 전부 같은 결함(조합키 미확인)이라 한 함수로 묶는다. 새 단축키 핸들러를 추가할 때도
 * 이 함수를 분기 맨 앞에서 부르면 이 사고가 다시 나지 않는다.
 *
 * Shift는 일부러 뺐다 — `Shift+/`(=`?`, 도움말 열기)처럼 이 앱이 의도적으로 쓰는 조합이 있고,
 * bare Shift+글자는 이 목록의 조합키들과 달리 브라우저/OS가 전역으로 예약해 둔 게 없다.
 */
export function hasShortcutModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}
