"use client";

/**
 * 실제 서비스에서는 참가자마다 자기 기기로 접속하므로(공유 링크, 단계 1 §5-2 참고) "지금 보는
 * 사람"을 바꾸는 UI 자체가 없다. 여기서는 API 연동 전 한 브라우저로 여러 참가자 입장을
 * 재현해 보기 위한 목업 전용 스위처다 — 실제 화면에는 존재하지 않는 요소임을 라벨로 밝힌다.
 */
import { PARTICIPANTS, useCustomerSelectStore } from "./mock-store";
import type { ColorTag } from "@/types";

export function DevIdentitySwitcher() {
  const { currentIdentity, setCurrentIdentity } = useCustomerSelectStore();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 24px",
        background: "#191918",
        color: "#fff",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      <span style={{ opacity: 0.6 }}>🧪 지금 보는 사람(목업 전용):</span>
      {PARTICIPANTS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setCurrentIdentity(p.id as ColorTag)}
          style={{
            border: "1px solid rgba(255,255,255,.25)",
            background: currentIdentity === p.id ? p.hex : "transparent",
            color: currentIdentity === p.id ? "#fff" : "rgba(255,255,255,.7)",
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: 11,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
