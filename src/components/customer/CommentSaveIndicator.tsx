"use client";

import type { CommentSaveStatus } from "@/lib/comment-save-status";

/**
 * 코멘트 자동저장 상태 안내 — 셀렉 화면에만 있고 검토 화면엔 없어서 재보정 요청 사유가
 * 저장됐는지 알 수 없었다. 두 화면이 같은 문구·색을 쓰도록 여기로 뽑았다.
 * 유휴 상태에서는 아무것도 그리지 않는다 — "자동 저장"은 저장이 일어날 때만 의미가 있다.
 */
export function CommentSaveIndicator({ status, onRetry }: { status: CommentSaveStatus; onRetry: () => void }) {
  if (status === "saving") {
    return <span role="status" aria-live="polite" style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>저장 중…</span>;
  }
  if (status === "saved") {
    return <span role="status" aria-live="polite" style={{ color: "#4ade80", fontSize: 11 }}>✓ 저장됨</span>;
  }
  if (status === "error") {
    return (
      <span role="alert" style={{ color: "#f87171", fontSize: 11 }}>
        저장 실패 ·{" "}
        <button
          type="button"
          onClick={onRetry}
          style={{ padding: 0, border: 0, background: "none", color: "inherit", fontSize: "inherit", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}
        >
          다시 시도
        </button>
      </span>
    );
  }
  return null;
}
