import type { Metadata } from "next";
import type { ReactNode } from "react";
import theme from "@/styles/AcutLightTheme.module.css";

/** 하객 업로드 링크(QR) 구간 — 로그인 없이 모바일 웹으로 연다. */
export const metadata: Metadata = {
  title: "사진 보내기 | A-CUT",
  description: "찍은 사진과 영상을 신랑신부에게 보내 주세요.",
  robots: { index: false, follow: false },
};

export default function GuestUploadLayout({ children }: { children: ReactNode }) {
  return (
    <div data-acut-light-canvas className={`${theme.lightTheme} min-h-dvh bg-background text-foreground`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>
    </div>
  );
}
