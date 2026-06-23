"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";

/* ── design tokens (review 페이지와 동일 가이드) ── */
const BG_BASE    = "var(--background)";
const BG_PANEL   = "var(--surface)";
const BG_INPUT   = "var(--surface-raised)";
const BORDER     = "var(--border-subtle)";
const BORDER_HI  = "var(--border)";
const TEXT       = "var(--foreground)";
const MUTED      = "var(--muted-foreground)";
const ACCENT     = "var(--accent)";
const ACCENT_DIM = "rgba(var(--accent-rgb), 0.1)";
const ORANGE     = "var(--warning)";
const RED        = "var(--danger)";
const MONO       = "'JetBrains Mono', 'Space Mono', monospace";
const DISPLAY    = "'Space Grotesk', 'Pretendard Variable', sans-serif";
const BODY_FONT  = "'Pretendard Variable', -apple-system, sans-serif";

export default function PinForm({ token, from }: { token: string; from: string }) {
  const router = useRouter();

  const [pins, setPins] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const r3 = useRef<HTMLInputElement>(null);
  const inputRefs = [r0, r1, r2, r3];

  useEffect(() => {
    inputRefs[0].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (pinValue: string) => {
    if (submitting || locked) return;
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
        router.replace(from);
      } else if (data.locked) {
        setLocked(true);
        setPins(["", "", "", ""]);
        setTimeout(() => inputRefs[0].current?.focus(), 50);
      } else {
        setError("비밀번호가 올바르지 않습니다");
        setPins(["", "", "", ""]);
        setTimeout(() => inputRefs[0].current?.focus(), 50);
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.");
      setPins(["", "", "", ""]);
      setTimeout(() => inputRefs[0].current?.focus(), 50);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (pins.every((p) => p !== "") && !submitting && !locked) {
      void handleSubmit(pins.join(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  const handleInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newPins = [...pins];
    newPins[index] = digit;
    setPins(newPins);
    setError(null);
    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (pins[index] === "" && index > 0) {
        const newPins = [...pins];
        newPins[index - 1] = "";
        setPins(newPins);
        inputRefs[index - 1].current?.focus();
      } else {
        const newPins = [...pins];
        newPins[index] = "";
        setPins(newPins);
      }
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BG_BASE,
        backgroundImage: `linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: BODY_FONT,
        color: TEXT,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: BG_PANEL,
          border: `1px solid ${BORDER}`,
          padding: 32,
          textAlign: "center",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BrandLogoBar size="lg" priority href={token ? `/c/${token}` : undefined} />
        </div>

        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: ACCENT_DIM,
            border: `1px solid rgba(var(--accent-rgb), 0.35)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <Lock size={22} color={ACCENT} />
        </div>

        <h1
          style={{
            fontFamily: DISPLAY,
            fontSize: 20,
            fontWeight: 700,
            color: TEXT,
            marginBottom: 8,
            letterSpacing: "-0.3px",
          }}
        >
          본인 확인이 필요해요
        </h1>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 28 }}>
          작가에게 전달받은 4자리 비밀번호를 입력해주세요
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
          {pins.map((pin, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin}
              disabled={locked || submitting}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{
                width: 56,
                height: 64,
                background: BG_INPUT,
                border: `1px solid ${error ? RED : pin ? BORDER_HI : BORDER}`,
                color: TEXT,
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 700,
                textAlign: "center",
                outline: "none",
                cursor: locked ? "not-allowed" : "text",
                opacity: locked ? 0.5 : 1,
                transition: "border-color 0.15s",
              }}
            />
          ))}
        </div>

        {locked && (
          <p style={{ fontSize: 12, color: ORANGE, marginBottom: 8, fontFamily: MONO, letterSpacing: "0.05em" }}>
            5회 이상 틀렸습니다. 잠시 후 다시 시도해주세요
          </p>
        )}
        {!locked && error && (
          <p style={{ fontSize: 12, color: RED, marginBottom: 8, fontFamily: MONO, letterSpacing: "0.05em" }}>
            {error}
          </p>
        )}

        {submitting && (
          <p style={{ fontSize: 12, color: MUTED, fontFamily: MONO, letterSpacing: "0.05em" }}>
            확인 중...
          </p>
        )}
      </div>
    </div>
  );
}
