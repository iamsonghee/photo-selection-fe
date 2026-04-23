"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileHeader } from "@/components/layout/mobile/MobileHeader";
import { MobileBottomNav } from "@/components/layout/mobile/MobileBottomNav";
import { isProjectDetailRootPath } from "@/lib/photographer-sidebar-routes";

/**
 * 작가 영역(/photographer/*) 공통 셸.
 * 사이드바 너비(narrow)는 여기서만 관리 — 페이지 컴포넌트마다 별도 사이드바 없음.
 */
export function PhotographerDesktopShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);

  /** 프로젝트 상세 루트 진입 시 기본 좁은 사이드바 */
  useEffect(() => {
    if (isProjectDetailRootPath(pathname)) setNarrow(true);
  }, [pathname]);

  const collapsed = narrow;
  const toggleSidebar = () => setNarrow((n) => !n);

  return (
    <>
      {/* z-20: main(z-10)보다 위에 두어 사이드바 밖으로 나온 토글이 가려지지 않게 함 */}
      <div className="relative z-20 hidden md:block">
        <Sidebar collapsed={collapsed} sidebarToggle={{ onToggle: toggleSidebar }} />
      </div>
      <MobileHeader />
      <main
        className={`relative z-10 ml-0 min-h-0 min-w-0 flex-1 transition-[margin-left] duration-300 ease-[cubic-bezier(0.2,0,0,1)] pt-[57px] pb-[76px] md:pt-0 md:pb-0 ${
          collapsed ? "md:ml-[72px]" : "md:ml-[240px]"
        }`}
      >
        {children}
      </main>
      <MobileBottomNav />
    </>
  );
}

// 하위에서 경로 판별이 필요하면 이 식별자를 쓰도록 re-export
export { isProjectDetailRootPath } from "@/lib/photographer-sidebar-routes";
