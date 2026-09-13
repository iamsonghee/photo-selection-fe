"use client";

import { useEffect, type ReactNode } from "react";

/**
 * 고객이 작가에게 무언가를 "전달"하기 직전에 뜨는 확인 모달.
 *
 * 셀렉 확정과 보정본 검토 제출이 같은 성격의 마지막 관문이라 같은 컴포넌트를 쓴다 —
 * 문구만 바꿔 끼운다(기본값은 셀렉 확정). 예전에는 검토 쪽이 다크 워크스페이스 톤의 별도
 * 모달이라, 라이트 화면에서 전달을 누르면 갑자기 검은 창이 떴다.
 */
type Props = {
  /** 기본 문구(셀렉 확정)에서 쓰는 선택 장수 */
  count?: number;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** 진행 중 버튼 문구 */
  busyLabel?: string;
  confirming: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SelectionConfirmDialog({
  count = 0,
  title,
  description,
  confirmLabel,
  busyLabel,
  confirming,
  error,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirming, onCancel]);

  return (
    <div
      className="selection-confirm-backdrop"
      role="presentation"
      onClick={() => { if (!confirming) onCancel(); }}
    >
      <section
        className="selection-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="selection-confirm-title"
        aria-describedby="selection-confirm-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="selection-confirm-copy">
          <h2 id="selection-confirm-title">{title ?? "사진 셀렉을 확정할까요?"}</h2>
          <p id="selection-confirm-description">
            {description ?? (
              <>
                선택한 사진 {count}장을 작가에게 전달합니다.
                <br />
                보정 시작 후에는 선택을 변경할 수 없어요.
              </>
            )}
          </p>
        </div>

        {error && <p className="selection-confirm-error" role="alert">{error}</p>}

        <div className="selection-confirm-actions">
          <button type="button" className="selection-confirm-cancel" onClick={onCancel} disabled={confirming}>
            취소
          </button>
          <button type="button" className="selection-confirm-submit" onClick={onConfirm} disabled={confirming}>
            {confirming ? (busyLabel ?? "확정 중...") : (confirmLabel ?? "확정하기")}
          </button>
        </div>
      </section>

      <style>{`
        .selection-confirm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.5);
        }
        .selection-confirm-dialog {
          width: min(295px, calc(100vw - 40px));
          box-sizing: border-box;
          padding: 24px;
          overflow: hidden;
          border-radius: 12px;
          background: #fff;
          color: #191918;
          box-shadow: 0 3px 15px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.62);
          font-family: Pretendard, "Pretendard Variable", -apple-system, sans-serif;
        }
        .selection-confirm-copy { display: flex; flex-direction: column; gap: 6px; text-align: center; }
        .selection-confirm-dialog h2 { margin: 0; font-size: 20px; line-height: 35px; font-weight: 600; letter-spacing: -1.05px; }
        .selection-confirm-dialog p { margin: 0; }
        .selection-confirm-copy p { color: #5f5e5b; font-size: 12px; line-height: 18px; font-weight: 400; }
        .selection-confirm-error {
          margin-top: 12px;
          color: #d92d20;
          font-size: 11px;
          line-height: 16px;
          text-align: center;
        }
        .selection-confirm-actions { display: flex; gap: 8px; margin-top: 20px; }
        .selection-confirm-dialog button {
          min-width: 0;
          flex: 1;
          height: 44px;
          border-radius: 4px;
          font: 400 14px/18px Pretendard, "Pretendard Variable", sans-serif;
          letter-spacing: -0.28px;
          cursor: pointer;
          transition: transform 100ms ease, opacity 120ms ease, background-color 120ms ease;
        }
        .selection-confirm-dialog button:active:not(:disabled) { transform: scale(0.98); }
        .selection-confirm-dialog button:focus-visible { outline: 2px solid #191918; outline-offset: 2px; }
        .selection-confirm-dialog button:disabled { cursor: wait; opacity: 0.58; }
        .selection-confirm-cancel { border: 1px solid #d9d9d9; background: #fff; color: #191918; }
        .selection-confirm-submit { border: 1px solid #ff4d00; background: #ff4d00; color: #fff; font-weight: 700; }
        @media (min-width: 768px) {
          .selection-confirm-dialog { width: min(360px, calc(100vw - 48px)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .selection-confirm-dialog button { transition: none; }
        }
      `}</style>
    </div>
  );
}
