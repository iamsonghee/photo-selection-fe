"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-nav";

export const ADMIN_SIDEBAR_WIDTH = 240;

function navIsActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/admin" && pathname.startsWith(href);
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <aside
      className="flex h-screen flex-col border-r border-border bg-surface"
      style={{ width: ADMIN_SIDEBAR_WIDTH, flexShrink: 0 }}
    >
      <div className="flex items-center gap-2 border-b border-border px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-white">
          A
        </div>
        <span className="text-sm font-semibold tracking-wide text-foreground">
          A-CUT ADMIN
        </span>
      </div>

      <div className="border-b border-border px-6 py-3">
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>

      <nav className="flex-1 px-3 py-4">
        {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = navIsActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-surface-raised text-foreground"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <LogOut size={18} strokeWidth={2} />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
