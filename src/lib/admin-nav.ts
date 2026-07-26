import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderOpen, Users, History, MessageCircle, Settings } from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/users", label: "Beta Users", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: FolderOpen },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/admin/logs", label: "Activity Logs", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
