"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  PHOTOGRAPHER_SIDEBAR_WIDTH_COLLAPSED,
  PHOTOGRAPHER_SIDEBAR_WIDTH_FULL,
  Sidebar,
} from "@/components/layout/Sidebar";
import lightThemeStyles from "@/styles/PhotographerLightTheme.module.css";
import { MobileHeader } from "@/components/layout/mobile/MobileHeader";
import { usePhotographerModalChromeHidden } from "@/contexts/PhotographerModalContext";
import {
  isPhotographerLightRoute,
  isProjectAssetsPath,
  isProjectDetailRootPath,
  isProjectResultsPath,
  isProjectUploadPath,
  isProjectWorkflowPath,
} from "@/lib/photographer-sidebar-routes";

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
  const router = useRouter();
  const isLightAppRoute = isPhotographerLightRoute(pathname);
  const isAssetWorkspace = isProjectAssetsPath(pathname) || isProjectUploadPath(pathname) ||
    isProjectResultsPath(pathname) || isProjectWorkflowPath(pathname);

  const [collapsed, setCollapsed] = useState(() => isProjectDetailRootPath(pathname));
  const hideMobileChrome = usePhotographerModalChromeHidden();

  // The shell persists from the project list. Clear its document scroll on entry,
  // before async workspace data arrives; keep internal tab scroll positions intact.
  useLayoutEffect(() => {
    if (isAssetWorkspace && window.matchMedia("(max-width: 767px)").matches) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [isAssetWorkspace]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const redirectMobileUtilityRoute = () => {
      if (
        mobileViewport.matches &&
        pathname === "/photographer/dashboard"
      ) {
        router.replace("/photographer/projects");
      }
    };

    redirectMobileUtilityRoute();
    mobileViewport.addEventListener("change", redirectMobileUtilityRoute);
    return () => mobileViewport.removeEventListener("change", redirectMobileUtilityRoute);
  }, [pathname, router]);

  /** 작가 shell이 유지되는 route 이동에서는 사용자가 선택한 펼침/접힘 상태를 그대로 보존한다. */
  const toggleSidebar = () => setCollapsed((current) => !current);

  return (
    <>
      {/* z-20: main(z-10)보다 위에 두어 사이드바 밖으로 나온 토글이 가려지지 않게 함 */}
      <div className="relative z-20 hidden md:block">
        <Sidebar collapsed={collapsed} sidebarToggle={{ onToggle: toggleSidebar }} />
      </div>
      {(!hideMobileChrome || isAssetWorkspace) && <MobileHeader light={isLightAppRoute} />}
      <main
        data-mobile-asset-workspace={isAssetWorkspace ? "true" : undefined}
        data-app-theme={isLightAppRoute ? "light" : "dark"}
        className={`relative z-10 ml-0 min-h-0 min-w-0 flex-1 transition-[margin-left] duration-300 ease-[cubic-bezier(0.2,0,0,1)] md:ml-[var(--photographer-sidebar-width)] md:pt-0 md:pb-0 ${
          isLightAppRoute ? `${lightThemeStyles.lightTheme} photographer-light-shell` : ""
        } ${
          hideMobileChrome && !isAssetWorkspace ? "pt-0 pb-0" : "photographer-mobile-shell-main"
        }`}
        style={{
          "--photographer-sidebar-width": `${collapsed ? PHOTOGRAPHER_SIDEBAR_WIDTH_COLLAPSED : PHOTOGRAPHER_SIDEBAR_WIDTH_FULL}px`,
        } as React.CSSProperties}
      >
        {children}
      </main>
    </>
  );
}

// 하위에서 경로 판별이 필요하면 이 식별자를 쓰도록 re-export
export { isProjectDetailRootPath } from "@/lib/photographer-sidebar-routes";
