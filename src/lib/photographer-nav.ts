import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderOpen, Users, BarChart3, Settings } from "lucide-react";

export type PhotographerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  comingSoon: boolean;
};

export const PHOTOGRAPHER_NAV_ITEMS: PhotographerNavItem[] = [
  { href: "/photographer/dashboard", label: "대시보드", icon: LayoutDashboard, comingSoon: false },
  { href: "/photographer/projects",  label: "프로젝트",  icon: FolderOpen,    comingSoon: false },
  { href: "#",                        label: "고객관리",  icon: Users,         comingSoon: true  },
  { href: "#",                        label: "통계",      icon: BarChart3,     comingSoon: true  },
  { href: "/photographer/settings",  label: "설정",      icon: Settings,      comingSoon: false },
];
