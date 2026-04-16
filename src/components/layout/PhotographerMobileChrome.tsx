"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PHOTOGRAPHER_NAV_ITEMS } from "@/lib/photographer-nav";
// New design tokens
const ACCENT = "#FF4D00";

/**
 * 모바일(~md 미만)에서만 표시. 사이드바가 숨겨질 때 네비·설정·로그아웃 접근 제공.
 * 상단 탭바와 겹치지 않도록 하단 코너 FAB로 배치. 고정 하단 액션바가 있는 화면은 위로 올림.
 */
export function PhotographerMobileChrome() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const hasFixedBottomAction =
    pathname === "/photographer/projects/new" ||
    /\/photographer\/projects\/[^/]+$/.test(pathname) ||
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
    border: "1px solid #222",
    background: "rgba(5,5,5,0.95)",
    backdropFilter: "blur(10px)",
    color: "#666",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
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
            color: pathname.startsWith("/photographer/settings") ? ACCENT : "#666",
            borderColor: pathname.startsWith("/photographer/settings") ? `rgba(255,77,0,0.4)` : "#222",
            background: pathname.startsWith("/photographer/settings")
              ? "rgba(255,77,0,0.1)"
              : "rgba(5,5,5,0.95)",
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
            className="fixed bottom-0 left-0 top-0 z-[150] flex w-[min(280px,88vw)] flex-col md:hidden"
            style={{
              fontFamily: "'Pretendard', sans-serif",
              backgroundColor: "#050505",
              borderRight: "1px solid #222",
              paddingTop: "max(12px, env(safe-area-inset-top))",
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}
          >
            {/* 헤더 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: "1px solid #1a1a1a",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 22, height: 22, background: ACCENT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#000", fontWeight: 900, fontSize: 11,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>A</div>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                  fontSize: 15, letterSpacing: "-0.03em", textTransform: "uppercase", color: "#fff",
                }}>
                  A-Cut<span style={{ color: ACCENT }}>.</span>
                </span>
              </div>
              <button
                type="button"
                aria-label="닫기"
                style={{
                  width: 34, height: 34, border: "1px solid #1e1e1e",
                  background: "transparent", color: "#555", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* MENU 라벨 */}
            <div style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9,
              color: "#444", letterSpacing: "0.2em", textTransform: "uppercase",
              padding: "18px 20px 8px",
            }}>
              MENU
            </div>

            <nav style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              {PHOTOGRAPHER_NAV_ITEMS.map(({ href, label, icon: Icon, comingSoon }) => {
                const isActive =
                  !comingSoon &&
                  href !== "#" &&
                  (pathname === href ||
                    (href === "/photographer/projects"
                      ? pathname.startsWith("/photographer/projects")
                      : pathname.startsWith(href)));

                const baseStyle: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", fontSize: 13, fontWeight: 700,
                  color: comingSoon ? "#333" : isActive ? ACCENT : "#777",
                  backgroundColor: isActive ? "rgba(255,77,0,0.08)" : "transparent",
                  borderLeft: `2px solid ${isActive ? ACCENT : "transparent"}`,
                  textDecoration: "none", transition: "all 0.15s",
                };

                if (comingSoon) {
                  return (
                    <div key={label} style={baseStyle}>
                      <Icon size={16} />
                      <span style={{ flex: 1 }}>{label}</span>
                      <span style={{
                        fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 8, fontWeight: 700,
                        padding: "2px 6px", background: "rgba(30,30,30,0.8)", border: "1px solid #222",
                        color: "#333", letterSpacing: "0.1em", textTransform: "uppercase",
                      }}>준비중</span>
                    </div>
                  );
                }

                return (
                  <Link key={href} href={href} style={baseStyle}>
                    <Icon size={16} />
                    <span style={{ flex: 1 }}>{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 16px" }}>
              <button
                type="button"
                style={{
                  width: "100%", padding: "9px 0",
                  background: "transparent", border: "1px solid #222",
                  fontSize: 11, color: "#555", cursor: "pointer",
                  fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT;
                  (e.currentTarget as HTMLButtonElement).style.color = ACCENT;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#222";
                  (e.currentTarget as HTMLButtonElement).style.color = "#555";
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
