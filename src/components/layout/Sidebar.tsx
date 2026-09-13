"use client";

import Link from "next/link";
import { ChevronLeft, ChevronUp, LogOut, Settings } from "lucide-react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PHOTOGRAPHER_NAV_ITEMS } from "@/lib/photographer-nav";
import { FeedbackButton } from "@/components/photographer/FeedbackModal";
import { useProfile } from "@/contexts/ProfileContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { usePhotographerQuota } from "@/lib/use-photographer-quota";
import { isPhotographerLightRoute } from "@/lib/photographer-sidebar-routes";
import styles from "@/components/layout/Sidebar.module.css";

/**
 * quota.tier → 사용자에게 보여줄 짧은 plan 표기. 실제 tier 값(beta/general/admin)만 사용 —
 * 하드코딩된 "Basic" 등은 쓰지 않는다. Dashboard의 사용량 패널도 이 값을 그대로 재사용한다
 * (같은 정보에 서로 다른 plan 이름이 생기지 않도록 — src/app/photographer/dashboard/DashboardOverview.tsx 참고).
 */
export const TIER_LABEL: Record<string, string> = {
  admin: "관리자",
  beta: "베타",
  general: "무료체험",
};

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

/** Figma #56039 NavigationMenu의 펼침/접힘 폭. Desktop shell의 content offset과 함께 관리한다. */
export const PHOTOGRAPHER_SIDEBAR_WIDTH_FULL = 266;
export const PHOTOGRAPHER_SIDEBAR_WIDTH_COLLAPSED = 102.5;

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
  const isLightRoute = isPhotographerLightRoute(pathname);
  const { profile } = useProfile();
  const quota = usePhotographerQuota();
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "작가";
  const tierLabel = quota ? TIER_LABEL[quota.tier] : null;
  const usagePct =
    quota && quota.max ? Math.min(100, Math.round((quota.current / quota.max) * 100)) : 0;

  // Profile Popover — 완전 제어형(open state)으로 전환: 네이티브 <details>의 toggle-only 동작만으로는
  // Escape로 닫기, Sidebar collapse 시 자동으로 닫기 같은 것이 안 돼서 실제 QA에서 발견된 버그.
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const profileMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileMenuOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
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
        isLightRoute ? styles.rootLight : "",
        collapsed ? styles.rootCollapsed : styles.rootExpanded,
        sidebarSans.variable,
        sidebarMono.variable,
      ].join(" ")}
      data-photographer-sidebar
      data-sidebar-theme={isLightRoute ? "light" : "dark"}
      style={{
        fontFamily: "var(--acb-sidebar-sans), system-ui, sans-serif",
      }}
    >
      <div className={styles.toggleWrap}>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => {
            setProfileMenuOpen(false);
            sidebarToggle.onToggle();
          }}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <span
            data-sidebar-toggle-visual
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

      <nav className={styles.navContainer} aria-label="주요 메뉴">
        {PHOTOGRAPHER_NAV_ITEMS.map(({ href, label, icon, comingSoon }) =>
          renderNavItem(href, label, icon, comingSoon, label),
        )}
      </nav>

      <div className={styles.sidebarFooter} data-sidebar-footer>
        {/* 대시보드는 본문에 상세 도표를 제공하므로 중복 사용량을 숨긴다. 다른 화면에서는 작업 중에도
            한도를 확인할 수 있도록 작은 진행 막대를 유지한다. */}
        {!collapsed && pathname !== "/photographer/dashboard" && quota && quota.max !== null && (
          <div className={styles.usageCard}>
            <div className="flex items-end justify-between">
              <span
                className={styles.usageLabel}
                style={{ color: "var(--acb-text-tertiary)" }}
              >
                활성 프로젝트
              </span>
              <span className={styles.usageValue}>
                <span className="font-bold" style={{ color: "var(--acb-text-primary)" }}>{quota.current}</span>
                <span style={{ color: "var(--acb-text-tertiary)" }}>/{quota.max}</span>
              </span>
            </div>
            <div className={styles.usageTrack} style={{ background: "var(--acb-border)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct >= 100 ? "var(--acb-danger)" : usagePct >= 80 ? "var(--acb-accent)" : "var(--acb-text-secondary)",
                }}
              />
            </div>
          </div>
        )}

        {/* Profile — 클릭 시 Popover(설정/문의하기/로그아웃). 네이티브 details/summary — ProjectInformationCard의
            더보기 메뉴와 동일한 패턴을 재사용(새 dropdown 구현을 만들지 않음), 위쪽으로 열리도록 anchor만 반전. */}
        <details
          ref={profileMenuRef}
          className={styles.profileDetails}
          open={profileMenuOpen}
          onToggle={(e) => setProfileMenuOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            data-sidebar-profile-trigger
            aria-label={collapsed ? "프로필 메뉴" : undefined}
            aria-expanded={profileMenuOpen}
            title="프로필 메뉴"
            onClick={(e) => {
              e.preventDefault();
              setProfileMenuOpen((v) => !v);
            }}
            className={[styles.profileTrigger, collapsed ? styles.profileTriggerCollapsed : ""].filter(Boolean).join(" ")}
          >
            <div
              className={styles.profileAvatar}
              style={{ borderColor: "var(--acb-border)", background: "var(--surface)" }}
            >
              {profile?.profileImageUrl ? (
                <img
                  src={getProfileImageUrl(profile.profileImageUrl)}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span style={{ fontFamily: "var(--acb-sidebar-sans)" }}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {!collapsed && (
              <div className="overflow-hidden min-w-0">
                <p
                  className="truncate text-[15px] font-semibold leading-5 tracking-[-0.35px] text-foreground"
                  style={{ fontFamily: "var(--acb-sidebar-sans)" }}
                >
                  {displayName} 작가님
                </p>
                {tierLabel && (
                  <p
                    className="mt-0.5 text-[12px] leading-[18px] tracking-[-0.25px] text-muted-foreground"
                    style={{ fontFamily: "inherit" }}
                  >
                    {tierLabel}
                  </p>
                )}
              </div>
            )}
            {!collapsed ? (
              <ChevronUp
                size={16}
                strokeWidth={1.8}
                aria-hidden
                className={[styles.profileChevron, profileMenuOpen ? styles.profileChevronOpen : ""].filter(Boolean).join(" ")}
              />
            ) : null}
          </summary>

          <div
            role="menu"
            className={[styles.profileMenu, collapsed ? styles.profileMenuCollapsed : styles.profileMenuExpanded].join(" ")}
          >
            {profile?.email && (
              <div className={styles.profileMenuEmail}>
                {profile.email}
              </div>
            )}
            <Link
              href="/photographer/settings"
              role="menuitem"
              className={styles.profileMenuItem}
            >
              <Settings size={18} strokeWidth={2} /> 설정
            </Link>
            <FeedbackButton
              triggerRole="menuitem"
              triggerClassName={styles.profileMenuItem}
              iconClassName={styles.profileMenuIcon}
              textClassName={styles.profileMenuText}
            />
            <div className={styles.profileMenuDivider} />
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className={[styles.profileMenuItem, styles.profileMenuDanger].join(" ")}
            >
              <LogOut size={18} strokeWidth={2} /> 로그아웃
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}
