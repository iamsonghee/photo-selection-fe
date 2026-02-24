"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, LayoutDashboard, FolderOpen, Users, BarChart3, Settings } from "lucide-react";
import { Button } from "@/components/ui";
import { mockPhotographer } from "@/lib/mock-data";

const navItems = [
  { href: "/photographer/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/photographer/projects", label: "프로젝트", icon: FolderOpen },
  { href: "#", label: "고객관리", icon: Users },
  { href: "#", label: "통계", icon: BarChart3 },
  { href: "#", label: "설정", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    console.log("로그아웃");
  };

  return (
    <aside className="fixed left-0 top-0 z-30 flex w-[200px] flex-col border-r border-zinc-800 bg-zinc-900/80">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
        <Camera className="h-6 w-6 text-[#4f7eff]" />
        <span className="logo-text text-lg text-white">PhotoSelect</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href === "/photographer/projects"
              ? pathname.startsWith("/photographer/projects")
              : pathname.startsWith(href));
          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#4f7eff]/20 text-[#4f7eff]"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          {mockPhotographer.avatarUrl ? (
            <img
              src={mockPhotographer.avatarUrl}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-zinc-700" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">
              {mockPhotographer.name}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-zinc-500"
              onClick={handleLogout}
            >
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
