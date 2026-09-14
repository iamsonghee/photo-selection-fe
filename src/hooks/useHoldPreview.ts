"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_DELAY_MS = 300;
const DEFAULT_MOVE_TOLERANCE_PX = 10;

type UseHoldPreviewOptions = {
  enabled: boolean;
  resetKey?: unknown;
  captureTarget?: "currentTarget" | "eventTarget";
  delayMs?: number;
  moveTolerancePx?: number;
  onActivated?: () => void;
};

/**
 * 사진을 누르는 동안 비교 이미지를 보여주는 공통 상호작용.
 *
 * 고객·작가 뷰어가 타이머와 종료 이벤트를 따로 구현하면 특정 브라우저에서 원본이
 * 남거나 스와이프로 오인될 수 있다. 포인터 캡처와 모든 종료 신호를 이 훅에서 통일한다.
 */
export function useHoldPreview({
  enabled,
  resetKey,
  captureTarget = "currentTarget",
  delayMs = DEFAULT_DELAY_MS,
  moveTolerancePx = DEFAULT_MOVE_TOLERANCE_PX,
  onActivated,
}: UseHoldPreviewOptions) {
  const [previewActive, setPreviewActive] = useState(false);
  const [activeKey, setActiveKey] = useState<unknown>(null);
  const consumedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const onActivatedRef = useRef(onActivated);
  /* `enabled`는 비교 원본이 decode된 뒤에야 true가 된다 — 그 전환은 사진이 DOM에 그려지는 커밋에서
   * 일어나지만, 이 값을 클로저로 읽으면 `useEffect`로 다시 붙는 리스너가 한 프레임 늦게 갱신된다.
   * 그 사이에 들어온 키/포인터는 "아직 준비 안 됨"으로 판정돼 조용히 무시되고, 한 번 누르고 마는
   * 입력(`\` 키다운)은 영영 복구되지 않는다. 최신 값을 ref로 읽어 그 창을 없앤다. */
  const enabledRef = useRef(enabled);

  useEffect(() => { onActivatedRef.current = onActivated; }, [onActivated]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const endHold = useCallback((cancelled = false) => {
    void cancelled; // 호출부 의미(정상 종료/취소)는 유지하되, 소비된 홀드는 다음 제스처 전까지 보존한다.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
    setPreviewActive(false);
    /* 활성화된 길게 누르기는 pointerleave/pointercancel 뒤에 합성 click이 와도
     * 계속 소비된 제스처여야 한다. 여기서 false로 되돌리면 원본을 놓는 순간
     * 사진 클릭으로 재해석되어 집중 보기가 닫힌다. 다음 새 제스처 시작 때만 초기화한다. */
  }, []);

  const beginHold = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    consumedRef.current = false;
    endHold(false);
    if (!enabledRef.current || !event.isPrimary || event.button !== 0) return;
    /* 확대 오버레이는 전체 판에 캡처해 release 뒤에도 열린 상태를 유지하고,
     * 작가 상세는 실제 사진에 캡처해 후속 click의 이미지 target을 보존한다. */
    const pointerTarget = captureTarget === "eventTarget" && event.target instanceof HTMLElement
      ? event.target
      : event.currentTarget;
    try { pointerTarget.setPointerCapture(event.pointerId); } catch {}
    startRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      consumedRef.current = true;
      setActiveKey(resetKey);
      setPreviewActive(true);
      onActivatedRef.current?.();
    }, delayMs);
  }, [captureTarget, delayMs, endHold, resetKey]);

  const moveHold = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > moveTolerancePx) {
      endHold(true);
    }
  }, [endHold, moveTolerancePx]);

  const showPreview = useCallback(() => {
    if (!enabledRef.current) return;
    setActiveKey(resetKey);
    setPreviewActive(true);
  }, [resetKey]);
  const hidePreview = useCallback(() => endHold(false), [endHold]);
  const cancelHold = useCallback(() => endHold(true), [endHold]);
  const isConsumed = useCallback(() => consumedRef.current, []);

  useEffect(() => {
    const release = () => endHold(false);
    const cancel = () => endHold(true);
    const releaseOnHidden = () => {
      if (document.visibilityState !== "visible") cancel();
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("touchend", release, true);
    window.addEventListener("touchcancel", cancel, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", releaseOnHidden);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("touchend", release, true);
      window.removeEventListener("touchcancel", cancel, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", releaseOnHidden);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endHold]);

  return {
    previewActive: previewActive && enabled && activeKey === resetKey,
    consumedRef,
    isConsumed,
    beginHold,
    moveHold,
    endHold,
    cancelHold,
    showPreview,
    hidePreview,
  };
}
