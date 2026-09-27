import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import theme from "@/styles/AcutLightTheme.module.css";
import { CustomerAccountMenu, type CustomerAccountSummary } from "./CustomerAccountMenu";

export function CustomerSelectShell({ children, navigation = false, viewportLocked = false, account }: { children: ReactNode; navigation?: boolean; viewportLocked?: boolean; account?: CustomerAccountSummary }) {
  return (
    <div className={`${theme.lightTheme} flex min-h-dvh flex-col bg-background text-foreground ${viewportLocked ? "h-dvh overflow-hidden" : ""}`}>
      <header className="shrink-0 border-b border-border-subtle bg-surface">
        <div className="flex h-16 w-full items-center gap-6 px-5 md:px-8">
          <BrandLogoBar href="/customer-select" variant="default" />
          {account || navigation ? <div className="ml-auto flex items-center gap-2">
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
