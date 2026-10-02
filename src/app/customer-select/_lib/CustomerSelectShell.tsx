import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import theme from "@/styles/AcutLightTheme.module.css";
import { CustomerAccountMenu, type CustomerAccountSummary } from "./CustomerAccountMenu";

export function CustomerSelectShell({ children, navigation = false, viewportLocked = false, compactHeader = false, compactTitle, headerMeta, headerActions, account }: { children: ReactNode; navigation?: boolean; viewportLocked?: boolean; compactHeader?: boolean; compactTitle?: ReactNode; headerMeta?: ReactNode; /** 모바일에서도 보이는 헤더 오른쪽(참여자·초대). headerMeta는 PC만. */ headerActions?: ReactNode; account?: CustomerAccountSummary }) {
  return (
    <div className={`${theme.lightTheme} flex min-h-dvh flex-col bg-background text-foreground ${viewportLocked ? "h-dvh overflow-hidden" : ""}`}>
      <header data-customer-shell-header-mode={compactHeader ? "compact" : "expanded"} className="shrink-0 border-b border-border-subtle bg-surface">
        <div className={`flex w-full items-center px-5 transition-[height] duration-200 md:px-8 ${compactHeader ? "h-12 gap-3" : "h-16 gap-4"}`}>
          {/* 프로젝트 화면(제목 있음)은 "A" 마크만 — 프로젝트명이 헤더의 주인공. 목록 등은 전체 로고. */}
          <BrandLogoBar href="/customer-select" size={compactHeader ? "sm" : "md"} markOnly={Boolean(compactTitle)} />
          {compactTitle ? <div data-compact-project-title className={`min-w-0 md:border-l md:border-border-subtle ${compactHeader ? "md:pl-3" : "md:pl-4"}`}>{compactTitle}</div> : null}
          {headerMeta || headerActions || account || navigation ? <div className="ml-auto flex min-w-0 items-center gap-2">
            {headerMeta ? <div className="hidden md:block">{headerMeta}</div> : null}
            {headerActions}
            {account ? <CustomerAccountMenu account={account} /> : null}
            {navigation ? <nav aria-label="고객 셀렉 메뉴">
              <Link href="/customer-select/new" className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-accent px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><Plus size={15} strokeWidth={2.4} />새 프로젝트</Link>
            </nav> : null}
          </div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
