"use client";

import Link from "next/link";
import { ChevronLeft, LogOut } from "lucide-react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PHOTOGRAPHER_NAV_ITEMS } from "@/lib/photographer-nav";
import styles from "@/components/layout/Sidebar.module.css";

const sidebarSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--acb-sidebar-sans",
  display: "swap",
});

const sidebarMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--acb-sidebar-mono",
  display: "swap",
});

/** `PhotographerDesktopShell` 의 `md:ml-[240px]` / `md:ml-[72px]` 와 동일 값 유지 */
export const PHOTOGRAPHER_SIDEBAR_WIDTH_FULL = 240;
export const PHOTOGRAPHER_SIDEBAR_WIDTH_COLLAPSED = 72;

export type SidebarToggleProps = {
  onToggle: () => void;
};

function navIsActive(pathname: string, href: string, comingSoon: boolean): boolean {
  if (comingSoon || href === "#") return false;
  if (pathname === href) return true;
  if (href === "/photographer/projects") return pathname.startsWith("/photographer/projects");
  return pathname.startsWith(href);
}

export function Sidebar({
  collapsed = false,
  sidebarToggle,
}: {
  collapsed?: boolean;
  /** 접기/펼치기 — `PhotographerDesktopShell` 에서 전 작가 라우트 공통으로 전달 */
  sidebarToggle: SidebarToggleProps;
}) {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const renderNavItem = (
    href: string,
    label: string,
    Icon: (typeof PHOTOGRAPHER_NAV_ITEMS)[0]["icon"],
    comingSoon: boolean,
    key: string,
  ) => {
    const isActive = navIsActive(pathname, href, comingSoon);
    const itemClass = [
      styles.navItem,
      collapsed ? styles.navItemCollapsed : "",
      isActive ? styles.navItemActive : "",
      comingSoon ? styles.navItemDisabled : "",
    ]
      .filter(Boolean)
      .join(" ");

    const iconClass = [styles.navIcon, collapsed ? styles.navIconCollapsed : ""].filter(Boolean).join(" ");
    const textClass = [styles.navText, collapsed ? styles.navTextCollapsed : ""].filter(Boolean).join(" ");

    const inner = (
      <>
        <span className={iconClass} aria-hidden>
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className={textClass}>{label}</span>
        {!collapsed && comingSoon && <span className={styles.badgeSoon}>준비중</span>}
      </>
    );

    const tip = comingSoon ? `${label} (준비중)` : label;

    if (comingSoon) {
      return (
        <div key={key} className={itemClass} title={tip}>
          {inner}
        </div>
      );
    }

    return (
      <Link key={key} href={href} className={itemClass} title={tip} aria-label={collapsed ? label : undefined}>
        {inner}
      </Link>
    );
  };

  return (
    <aside
      className={[
        styles.root,
        collapsed ? styles.rootCollapsed : styles.rootExpanded,
        sidebarSans.variable,
        sidebarMono.variable,
      ].join(" ")}
      style={{
        fontFamily: "var(--acb-sidebar-sans), system-ui, sans-serif",
      }}
    >
      <div className={styles.toggleWrap}>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={sidebarToggle.onToggle}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <span
            className={[styles.toggleIcon, collapsed ? styles.toggleIconCollapsed : ""].filter(Boolean).join(" ")}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          </span>
        </button>
      </div>

      <div className={styles.brandHeader}>
        <Link
          href="/photographer/dashboard"
          title="A-CUT."
          className={[
            styles.brandLink,
            collapsed ? styles.brandLinkCollapsed : styles.brandLinkExpanded,
          ].join(" ")}
        >
          <div
            className={styles.logoMark}
            style={{ fontFamily: "var(--acb-sidebar-mono), ui-monospace, monospace" }}
          >
            A
          </div>
          <span
            className={[styles.logoText, collapsed ? styles.logoTextHidden : ""].filter(Boolean).join(" ")}
            style={{ fontFamily: "var(--acb-sidebar-sans), system-ui, sans-serif" }}
          >
            A-CUT<span className={styles.logoDot}>.</span>
          </span>
        </Link>
      </div>

      <nav className={styles.navContainer}>
        <div
          className={[styles.navLabel, collapsed ? styles.navLabelCollapsed : ""].filter(Boolean).join(" ")}
          style={{ fontFamily: "var(--acb-sidebar-mono), ui-monospace, monospace" }}
        >
          MENU
        </div>
        {PHOTOGRAPHER_NAV_ITEMS.map(({ href, label, icon, comingSoon }) =>
          renderNavItem(href, label, icon, comingSoon, label),
        )}
      </nav>

      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={[
            styles.navItem,
            collapsed ? styles.navItemCollapsed : "",
            styles.navItemLogout,
          ].join(" ")}
          onClick={handleLogout}
          aria-label="로그아웃"
          title="로그아웃"
        >
          <span className={[styles.navIcon, collapsed ? styles.navIconCollapsed : ""].filter(Boolean).join(" ")} aria-hidden>
            <LogOut size={20} strokeWidth={2} />
          </span>
          <span
            className={[styles.navText, collapsed ? styles.navTextCollapsed : ""].filter(Boolean).join(" ")}
          >
            로그아웃
          </span>
        </button>
      </div>
    </aside>
  );
}
