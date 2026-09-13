"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  actions: ReactNode;
  leading?: ReactNode;
  error?: ReactNode;
  mobileLeading?: ReactNode;
  maxWidth: number;
  className?: string;
  mobileFixed?: boolean;
  viewportFixed?: boolean;
  compactMobile?: boolean;
};

/**
 * Photographer Light의 긴 작업 화면이 공유하는 하단 고정 액션 영역.
 * surface·divider·sticky geometry는 공통으로 관리하고, 안내 문구와 action은 화면이 주입한다.
 */
export function PhotographerFormActionBar({
  actions,
  leading,
  error,
  mobileLeading,
  maxWidth,
  className = "",
  mobileFixed = false,
  viewportFixed = false,
  compactMobile = false,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; width: number }>();
  const [height, setHeight] = useState(80);
  // 사이드바 폭이 바뀌어도 폼 본문 폭에 맞춰 하단 바를 고정한다.
  useLayoutEffect(() => {
    if (!viewportFixed || !anchorRef.current) return;
    const anchor = anchorRef.current;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({ left: rect.left, width: rect.width });
    };
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [viewportFixed]);
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {viewportFixed ? <div ref={anchorRef} aria-hidden className="shrink-0" style={{ height }} /> : mobileFixed ? <div aria-hidden className="shrink-0 md:hidden" style={{ height }} /> : null}
      <div
        ref={barRef}
        data-photographer-page-action-bar
        style={viewportFixed ? position : undefined}
        className={`${viewportFixed ? "fixed bottom-0 z-40" : mobileFixed ? "fixed inset-x-0 bottom-0 z-40 md:sticky md:inset-x-auto md:z-20" : "sticky bottom-0 z-20"} border-t border-border-subtle bg-surface shadow-[0_-6px_18px_rgba(2,56,82,0.06)] pb-[env(safe-area-inset-bottom,0px)] md:pb-0 ${className}`}
      >
        <div className="px-4 md:px-8">
          {error ? <p role="alert" className="mx-auto pt-3 text-sm text-danger" style={{ maxWidth }}>{error}</p> : null}
          <div
            className={`mx-auto flex min-h-[64px] flex-col gap-3 py-3 sm:min-h-[80px] sm:flex-row sm:items-center sm:gap-4 sm:py-4 ${
              leading ? "sm:justify-between" : "sm:justify-end"
            } ${compactMobile ? "max-md:!min-h-0 max-md:!gap-2 max-md:!py-2" : ""}`}
            style={{ maxWidth }}
          >
            {mobileLeading ? <div className="min-w-0 text-xs text-muted-foreground sm:hidden">{mobileLeading}</div> : null}
            {leading ? <div className="hidden min-w-0 sm:block">{leading}</div> : null}
            <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto max-sm:[&>button]:flex-1 max-sm:[&>button]:min-w-0 max-sm:[&>button]:px-3">{actions}</div>
          </div>
        </div>
      </div>
    </>
  );
}

/** 폼 외 결과 확인 화면에서도 같은 shell을 사용할 때의 의미상 alias. */
export const PhotographerPageActionBar = PhotographerFormActionBar;
