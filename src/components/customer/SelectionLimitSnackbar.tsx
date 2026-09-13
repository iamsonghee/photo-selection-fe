"use client";

import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

type Props = {
  count: number;
  noticeKey: number;
  placement: "gallery" | "viewer";
  onViewSelected: () => void;
  onDismiss: () => void;
};

export function SelectionLimitSnackbar({ count, noticeKey, placement, onViewSelected, onDismiss }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [noticeKey, onDismiss]);

  return (
    <aside className={`selection-limit-snackbar selection-limit-${placement}`} role="status" aria-live="polite">
      <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
      <div>
        <strong>{count}장을 모두 선택했어요</strong>
        <span>다른 사진을 선택하려면 기존 사진 1장을 해제해 주세요.</span>
      </div>
      <button type="button" className="selection-limit-action" onClick={onViewSelected}>선택한 사진 보기</button>
      <button type="button" className="selection-limit-close" onClick={onDismiss} aria-label="선택 제한 안내 닫기"><X size={15} /></button>

      <style>{`
        .selection-limit-snackbar {
          position: fixed;
          left: 50%;
          z-index: 70;
          width: min(335px, calc(100vw - 40px));
          min-height: 72px;
          box-sizing: border-box;
          transform: translateX(-50%);
          padding: 12px 36px 12px 14px;
          border-radius: 9px;
          background: rgba(25, 25, 24, .96);
          box-shadow: 0 10px 30px rgba(0, 0, 0, .24);
          color: #fff;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 4px 9px;
          font-family: Pretendard, "Pretendard Variable", sans-serif;
          animation: selection-limit-enter 180ms ease-out;
        }
        .selection-limit-gallery { bottom: calc(96px + env(safe-area-inset-bottom)); }
        .selection-limit-viewer { bottom: calc(86px + env(safe-area-inset-bottom)); }
        .selection-limit-snackbar > svg { grid-row: 1 / span 2; margin-top: 1px; color: #ff4d00; }
        .selection-limit-snackbar div { min-width: 0; display: flex; flex-direction: column; }
        .selection-limit-snackbar strong { font-size: 12px; line-height: 18px; letter-spacing: -.2px; }
        .selection-limit-snackbar span { color: rgba(255,255,255,.67); font-size: 10px; line-height: 15px; letter-spacing: -.15px; }
        .selection-limit-action { grid-column: 2; justify-self: start; margin-top: 3px; padding: 0; border: 0; background: transparent; color: #ff7840; font: 700 11px/18px Pretendard, sans-serif; text-decoration: underline; text-underline-offset: 3px; }
        .selection-limit-close { position: absolute; top: 4px; right: 3px; width: 32px; height: 36px; padding: 0; border: 0; background: transparent; color: rgba(255,255,255,.55); display: grid; place-items: center; }
        @keyframes selection-limit-enter { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @media (min-width: 768px) {
          .selection-limit-gallery, .selection-limit-viewer { bottom: 88px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .selection-limit-snackbar { animation: none; }
        }
      `}</style>
    </aside>
  );
}
