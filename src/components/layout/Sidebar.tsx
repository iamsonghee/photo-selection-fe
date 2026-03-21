"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderOpen, Users, BarChart3, Settings, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProfileImageUrl } from "@/lib/photographer";
import { useProfile } from "@/contexts/ProfileContext";

// ── colour tokens (wireframe 기준) ──────────────────────────
const C = {
  navyDim:   "#001f30",
  steel:     "#669bbc",
  border:    "rgba(102,155,188,0.12)",
  borderMd:  "rgba(102,155,188,0.22)",
  text:      "#e8eef2",
  muted:     "#7a9ab0",
  dim:       "#3a5a6e",
  green:     "#2ed573",
  greenDim:  "#0f2a1e",
};

const navItems = [
  { href: "/photographer/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/photographer/projects",  label: "프로젝트",  icon: FolderOpen   },
  { href: "#",                        label: "고객관리",  icon: Users        },
  { href: "#",                        label: "통계",      icon: BarChart3    },
  { href: "/photographer/settings",  label: "설정",      icon: Settings     },
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
          background: "rgba(102,155,188,0.1)",
          border: `1.5px solid ${C.borderMd}`,
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Camera size={18} color={C.steel} />
        </div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: C.text, lineHeight: 1.2 }}>
            A컷
          </div>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
            Acut
          </div>
        </div>
      </div>

      {/* ── 네비게이션 ── */}
      <nav style={{ padding: 10, flex: 1 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href !== "#" && (
              pathname === href ||
              (href === "/photographer/projects"
                ? pathname.startsWith("/photographer/projects")
                : pathname.startsWith(href))
            );

          return (
            <Link
              key={label}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13,
                color: isActive ? C.text : C.muted,
                backgroundColor: isActive ? "rgba(102,155,188,0.12)" : "transparent",
                marginBottom: 2,
                textDecoration: "none",
                position: "relative",
                transition: "color 0.15s, background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(102,155,188,0.06)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
              }}
            >
              {/* 활성 상태 좌측 보더 */}
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
              {label}
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
              background: "linear-gradient(135deg, #669bbc, #003049)",
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
            borderRadius: 6, fontSize: 11, color: C.muted,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            transition: "border-color 0.15s, color 0.15s",
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
