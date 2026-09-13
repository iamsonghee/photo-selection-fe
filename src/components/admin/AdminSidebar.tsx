"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-nav";

export const ADMIN_SIDEBAR_WIDTH = 240;

function navIsActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/admin" && pathname.startsWith(href);
}

/**
 * 어드민은 원래 항상-노출 240px 사이드바(+ `main` 좌우 40px 패딩)뿐이었다 — 작가·고객 화면과
 * 달리 모바일 분기가 아예 없어서, 375px 화면이면 사이드바만으로 폭을 다 먹혀 콘텐츠가 실질
 * 55px 안팎(240 + 좌우 패딩 80을 뺀 나머지)에 눌려 있었다(2026-09-13 확인).
 *
 * `lg`(1024px) 미만에서는 사이드바를 감추고 상단 바 + 슬라이드 드로어로 바꾼다. `lg` 이상은
 * 기존 항상-노출 레이아웃 그대로다 — 데스크톱 쪽은 시각적으로 아무것도 바뀌지 않는다.
 */
export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // pathname이 바뀌면 드로어를 닫는다 — effect가 아니라 렌더 중 비교로 처리한다(리액트가
  // 권장하는 "prop 변화에 상태를 맞추는" 패턴). effect로 하면 드로어가 열린 채로 그려지는
  // 프레임이 한 번 끼었다가 닫히는데, 이 방식은 그 프레임 자체가 없다.
  const [syncedPathname, setSyncedPathname] = useState(pathname);
  if (pathname !== syncedPathname) {
    setSyncedPathname(pathname);
    setOpen(false);
  }

  // 드로어가 열려 있는 동안 배경 스크롤을 막는다 — 안 막으면 드로어 목록을 훑는 스와이프가
  // 뒤에 깔린 페이지까지 같이 스크롤시킨다.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const navList = (
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
  );

  const logoutButton = (
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
  );

  return (
    <>
      {/* 모바일 상단 바 — `lg` 이상에서는 완전히 사라진다(데스크톱은 아래 <aside>만 그대로 남는다) */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-white">
            A
          </div>
          <span className="text-sm font-semibold tracking-wide text-foreground">A-CUT ADMIN</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      </header>

      {/* 배경 — 드로어가 열렸을 때만, 탭하면 닫힌다 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* 사이드바 본체. 모바일에서는 왼쪽에서 미끄러져 들어오는 드로어(fixed + translate),
        * `lg` 이상에서는 원래대로 항상 펼쳐진 정적 사이드바(lg:static, 항상 translate-x-0)다. */}
      <aside
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="어드민 메뉴"
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[240px] max-w-[80vw] flex-col border-r border-border bg-surface transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-[240px] lg:max-w-none lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-white">
              A
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground">
              A-CUT ADMIN
            </span>
          </div>
          {/* 드로어 상태에서만 필요 — 데스크톱 정적 사이드바에는 닫을 이유가 없다 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground lg:hidden"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="border-b border-border px-6 py-3">
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>

        {navList}
        {logoutButton}
      </aside>
    </>
  );
}
