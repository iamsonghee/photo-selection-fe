"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { useHoldPreview } from "@/hooks/useHoldPreview";

/**
 * 사진만 남기는 전체화면 집중 보기.
 *
 * 고객이 보는 모든 뷰어(셀렉 상세·보정본 검토·잠금 뷰어)가 이 하나를 쓴다 —
 * 화면마다 자기 챙을 숨기는 방식으로 만들면 챙 구조가 다른 만큼 동작도 갈린다.
 * 사진 위에 검은 판을 덮는 방식이라 어떤 화면에 붙여도 결과가 같다.
 *
 * 화면에는 사진 외의 이동 버튼을 렌더링하지 않는다. 키보드·스와이프 이동만 유지해
 * 사진 감상을 방해하지 않으면서 연속 탐색은 가능하게 한다. 확대 중에는 스와이프를 넘기지 않는다.
 */
export function PhotoFocusOverlay({
  open,
  src,
  originalSrc,
  alt,
  onClose,
  onPrev,
  onNext,
}: {
  open: boolean;
  src: string;
  /** 보정본을 확대한 경우, 누르는 동안 겹쳐 보여줄 원본 */
  originalSrc?: string;
  alt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const zoomedRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const [readyOriginalSrc, setReadyOriginalSrc] = useState<string | null>(null);
  const canCompareOriginal = Boolean(originalSrc && originalSrc !== src && readyOriginalSrc === originalSrc);
  const {
    previewActive: holdingOriginal,
    consumedRef: consumedHoldRef,
    isConsumed,
    beginHold,
    moveHold,
    endHold,
    cancelHold,
    showPreview,
    hidePreview,
  } = useHoldPreview({ enabled: canCompareOriginal, resetKey: `${src}:${originalSrc ?? ""}` });
  const previewVisible = holdingOriginal && canCompareOriginal;

  useEffect(() => {
    if (!open || !originalSrc || originalSrc === src) return;
    let cancelled = false;
    const image = new Image();
    image.src = originalSrc;
    image.decode()
      .then(() => { if (!cancelled) setReadyOriginalSrc(originalSrc); })
      .catch(() => {});
    return () => { cancelled = true; cancelHold(); };
  }, [open, originalSrc, src, cancelHold]);

  const closeUnlessHolding = useCallback(() => {
    if (!isConsumed()) onClose();
  }, [isConsumed, onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (hasShortcutModifier(event)) return; // 윈도우 Alt+←/→(뒤로/앞으로 가기)와 겹치지 않게
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && onPrev) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onPrev();
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onNext();
        return;
      }
      if (event.code === "Backslash" && canCompareOriginal) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPreview();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Backslash") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hidePreview();
    };
    /* 아래 화면의 단축키(Y/R/별점 등)가 겹쳐 동작하지 않도록 capture 단계에서 먼저 받는다 */
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      hidePreview();
    };
  }, [canCompareOriginal, hidePreview, open, onClose, onPrev, onNext, showPreview]);

  if (!open) return null;

  return (
    <div
      className="pfo-root"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 크게 보기`}
      /* 데스크톱 마우스 클릭으로 닫기 — 터치는 아래 onSingleTap이 받는다 */
      onClick={closeUnlessHolding}
      onPointerDown={(event) => {
        if (zoomedRef.current) return;
        beginHold(event);
      }}
      onPointerUp={() => endHold(false)}
      onPointerCancel={cancelHold}
      onPointerMove={moveHold}
      onContextMenu={(event) => {
        if (canCompareOriginal) event.preventDefault();
      }}
      onDragStart={(event) => event.preventDefault()}
      onTouchStart={(event) => {
        if (event.touches.length !== 1) return;
        touchStartXRef.current = event.touches[0].clientX;
        touchStartYRef.current = event.touches[0].clientY;
      }}
      onTouchEnd={(event) => {
        if (zoomedRef.current || consumedHoldRef.current) return;
        const dx = touchStartXRef.current - event.changedTouches[0].clientX;
        const dy = touchStartYRef.current - event.changedTouches[0].clientY;
        /* 수평이 뚜렷할 때만 이동으로 확정한다(대각선·수직은 무시) */
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx > 0) onNext?.();
          else onPrev?.();
        }
      }}
    >
      <MobileViewerPinchPhoto
        key={src}
        src={src}
        alt={alt}
        showBadge={false}
        previewSrc={canCompareOriginal ? originalSrc : undefined}
        previewVisible={previewVisible}
        suppressTap={() => consumedHoldRef.current}
        onZoomStateChange={(zoomed) => { zoomedRef.current = zoomed; }}
        onSingleTap={closeUnlessHolding}
      />

      <style>{`
        /* 페이드인은 마운트와 동시에 시작하는 애니메이션으로 — 상태 토글이 필요 없다 */
        .pfo-root {
          position: fixed; inset: 0; z-index: 200;
          background: #000;
          cursor: zoom-out;
          animation: pfo-fade-in 180ms ease both;
        }
        @keyframes pfo-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .pfo-root { animation: none; }
        }
      `}</style>
    </div>
  );
}
