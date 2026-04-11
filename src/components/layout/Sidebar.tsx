"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfileImageUrl } from "@/lib/photographer";
import { PHOTOGRAPHER_NAV_ITEMS } from "@/lib/photographer-nav";
import { useProfile } from "@/contexts/ProfileContext";

function getInitial(name?: string | null, email?: string | null): string {
  if (name?.trim())  return name.trim().charAt(0).toUpperCase();
  if (email?.trim()) return email.trim().charAt(0).toUpperCase();
  return "?";
}

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useProfile();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "작가";
  const initial = getInitial(profile?.name, profile?.email);
  const hasImage = !!profile?.profileImageUrl;

  return (
    <aside style={{
      position: "fixed",
      left: 0, top: 0, bottom: 0,
      width: 220,
      backgroundColor: "#050505",
      borderRight: "1px solid #222",
      display: "flex",
      flexDirection: "column",
      zIndex: 30,
      fontFamily: "'Pretendard', sans-serif",
    }}>

      {/* ── 로고 영역 ── */}
      <Link
        href="/photographer/dashboard"
        style={{
          padding: "20px 20px 18px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        <div style={{
          width: 24, height: 24,
          background: "#FF4D00",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#000", fontWeight: 900, fontSize: 12,
          fontFamily: "'Space Grotesk', sans-serif",
          flexShrink: 0,
        }}>
          A
        </div>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700, fontSize: 17,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          color: "#fff",
        }}>
          A-Cut<span style={{ color: "#FF4D00" }}>.</span>
        </span>
      </Link>

      {/* ── 네비게이션 ── */}
      <nav style={{ padding: "24px 12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* MENU 라벨 */}
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10, color: "#444",
          letterSpacing: "0.2em", textTransform: "uppercase",
          padding: "0 12px", marginBottom: 10,
        }}>
          MENU
        </div>

        {PHOTOGRAPHER_NAV_ITEMS.map(({ href, label, icon: Icon, comingSoon }) => {
          const isActive =
            !comingSoon &&
            href !== "#" && (
              pathname === href ||
              (href === "/photographer/projects"
                ? pathname.startsWith("/photographer/projects")
                : pathname.startsWith(href))
            );

          const itemStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: comingSoon ? "#3a3a3a" : isActive ? "#FF4D00" : "#777",
            backgroundColor: isActive ? "rgba(255,77,0,0.08)" : "transparent",
            textDecoration: "none",
            position: "relative",
            transition: "color 0.15s ease, background-color 0.15s ease",
            cursor: comingSoon ? "default" : "pointer",
            borderLeft: `2px solid ${isActive ? "#FF4D00" : "transparent"}`,
          };

          const inner = (
            <>
              <Icon size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              {comingSoon && (
                <span style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 8, fontWeight: 700,
                  padding: "2px 6px",
                  background: "rgba(50,50,50,0.6)",
                  border: "1px solid #2a2a2a",
                  color: "#3a3a3a",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}>
                  준비중
                </span>
              )}
            </>
          );

          if (comingSoon) {
            return (
              <div key={label} style={itemStyle}>
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={label}
              href={href}
              style={itemStyle}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLAnchorElement).style.color = "#777";
                }
              }}
            >
              {inner}
            </Link>
          );
        })}
      </nav>

      {/* ── 하단 유저 영역 ── */}
      <div style={{
        padding: "14px 16px 18px",
        borderTop: "1px solid #1a1a1a",
      }}>
        {/* 로그아웃 버튼 */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%", padding: "8px 0",
            background: "transparent", border: "1px solid #222",
            fontSize: 11, color: "#555",
            cursor: "pointer",
            fontFamily: "'Space Mono', monospace",
            letterSpacing: "0.1em", textTransform: "uppercase",
            transition: "border-color 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#FF4D00";
            (e.currentTarget as HTMLButtonElement).style.color = "#FF4D00";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#222";
            (e.currentTarget as HTMLButtonElement).style.color = "#555";
          }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}
