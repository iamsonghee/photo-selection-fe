"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/contexts/ProfileContext";
import { DEFAULT_PROFILE_IMAGE, getProfileImageUrl } from "@/lib/photographer";
import {
  PHOTOGRAPHER_MOBILE_PROJECT_CONTEXT_EVENT,
  readPhotographerMobileProjectContext,
  type PhotographerMobileProjectContext,
} from "@/lib/photographer-mobile-project-context";
import lightThemeStyles from "@/styles/PhotographerLightTheme.module.css";

export function MobileHeader({ light = false }: { light?: boolean }) {
  const pathname = usePathname();
  const { profile } = useProfile();
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "작가";
  const [compact, setCompact] = useState(false);
  const [assetImmersive, setAssetImmersive] = useState(false);
  const [projectContext, setProjectContext] = useState<PhotographerMobileProjectContext | null>(null);

  useEffect(() => {
    let frame = 0;
    let latestScrollTop = window.scrollY || document.documentElement.scrollTop;
    const update = () => {
      frame = 0;
      setCompact((current) => current ? latestScrollTop > 16 : latestScrollTop > 48);
    };
    const onScroll = (event: Event) => {
      const targetScrollTop = event.target instanceof HTMLElement ? event.target.scrollTop : 0;
      latestScrollTop = Math.max(
        targetScrollTop,
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    const sync = (event?: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.immersive === "boolean") {
        setAssetImmersive(event.detail.immersive);
        return;
      }
      setAssetImmersive(document.documentElement.dataset.photographerAssetImmersive === "true");
    };
    sync();
    window.addEventListener("photographer:asset-immersive-change", sync);
    return () => window.removeEventListener("photographer:asset-immersive-change", sync);
  }, [pathname]);

  useEffect(() => {
    const sync = () => setProjectContext(readPhotographerMobileProjectContext());
    sync();
    window.addEventListener(PHOTOGRAPHER_MOBILE_PROJECT_CONTEXT_EVENT, sync);
    return () => window.removeEventListener(PHOTOGRAPHER_MOBILE_PROJECT_CONTEXT_EVENT, sync);
  }, [pathname]);

  const assetProjectBase = pathname.match(/^(\/photographer\/projects\/[^/]+)\/(?:assets|upload|workflow|results)(?:\/|$)/)?.[1];
  const compactProjectHeader = Boolean(projectContext) && (Boolean(assetProjectBase) || compact || assetImmersive);
  const visuallyCompact = compact || assetImmersive;

  return (
    <header
      data-asset-project={assetProjectBase ? "true" : undefined}
      data-mobile-theme={light ? "light" : "dark"}
      data-compact={compact ? "true" : "false"}
      data-asset-immersive={assetImmersive ? "true" : "false"}
      data-project-context-visible={compactProjectHeader ? "true" : "false"}
      className={`${light ? lightThemeStyles.lightTheme : ""} photographer-mobile-header ${visuallyCompact ? "is-compact" : ""} ${assetImmersive ? "is-asset-immersive" : ""} fixed left-0 right-0 top-0 z-50 box-border flex items-center justify-between ${assetProjectBase ? "gap-1 px-2" : "gap-3 px-5"} border-b-0 bg-background/95 backdrop-blur-md md:hidden`}
    >
      <Link href={assetProjectBase ?? "/photographer/projects"} aria-label={assetProjectBase ? "프로젝트 상세로 돌아가기" : "A-CUT 프로젝트"} className={`flex min-h-11 shrink-0 items-center rounded-lg transition-[gap] duration-200 motion-reduce:transition-none ${compactProjectHeader ? "gap-0" : "gap-2"}`}>
        {assetProjectBase ? <span className="grid h-11 w-11 place-items-center"><ChevronLeft size={20} strokeWidth={2} aria-hidden /></span> : <div className={`flex items-center justify-center rounded bg-accent font-black tracking-tighter text-white transition-[width,height,font-size] duration-200 ${visuallyCompact ? "h-6 w-6 text-xs" : "h-[26px] w-[26px] text-[13px]"}`}>
          A
        </div>}
        <span
          aria-hidden={compactProjectHeader}
          className={`overflow-hidden whitespace-nowrap font-bold tracking-tight text-foreground transition-[max-width,opacity,font-size] duration-200 motion-reduce:transition-none ${
            compactProjectHeader
              ? "max-w-0 text-base opacity-0"
              : visuallyCompact
                ? "max-w-20 text-base opacity-100"
                : "max-w-20 text-[17px] opacity-100"
          }`}
        >
          A-CUT.
        </span>
      </Link>

      {projectContext ? (
        <p
          data-mobile-project-header-context
          aria-label={projectContext.projectName}
          aria-hidden={!compactProjectHeader}
          className={`flex min-w-0 items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${
            compactProjectHeader ? "flex-1 max-w-full opacity-100" : "pointer-events-none max-w-0 opacity-0"
          }`}
        >
          <span className="min-w-0 truncate text-[15px] font-semibold leading-5 tracking-[-0.35px] text-foreground" title={projectContext.projectName}>{projectContext.projectName}</span>

        </p>
      ) : null}

      <Link
        href="/photographer/settings"
        aria-label="설정"
        aria-hidden={compactProjectHeader}
        tabIndex={compactProjectHeader ? -1 : undefined}
        className={`flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full transition-[width,opacity,background-color] duration-200 active:bg-surface-raised motion-reduce:transition-none ${
          compactProjectHeader ? "pointer-events-none w-0 opacity-0" : "w-11 opacity-100"
        }`}
      >
        <span className={`flex items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-raised font-bold text-foreground transition-[width,height,font-size] duration-200 ${visuallyCompact ? "h-7 w-7 text-xs" : "h-[30px] w-[30px] text-[13px]"}`}>
          {profile?.profileImageUrl ? (
            <img
              src={getProfileImageUrl(profile.profileImageUrl)}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE; }}
            />
          ) : (
            <img src={DEFAULT_PROFILE_IMAGE} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      </Link>
    </header>
  );
}
