"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export type CustomerInviteShareModalProps = {
  open: boolean;
  onClose: () => void;
  inviteUrl: string;
  accessPin?: string | null;
  title?: string;
  description?: string;
  /** 배경 클릭·닫기 버튼 비활성 (처리 중) */
  closeDisabled?: boolean;
};

export function CustomerInviteShareModal({
  open,
  onClose,
  inviteUrl,
  accessPin,
  title = "링크를 직접 공유해 주세요",
  description,
  closeDisabled = false,
}: CustomerInviteShareModalProps) {
  const [shareCopied, setShareCopied] = useState<"link" | "pin" | "bundle" | null>(null);

  useEffect(() => {
    if (!open) setShareCopied(null);
  }, [open]);

  function flashShareCopied(kind: "link" | "pin" | "bundle") {
    setShareCopied(kind);
    const t = window.setTimeout(
      () => setShareCopied((cur) => (cur === kind ? null : cur)),
      2000,
    );
    return () => window.clearTimeout(t);
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={() => {
        if (closeDisabled) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-surface-raised border border-border-subtle rounded-2xl p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
          <p className="text-sm text-subtle-foreground leading-relaxed">{desc}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">초대 링크</label>
            <div className="flex items-center gap-2 rounded-xl bg-surface border border-border-subtle pl-3 pr-1 py-1">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground truncate focus:outline-none"
              />
              <button
                type="button"
                onClick={copyShareLink}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-strong text-xs font-medium px-2.5 py-1.5 transition-colors"
                title="링크 복사"
              >
                {shareCopied === "link" ? (
                  <>
                    <Check size={12} />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    복사
                  </>
                )}
              </button>
            </div>
          </div>

          {accessPin ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">비밀번호</label>
              <div className="flex items-center gap-2 rounded-xl bg-surface border border-border-subtle pl-3 pr-1 py-1">
                <span className="flex-1 min-w-0 text-sm text-foreground tracking-wider font-mono truncate">
                  {accessPin}
                </span>
                <button
                  type="button"
                  onClick={copySharePin}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-strong text-xs font-medium px-2.5 py-1.5 transition-colors"
                  title="비밀번호 복사"
                >
                  {shareCopied === "pin" ? (
                    <>
                      <Check size={12} />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      복사
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={closeDisabled}
            className="flex-1 rounded-xl border border-border-subtle text-subtle-foreground text-sm font-medium py-2.5 hover:border-border hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={copyShareBundle}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-black text-sm font-bold py-2.5 hover:bg-[#ff5e1a] transition-colors"
          >
            {shareCopied === "bundle" || (shareCopied === "link" && !accessPin) ? (
              <>
                <Check size={14} />
                복사됨
              </>
            ) : (
              <>
                <Copy size={14} />
                {accessPin ? "링크와 비밀번호 복사" : "링크 복사"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
