"use client";

/**
 * 작가 화면 공용 토스트. 화면마다 따로 그리던 알림(모서리·그림자·위치·z-index가 제각각)을 하나로 모은다.
 * 모바일은 위쪽에 띄워 하단 작업 막대·떠 있는 추천 버튼과 겹치지 않게 하고, 팝업이 열려 있어도 그 위에 보인다.
 */
export function PhotographerToast({ message, tone = "neutral" }: { message: string | null | undefined; tone?: "neutral" | "error" }) {
  if (!message) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      data-photographer-toast
      className={`pointer-events-none fixed left-1/2 top-[calc(64px+env(safe-area-inset-top,0px))] z-[100010] w-max max-w-[calc(100vw-32px)] -translate-x-1/2 break-keep rounded-xl border bg-surface px-4 py-2.5 text-center text-[14px] font-medium leading-5 tracking-[-0.35px] shadow-[0_12px_32px_rgba(2,56,82,0.18)] md:bottom-6 md:top-auto ${
        tone === "error" ? "border-danger/30 text-danger" : "border-border-subtle text-foreground"
      }`}
    >
      {message}
    </div>
  );
}
