"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** 업로드 중 한 줄 안내 — 평소엔 화면 유지, 오프라인이면 연결되면 이어서 올린다는 안내(lib/upload-resume.ts). */
export function UploadConnectionHint({ className = "" }: { className?: string }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <span role="status" aria-live="polite" className={`block text-[11px] leading-4 ${online ? "text-muted-foreground" : "font-semibold text-warning"} ${className}`}>
      {online ? "끝날 때까지 이 화면을 켜 두세요" : "인터넷 연결이 끊겼어요 · 다시 연결되면 이어서 올려요"}
    </span>
  );
}
