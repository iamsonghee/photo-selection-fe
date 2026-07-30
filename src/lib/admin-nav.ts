import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderOpen, Users, ClipboardList, History, MessageCircle, Settings, MessageSquareText } from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/beta-applications", label: "Beta Applications", icon: ClipboardList },
  { href: "/admin/users", label: "Beta Users", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: FolderOpen },
  { href: "/admin/surveys", label: "Beta Surveys", icon: MessageSquareText },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/admin/logs", label: "Activity Logs", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
