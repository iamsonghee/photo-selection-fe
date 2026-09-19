"use client";

import { useEffect } from "react";

/** 순백 고객 캔버스가 켜진 동안 overscroll 영역의 `body`도 같은 색으로 맞춘다. */
export function useCustomerLightCanvas() {
  useEffect(() => {
    const { style } = document.body;
    const previous = style.backgroundColor;
    style.backgroundColor = "#ffffff";
    return () => { style.backgroundColor = previous; };
  }, []);
}
