"use client";

import { useCallback, useEffect, useState } from "react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import styles from "../customer-entry.module.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export default function PinForm({ token, from }: { token: string; from: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async (pinValue: string) => {
    if (pinValue.length !== 4 || submitting || locked) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/c/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin: pinValue }),
      });
      const data = await res.json();

      if (data.success) {
        // 같은 [token] 레이아웃의 SelectionProvider를 새 쿠키로 다시 마운트해야 한다.
        window.location.href = from;
      } else if (data.locked) {
        setLocked(true);
        setRetryAfter(data.retryAfterSeconds ?? 60);
        setPin("");
      } else {
        setError("비밀번호가 올바르지 않습니다");
        setPin("");
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }, [from, locked, submitting, token]);

  const appendDigit = useCallback((digit: string) => {
    if (locked || submitting) return;
    setError(null);
    setPin((current) => current.length < 4 ? `${current}${digit}` : current);
  }, [locked, submitting]);

  const removeDigit = useCallback(() => {
    if (locked || submitting) return;
    setError(null);
    setPin((current) => current.slice(0, -1));
  }, [locked, submitting]);

  const resetPin = useCallback(() => {
    if (locked || submitting) return;
    setPin("");
    setError(null);
  }, [locked, submitting]);

  useEffect(() => {
    if (pin.length === 4 && !submitting && !locked) {
      void handleSubmit(pin);
    }
  }, [handleSubmit, locked, pin, submitting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) appendDigit(event.key);
      else if (event.key === "Backspace") removeDigit();
      else if (event.key === "Escape") resetPin();
      else if (event.key === "Enter") void handleSubmit(pin);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendDigit, handleSubmit, pin, removeDigit, resetPin]);

  useEffect(() => {
    if (!locked || retryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfter((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setLocked(false);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [locked, retryAfter]);

  const feedback = submitting ? "비밀번호를 확인하고 있어요." : locked
    ? `5회 이상 틀렸습니다. ${retryAfter}초 후 다시 시도해 주세요.`
    : error;

  return (
    <CustomerEntryShell layout="auth" className={styles.pinCanvas}>
      <CustomerEntryHeader href={token ? `/c/${token}` : undefined} />
      <div className={styles.pinContent}>
        <div className={styles.entryCopy}>
          <h1 className={styles.entryTitle}>비밀번호를 입력해 주세요</h1>
          <p className={styles.entryDescription}>작가에게 받은 숫자 4자리를 입력해 주세요.</p>
        </div>

        <div
          className={styles.pinStatusArea}
          role="status"
          aria-label={`비밀번호 ${pin.length}자리 입력됨`}
          aria-live="polite"
        >
          <div className={styles.pinSlots} aria-hidden="true">
            {[0, 1, 2, 3].map((index) => {
              const filled = index < pin.length;
              return (
                <div
                  key={index}
                  className={`${styles.pinSlot} ${filled && !error ? styles.pinSlotFilled : ""} ${error ? styles.pinSlotError : ""}`}
                >
                  <img
                    className={styles.pinDot}
                    src={filled && !error ? "/customer/entry/pin-filled.svg" : "/customer/entry/pin-empty.svg"}
                    alt=""
                    width={16}
                    height={16}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <p className={styles.pinFeedback} aria-live="assertive">{feedback ?? ""}</p>

        <div className={styles.pinBottom}>
          <div className={styles.keypad} aria-label="숫자 키패드">
            {KEYS.map((digit) => (
              <button key={digit} className={styles.key} type="button" onClick={() => appendDigit(digit)} disabled={locked || submitting}>
                {digit}
              </button>
            ))}
            <button className={styles.key} type="button" onClick={resetPin} disabled={locked || submitting} aria-label="비밀번호 전체 지우기">
              <img className={styles.keyResetIcon} src="/customer/entry/keypad-reset.svg" alt="" width={24} height={24} />
            </button>
            <button className={styles.key} type="button" onClick={() => appendDigit("0")} disabled={locked || submitting}>0</button>
            <button className={styles.key} type="button" onClick={removeDigit} disabled={locked || submitting} aria-label="마지막 숫자 지우기">
              <span className={styles.keyBackspaceIconBox}>
                <img className={styles.keyBackspaceIcon} src="/customer/entry/keypad-backspace.svg" alt="" width={17} height={15} />
              </span>
            </button>
          </div>
          {/* 네 자리 입력 시 자동 확인한다. 중복 제출 버튼 대신 도움말을 제공한다. */}
          <p className={styles.pinHelp}>4자리를 입력하면 자동으로 확인합니다.<br />비밀번호를 모르시면 초대 링크를 보낸 작가에게 확인해 주세요.</p>
        </div>
      </div>
    </CustomerEntryShell>
  );
}
