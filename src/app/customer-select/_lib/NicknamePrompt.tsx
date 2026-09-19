"use client";

/** 접속 즉시 닉네임 설정 배너 — 스킵 가능(단계 1 결정: "접속 즉시 + 스킵 허용"). */
import { useState } from "react";
import { useCustomerSelectStore } from "./real-store";

function skipKey(projectId: string) {
  return `acut:customer-select:nickname-skipped:${projectId}`;
}

export function NicknamePrompt({ projectId }: { projectId: string }) {
  const { project, currentIdentity, setNickname } = useCustomerSelectStore();
  const [value, setValue] = useState("");
  const [skipped, setSkipped] = useState(() => {
    try {
      return window.sessionStorage.getItem(skipKey(projectId)) === "1";
    } catch {
      return false;
    }
  });

  const nickname = project.participantNicknames[currentIdentity];
  if (nickname || skipped) return null;

  function skip() {
    try {
      window.sessionStorage.setItem(skipKey(projectId), "1");
    } catch {
      /* 저장소 접근 불가 — 다음에 다시 물어봐도 괜찮음 */
    }
    setSkipped(true);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#fff0ea", borderBottom: "1px solid #ffd9c2" }}>
      <span style={{ fontSize: 13, color: "#191918", fontWeight: 600, whiteSpace: "nowrap" }}>닉네임을 알려주세요</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="예: 신랑"
        maxLength={20}
        style={{ flex: 1, height: 32, border: "1px solid #dde1e4", borderRadius: 8, padding: "0 10px", fontSize: 13 }}
      />
      <button
        type="button"
        onClick={() => {
          if (value.trim()) setNickname(value.trim());
          skip();
        }}
        style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: "#ff4d00", color: "#fff", fontSize: 12.5, fontWeight: 700 }}
      >
        확인
      </button>
      <button type="button" onClick={skip} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: "#8b8985", fontSize: 12.5 }}>
        건너뛰기
      </button>
    </div>
  );
}
