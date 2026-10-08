import type { ReactNode } from "react";
import lightThemeStyles from "@/styles/PhotographerLightTheme.module.css";
import { BRAND_MARK_SVG } from "@/lib/brand-assets";

/**
 * 없는 페이지·오류처럼 어느 화면에서든 뜰 수 있는 상태 화면.
 * 작가·고객이 함께 보므로 문구는 명령형(~해 주세요)으로 두고(agent-guidelines 문구 규칙), 밝은 작업실 테마를 쓴다.
 */
export function StatusPage({ code, title, description, actions }: {
  code?: string;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <main className={`${lightThemeStyles.lightTheme} flex min-h-dvh items-center bg-background px-5 py-12`}>
      <div className="mx-auto w-full max-w-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_MARK_SVG} alt="A-CUT" width={36} height={36} className="mb-8 h-9 w-9" />
        {code ? <p className="mb-2 font-mono text-xs font-semibold text-subtle-foreground">{code}</p> : null}
        <h1 className="break-keep text-[24px] font-bold leading-8 tracking-[-0.6px] text-foreground">{title}</h1>
        <p className="mt-2 break-keep text-[14px] leading-[25px] tracking-[-0.45px] text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-wrap gap-2">{actions}</div>
      </div>
    </main>
  );
}
