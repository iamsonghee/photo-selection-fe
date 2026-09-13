"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, Copy, KeyRound, Link2 } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";

export type CustomerInviteShareModalProps = {
  open: boolean;
  onClose: () => void;
  inviteUrl: string;
  accessPin?: string | null;
  title?: string;
  description?: string;
  /** 배경 클릭·닫기 버튼 비활성 (처리 중) */
  closeDisabled?: boolean;
  /** 모달 자동 닫힘 시간. null이면 자동으로 닫지 않음 */
  autoCloseMs?: number | null;
};

export function CustomerInviteShareModal({
  open,
  onClose,
  inviteUrl,
  accessPin,
  title = "링크를 직접 공유해 주세요",
  description,
  closeDisabled = false,
  autoCloseMs = 5000,
}: CustomerInviteShareModalProps) {
  const [shareCopied, setShareCopied] = useState<"link" | "pin" | "bundle" | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || closeDisabled || autoCloseMs === null || autoCloseMs <= 0) {
      const resetId = window.setTimeout(() => {
        setRemainingSeconds(null);
        if (!open) setShareCopied(null);
      }, 0);
      return () => window.clearTimeout(resetId);
    }

    const closesAt = Date.now() + autoCloseMs;
    const updateRemaining = () => {
      setRemainingSeconds(Math.max(1, Math.ceil((closesAt - Date.now()) / 1000)));
    };
    const initialUpdateId = window.setTimeout(updateRemaining, 0);
    const intervalId = window.setInterval(updateRemaining, 1000);

    const timeoutId = window.setTimeout(() => {
      setRemainingSeconds(null);
      setShareCopied(null);
      onCloseRef.current();
    }, autoCloseMs);

    return () => {
      window.clearTimeout(initialUpdateId);
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [autoCloseMs, closeDisabled, open]);

  function flashShareCopied(kind: "link" | "pin" | "bundle") {
    setShareCopied(kind);
    const t = window.setTimeout(
      () => setShareCopied((cur) => (cur === kind ? null : cur)),
      2000,
    );
    return () => window.clearTimeout(t);
  }

  function closeModal() {
    setRemainingSeconds(null);
    setShareCopied(null);
    onCloseRef.current();
  }

  function copyShareLink() {
    void navigator.clipboard.writeText(inviteUrl).then(() => flashShareCopied("link"));
  }

  function copyShareBundle() {
    const pin = accessPin;
    const text = pin ? `링크: ${inviteUrl}\n비밀번호: ${pin}` : inviteUrl;
    void navigator.clipboard.writeText(text).then(() => flashShareCopied(pin ? "bundle" : "link"));
  }

  function copySharePin() {
    if (!accessPin) return;
    void navigator.clipboard.writeText(accessPin).then(() => flashShareCopied("pin"));
  }

  if (!open) return null;

  const desc =
    description ??
    `카카오톡, 이메일 등으로 아래 링크${accessPin ? "와 비밀번호" : ""}를 직접 보내주세요.`;

  return (
    <PhotographerModal
      open={open}
      onClose={closeModal}
      closeDisabled={closeDisabled}
      title={title}
      description={desc}
      maxWidth={480}
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <PhotographerLightButton
            type="button"
            variant="secondary"
            disabled={closeDisabled}
            onClick={closeModal}
          >
            닫기
          </PhotographerLightButton>
          <PhotographerLightButton type="button" variant="primary" onClick={copyShareBundle}>
            {shareCopied === "bundle" || (shareCopied === "link" && !accessPin) ? (
              <><Check size={15} />복사됨</>
            ) : (
              <><Copy size={15} />{accessPin ? "전체 정보 복사" : "링크 복사"}</>
            )}
          </PhotographerLightButton>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        {remainingSeconds !== null ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2 text-[12px] font-medium text-muted-foreground" aria-live="polite">
            <Clock3 size={14} className="shrink-0" aria-hidden />
            복사 후에도 확인할 수 있도록 {remainingSeconds}초 동안 열어둘게요.
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border-subtle bg-surface-raised p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
              <Link2 size={14} aria-hidden />고객 초대 링크
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface py-1 pl-3 pr-1">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="고객 초대 링크"
                className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-foreground outline-none"
              />
              <button
                type="button"
                onClick={copyShareLink}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                title="링크 복사"
              >
                {shareCopied === "link" ? (
                  <>
                    <Check size={13} />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    복사
                  </>
                )}
              </button>
            </div>
          </div>

          {accessPin ? (
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                <KeyRound size={14} aria-hidden />접속 PIN
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold tracking-[0.18em] text-foreground">
                  {accessPin}
                </span>
                <button
                  type="button"
                  onClick={copySharePin}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                  title="비밀번호 복사"
                >
                  {shareCopied === "pin" ? (
                    <>
                      <Check size={13} />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      복사
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>

      </div>
    </PhotographerModal>
  );
}
