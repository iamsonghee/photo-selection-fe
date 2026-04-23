"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  comingSoon?: boolean;
  icon: (active: boolean) => React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/photographer/dashboard",
    label: "대시보드",
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke={active ? "none" : "currentColor"} strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: "/photographer/projects",
    label: "프로젝트",
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke={active ? "none" : "currentColor"} strokeWidth={1.5} viewBox="0 0 24 24">
        {active
          ? <path d="M3 7a2 2 0 012-2h6l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h6l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        }
      </svg>
    ),
  },
  {
    href: "#",
    label: "고객",
    comingSoon: true,
    icon: () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: "/photographer/settings",
    label: "설정",
    icon: (active) => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#121215]/90 backdrop-blur-xl border-t border-[#1a1a1e] pb-safe">
      <div className="flex justify-around items-center h-[60px] px-2">
        {NAV_ITEMS.map(({ href, label, comingSoon, icon }) => {
          const isActive = href !== "#" && pathname.startsWith(href);

          if (comingSoon) {
            return (
              <div key={label} className="flex flex-col items-center justify-center w-16 h-full gap-1 text-zinc-600">
                {icon(false)}
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            );
          }

          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center justify-center w-16 h-full gap-1 rounded-lg transition-colors ${
                isActive ? "text-[#FF4D00]" : "text-zinc-500 active:bg-[#1a1a1e]"
              }`}
            >
              {icon(isActive)}
              <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
