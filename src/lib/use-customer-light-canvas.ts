"use client";

import { useEffect } from "react";

/**
 * 고객 라이트 화면이 켜져 있는 동안 `body` 바탕을 흰색으로 바꾼다.
 *
 * 고객 셸(`.customer-app-shell`)과 전역 `body`는 Dark Photo Workspace 팔레트(`--background`,
 * `#0a0b0d`)를 쓰고, 라이트 화면은 그 위에 자기 흰 판을 덮는 방식이다. 그래서 **자기 판이 못 덮는
 * 순간마다 검은 바탕이 드러난다**:
 *
 * - 모바일에서 스크롤을 끝까지 당길 때의 러버밴드(overscroll)
 * - 주소창이 접혔다 펴지며 `100dvh`가 실제 보이는 높이보다 잠깐 작아질 때
 *
 * 두 경우 모두 드러나는 것은 화면의 배경이 아니라 **`body`의 배경**이라, 페이지 안쪽을 아무리
 * 흰색으로 칠해도 막을 수 없다. 라이트 화면에서만 `body`를 흰색으로 바꾸고 나갈 때 되돌린다
 * (다크 화면 — 셀렉 뷰어·보정본 검토 상세 — 은 이 훅을 쓰지 않으므로 그대로 어둡다).
 */
export function useCustomerLightCanvas() {
  useEffect(() => {
    const { style } = document.body;
    const previous = style.backgroundColor;
    style.backgroundColor = "#ffffff";
    return () => { style.backgroundColor = previous; };
  }, []);
}
