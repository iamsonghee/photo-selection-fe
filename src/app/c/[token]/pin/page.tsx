"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

export default function PinPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const from = searchParams.get("from") ?? `/c/${token}`;

  const [pins, setPins] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs[0].current?.focus();
  }, []);

  // Auto-submit when all 4 digits filled
  useEffect(() => {
    if (pins.every((p) => p !== "") && !submitting && !locked) {
      handleSubmit(pins.join(""));
    }
  }, [pins]);

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
    <div style={{
      minHeight: "100vh",
      background: "transparent",
      backgroundImage: `
        linear-gradient(rgba(79,126,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(79,126,255,0.04) 1px, transparent 1px)
      `,
      backgroundSize: "40px 40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: PS_FONT,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 360,
        background: C.surface,
        border: `1px solid ${C.borderMd}`,
        borderRadius: 16,
        padding: 32,
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "rgba(79,126,255,0.1)",
          border: `1px solid ${C.borderMd}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <Lock size={22} color={C.steel} />
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: PS_DISPLAY,
          fontSize: 20, fontWeight: 700, color: C.text,
          marginBottom: 8,
        }}>
          본인 확인이 필요해요
        </h1>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
          작가에게 전달받은 4자리 비밀번호를 입력해주세요
        </p>

        {/* PIN inputs */}
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
                width: 56, height: 64,
                background: C.surface2,
                border: `1px solid ${error ? C.red : pin ? C.steel : C.border}`,
                borderRadius: 10,
                color: C.text,
                fontSize: 24, fontWeight: 700,
                textAlign: "center",
                outline: "none",
                cursor: locked ? "not-allowed" : "text",
                opacity: locked ? 0.5 : 1,
                transition: "border-color 0.15s",
              }}
            />
          ))}
        </div>

        {/* Error / locked message */}
        {locked && (
          <p style={{ fontSize: 13, color: C.orange, marginBottom: 8 }}>
            5회 이상 틀렸습니다. 잠시 후 다시 시도해주세요
          </p>
        )}
        {!locked && error && (
          <p style={{ fontSize: 13, color: C.red, marginBottom: 8 }}>
            {error}
          </p>
        )}

        {submitting && (
          <p style={{ fontSize: 12, color: C.muted }}>확인 중...</p>
        )}
      </div>
    </div>
  );
}
