"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, Copy, KeyRound, Link2, Pencil, RefreshCw } from "lucide-react";
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
  /** 지정하면 PIN 영역 오른쪽 끝에 연필 아이콘이 붙고, 눌렀을 때 이 모달 안에서 바로
   * 입력 칸으로 바뀐다 — 이미 뜬 공유 모달 위에 PIN 변경 모달을 또 띄우지 않기 위함.
   * 실패 시 던진 에러의 message를 그대로 보여준다. */
  onSavePin?: (pin: string | null) => Promise<void>;
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
  onSavePin,
}: CustomerInviteShareModalProps) {
  const [shareCopied, setShareCopied] = useState<"link" | "pin" | "bundle" | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaveError, setPinSaveError] = useState("");
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 모달이 닫히면(고객에게 재활성화하는 등 다음 진입에) PIN 편집 중이던 상태가 남지 않게 한다.
  useEffect(() => {
    if (!open) {
      setEditingPin(false);
      setPinSaveError("");
    }
  }, [open]);

  useEffect(() => {
    // 자동 닫힘 도중 PIN을 수정하는 중이면 잠깐 멈춘다 — 안 그러면 입력하는 동안 모달이 사라진다.
    if (!open || closeDisabled || editingPin || autoCloseMs === null || autoCloseMs <= 0) {
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
  }, [autoCloseMs, closeDisabled, editingPin, open]);

  function startEditPin() {
    setPinDraft(accessPin ?? "");
    setPinSaveError("");
    setEditingPin(true);
  }

  function cancelEditPin() {
    setEditingPin(false);
    setPinSaveError("");
  }

  async function saveEditPin() {
    if (!onSavePin) return;
    const normalized = pinDraft.trim();
    if (normalized && normalized.length !== 4) {
      setPinSaveError("4자리 숫자로 입력해 주세요");
      return;
    }
    setPinSaving(true);
    setPinSaveError("");
    try {
      await onSavePin(normalized || null);
      setEditingPin(false);
    } catch (e) {
      setPinSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setPinSaving(false);
    }
  }

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
      closeDisabled={closeDisabled || pinSaving}
      title={title}
      description={desc}
      maxWidth={480}
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <PhotographerLightButton
            type="button"
            variant="secondary"
            disabled={closeDisabled || pinSaving}
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

          {accessPin || onSavePin ? (
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                <KeyRound size={14} aria-hidden />접속 PIN
              </div>
              {editingPin ? (
                // 이미 뜬 공유 모달 위에 PIN 변경 모달을 또 띄우면 겹쳐서 불편하다 —
                // 같은 자리에서 입력 칸으로 바꿔 그 자리에서 바로 고치게 한다.
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEditPin(); if (e.key === "Escape") cancelEditPin(); }}
                      disabled={pinSaving}
                      aria-invalid={Boolean(pinSaveError)}
                      aria-label="새 접속 PIN"
                      placeholder="0000"
                      className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-center font-mono text-[15px] font-semibold tracking-[0.18em] text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setPinDraft(Math.floor(1000 + Math.random() * 9000).toString())}
                      disabled={pinSaving}
                      title="랜덤으로 채우기"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface disabled:opacity-50"
                    >
                      <RefreshCw size={13} />랜덤
                    </button>
                  </div>
                  {pinSaveError ? <p role="alert" className="text-[12px] text-danger">{pinSaveError}</p> : null}
                  <div className="flex items-center gap-2">
                    <PhotographerLightButton type="button" variant="secondary" onClick={cancelEditPin} disabled={pinSaving} className="h-9 flex-1 text-[12px]">
                      취소
                    </PhotographerLightButton>
                    <PhotographerLightButton
                      type="button"
                      variant="primary"
                      onClick={() => void saveEditPin()}
                      disabled={pinSaving || (!!pinDraft && pinDraft.length !== 4)}
                      className="h-9 flex-1 text-[12px]"
                    >
                      {pinSaving ? "저장 중…" : "저장"}
                    </PhotographerLightButton>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface py-1 pl-3 pr-1">
                  <span className={`min-w-0 flex-1 truncate text-[15px] text-foreground ${accessPin ? "font-mono font-semibold tracking-[0.18em]" : "font-medium"}`}>
                    {accessPin || "PIN 없이 접속"}
                  </span>
                  {accessPin ? (
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
                  ) : null}
                  {onSavePin ? (
                    <button
                      type="button"
                      onClick={startEditPin}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      title={accessPin ? "PIN 수정" : "PIN 설정"}
                      aria-label={accessPin ? "PIN 수정" : "PIN 설정"}
                    >
                      <Pencil size={13} />
                      {accessPin ? null : <span className="pr-0.5">설정</span>}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

      </div>
    </PhotographerModal>
  );
}
