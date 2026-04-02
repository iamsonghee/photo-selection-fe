"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PHOTOGRAPHER_NAV_ITEMS } from "@/lib/photographer-nav";
import { PHOTOGRAPHER_THEME as C, PS_FONT } from "@/lib/photographer-theme";

/**
 * 모바일(~md 미만)에서만 표시. 사이드바가 숨겨질 때 네비·설정·로그아웃 접근 제공.
 * 상단 탭바와 겹치지 않도록 하단 코너 FAB로 배치. 고정 하단 액션바가 있는 화면은 위로 올림.
 */
export function PhotographerMobileChrome() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const hasFixedBottomAction =
    pathname === "/photographer/projects/new" ||
    /\/photographer\/projects\/[^/]+\/upload$/.test(pathname) ||
    /\/photographer\/projects\/[^/]+\/upload-versions/.test(pathname) ||
    /\/photographer\/projects\/[^/]+\/results$/.test(pathname);

  const bottomLift = hasFixedBottomAction ? "max(100px, env(safe-area-inset-bottom))" : "max(20px, env(safe-area-inset-bottom))";

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const fabStyle: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    background: "rgba(10,10,11,0.92)",
    backdropFilter: "blur(10px)",
    color: C.muted,
    boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
  };

  return (
    <>
      {/* 하단 좌: 메뉴 · 우: 설정 (데스크톱 숨김) */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-[110] flex justify-between md:hidden"
        style={{
          bottom: bottomLift,
          paddingLeft: "max(16px, env(safe-area-inset-left))",
          paddingRight: "max(16px, env(safe-area-inset-right))",
        }}
      >
        <button
          type="button"
          aria-label="메뉴 열기"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={fabStyle}
          onClick={() => setOpen(true)}
        >
          <Menu size={22} strokeWidth={2} />
        </button>

        <Link
          href="/photographer/settings"
          aria-label="설정"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            ...fabStyle,
            color: pathname.startsWith("/photographer/settings") ? C.steel : C.muted,
            borderColor: pathname.startsWith("/photographer/settings") ? "rgba(79,126,255,0.35)" : C.border,
            background: pathname.startsWith("/photographer/settings")
              ? "rgba(79,126,255,0.12)"
              : "rgba(10,10,11,0.92)",
          }}
        >
          <Settings size={22} strokeWidth={2} />
        </Link>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-[140] bg-black/65 md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside
            className="fixed bottom-0 left-0 top-0 z-[150] flex w-[min(300px,88vw)] flex-col md:hidden"
            style={{
              fontFamily: PS_FONT,
              backgroundColor: C.navyDim,
              borderRight: `1px solid ${C.hairline}`,
              paddingTop: "max(12px, env(safe-area-inset-top))",
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.hairline }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>메뉴</span>
              <button
                type="button"
                aria-label="닫기"
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ color: C.muted }}
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {PHOTOGRAPHER_NAV_ITEMS.map(({ href, label, icon: Icon, comingSoon }) => {
                const isActive =
                  !comingSoon &&
                  href !== "#" &&
                  (pathname === href ||
                    (href === "/photographer/projects"
                      ? pathname.startsWith("/photographer/projects")
                      : pathname.startsWith(href)));

                if (comingSoon) {
                  return (
                    <div
                      key={label}
                      className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                      style={{ color: C.dim, fontSize: 13 }}
                    >
                      <Icon size={18} />
                      <span className="flex-1">{label}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "rgba(113,113,122,0.35)", color: C.dim }}>
                        준비중
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={href}
                    href={href}
                    className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 no-underline transition-colors"
                    style={{
                      fontSize: 13,
                      color: isActive ? C.text : C.muted,
                      backgroundColor: isActive ? "rgba(79,126,255,0.12)" : "transparent",
                    }}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t px-3 pt-2" style={{ borderColor: C.hairline }}>
              <button
                type="button"
                className="w-full rounded-xl py-2.5 text-[13px]"
                style={{
                  border: `1px solid ${C.border}`,
                  color: C.muted,
                  background: "transparent",
                  fontFamily: PS_FONT,
                }}
                onClick={handleLogout}
              >
                로그아웃
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
