import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogoBar } from "@/components/BrandLogo";
import theme from "@/styles/AcutLightTheme.module.css";

export function CustomerSelectShell({ children, navigation = true }: { children: ReactNode; navigation?: boolean }) {
  return (
    <div className={`${theme.lightTheme} flex min-h-dvh flex-col bg-background text-foreground`}>
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1504px] items-center gap-6 px-5 md:px-8">
          <BrandLogoBar href="/customer-select" variant="default" />
          {navigation ? (
            <nav className="ml-auto flex items-center gap-2" aria-label="고객 셀렉 메뉴">
              <Link href="/customer-select" className="rounded-lg px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-surface-raised hover:text-foreground">내 프로젝트</Link>
              <Link href="/customer-select/new" className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[var(--accent-hover)]">새 프로젝트</Link>
            </nav>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
