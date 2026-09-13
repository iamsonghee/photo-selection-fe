import type { ReactNode } from "react";

type PhotographerDenseFilterToolbarProps = {
  search: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Light operational list용 Dense Filter Toolbar 후보 패턴.
 * Wide Desktop에서는 유동 search와 filter cluster를 12px 간격으로 붙이고,
 * MacBook급 폭에서만 두 개의 명확한 행으로 분리한다.
 */
export function PhotographerDenseFilterToolbar({
  search,
  children,
  className = "",
}: PhotographerDenseFilterToolbarProps) {
  return (
    <div className={`grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(320px,1fr)_auto] ${className}`}>
      <div className="w-full min-w-0">{search}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {children}
      </div>
    </div>
  );
}
