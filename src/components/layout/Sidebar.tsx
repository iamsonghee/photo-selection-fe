"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderOpen, Users, BarChart3, Settings, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProfileImageUrl } from "@/lib/photographer";
import { useProfile } from "@/contexts/ProfileContext";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

const navItems = [
  { href: "/photographer/dashboard", label: "대시보드", icon: LayoutDashboard, comingSoon: false },
  { href: "/photographer/projects",  label: "프로젝트",  icon: FolderOpen,    comingSoon: false },
  { href: "#",                        label: "고객관리",  icon: Users,         comingSoon: true  },
  { href: "#",                        label: "통계",      icon: BarChart3,     comingSoon: true  },
  { href: "/photographer/settings",  label: "설정",      icon: Settings,      comingSoon: false },
];

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
      backgroundColor: C.navyDim,
      borderRight: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      zIndex: 30,
      fontFamily: PS_FONT,
    }}>

      {/* ── 로고 영역 ── */}
      <div style={{
        padding: "20px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          width: 36, height: 36,
          background: "rgba(79,126,255,0.12)",
          border: `1.5px solid ${C.borderMd}`,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Camera size={18} color={C.steel} />
        </div>
        <div>
          <div style={{ fontFamily: PS_DISPLAY, fontSize: 17, fontWeight: 600, color: C.text, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            PhotoSelect
          </div>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
            photographer
          </div>
        </div>
      </div>

      {/* ── 네비게이션 ── */}
      <nav style={{ padding: 10, flex: 1 }}>
        {navItems.map(({ href, label, icon: Icon, comingSoon }) => {
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
            gap: 9,
            padding: "9px 12px",
            borderRadius: 10,
            fontSize: 13,
            color: comingSoon ? C.dim : isActive ? C.text : C.muted,
            backgroundColor: isActive ? "rgba(79,126,255,0.12)" : "transparent",
            marginBottom: 2,
            textDecoration: "none",
            position: "relative",
            transition: "color 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            cursor: comingSoon ? "default" : "pointer",
          };

          const inner = (
            <>
              {isActive && (
                <div style={{
                  position: "absolute",
                  left: 0, top: 6, bottom: 6,
                  width: 3,
                  backgroundColor: C.steel,
                  borderRadius: "0 2px 2px 0",
                }} />
              )}
              <Icon size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              {comingSoon && (
                <span style={{
                  fontSize: 9, fontWeight: 500,
                  padding: "2px 6px", borderRadius: 10,
                  background: "rgba(113,113,122,0.35)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: C.dim,
                  letterSpacing: "0.02em",
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
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(79,126,255,0.06)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
              }}
            >
              {inner}
            </Link>
          );
        })}
      </nav>

      {/* ── 하단 유저 영역 ── */}
      <div style={{ padding: 14, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* 아바타 */}
          {hasImage ? (
            <img
              src={getProfileImageUrl(profile?.profileImageUrl)}
              alt=""
              style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).src = getProfileImageUrl(null); }}
            />
          ) : (
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #4f7eff, #3b4f6b)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, color: "white", flexShrink: 0,
            }}>
              {initial}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>사진작가</div>
          </div>

          {/* 온라인 상태 */}
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            backgroundColor: C.green,
            boxShadow: `0 0 0 2px ${C.greenDim}`,
            flexShrink: 0,
          }} />
        </div>

        {/* 로그아웃 버튼 */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%", marginTop: 8, padding: "6px 0",
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 11, color: C.muted,
            cursor: "pointer", fontFamily: PS_FONT,
            transition: "border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.steel;
            (e.currentTarget as HTMLButtonElement).style.color = C.steel;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
            (e.currentTarget as HTMLButtonElement).style.color = C.muted;
          }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}
