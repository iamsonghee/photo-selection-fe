"use client";

import { useEffect } from "react";

/**
 * active 동안 화면 자동 꺼짐(과 그로 인한 노트북 자동 절전)을 막는다 — 업로드가 멈추지 않게.
 * 사용자가 직접 화면을 끄거나 앱을 전환하는 건 못 막는다. 미지원 브라우저에서는 아무것도 안 한다.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // 거부(저전력 모드·숨겨진 탭 등)는 무시 — 기존 이탈 경고가 남아 있다.
      }
    };
    // 탭을 벗어나면 브라우저가 잠금을 자동 해제하므로 돌아올 때 다시 요청한다.
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
