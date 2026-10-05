import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderOpen, Users, ClipboardList, History, MessageCircle, Settings, MessageSquareText, Layers } from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/beta-applications", label: "베타 신청", icon: ClipboardList },
  { href: "/admin/users", label: "작가 계정", icon: Users },
  { href: "/admin/projects", label: "프로젝트", icon: FolderOpen },
  { href: "/admin/scenes", label: "장면 검수", icon: Layers },
  { href: "/admin/surveys", label: "베타 설문", icon: MessageSquareText },
  { href: "/admin/feedback", label: "피드백", icon: MessageCircle },
  { href: "/admin/logs", label: "활동 로그", icon: History },
  { href: "/admin/settings", label: "설정", icon: Settings },
];
