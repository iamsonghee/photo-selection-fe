"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type PhotographerMobilePageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  titleAccessory?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  dense?: boolean;
};

/** Photographer Light 모바일 화면의 공통 page intro. */
export function PhotographerMobilePageHeader({
  title,
  description,
  backHref,
  onBack,
  titleAccessory,
  trailing,
  className = "",
  dense = false,
}: PhotographerMobilePageHeaderProps) {
  const controlClass = "-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors active:bg-surface-raised active:text-foreground";
  const backControl = backHref ? (
    <Link href={backHref} aria-label="뒤로가기" className={controlClass}>
      <ChevronLeft size={22} strokeWidth={2} />
    </Link>
  ) : onBack ? (
    <button type="button" onClick={onBack} aria-label="뒤로가기" className={controlClass}>
      <ChevronLeft size={22} strokeWidth={2} />
    </button>
  ) : null;

  return (
    <header data-photographer-mobile-page-header className={`px-5 md:hidden ${dense ? "pb-4 pt-4" : "pb-5 pt-5"} ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-1">
          {backControl}
          <div className={`min-w-0 ${backControl ? "pt-1.5" : ""}`}>
            <div className="flex min-w-0 items-start gap-2">
              <h1 className={`m-0 min-w-0 font-bold tracking-[-0.35px] text-foreground ${dense ? "line-clamp-2 break-keep text-[26px] leading-8" : "truncate text-xl leading-7"}`}>{title}</h1>
              {titleAccessory ? <div className="mt-1 shrink-0">{titleAccessory}</div> : null}
            </div>
            {description ? (
              <p className="m-0 mt-1 break-keep text-sm leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
      </div>
    </header>
  );
}
