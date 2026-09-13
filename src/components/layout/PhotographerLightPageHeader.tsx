import type { ReactNode } from "react";

type PhotographerLightPageHeaderProps = {
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  trailing?: ReactNode;
  className?: string;
  compact?: boolean;
  mobileMinimal?: boolean;
  mobileDense?: boolean;
};

type PhotographerLightPageFrameProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Light App 페이지의 공통 시작 좌표.
 * 모든 Light 운영 페이지가 좌우 32px, 상단 24px 기준선을 공유하도록 한다.
 */
export function PhotographerLightPageFrame({
  children,
  className = "",
}: PhotographerLightPageFrameProps) {
  return <div className={`px-5 pt-5 md:px-8 md:pt-6 ${className}`}>{children}</div>;
}

/**
 * Light App Golden Reference용 공통 page intro.
 *
 * 페이지의 시작 좌표는 PhotographerLightPageFrame이 담당하고, 이 컴포넌트는
 * title/description/trailing의 typography와 내부 geometry를 한 곳에서 관리한다.
 */
export function PhotographerLightPageHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  trailing,
  className = "",
  compact = false,
  mobileMinimal = false,
  mobileDense = false,
}: PhotographerLightPageHeaderProps) {
  return (
    <header className={className}>
      {breadcrumb ? (
        <div
          aria-hidden={compact}
          inert={compact}
          className={`overflow-hidden transition-[max-height,margin,opacity] duration-200 ease-out motion-reduce:transition-none ${mobileDense ? "hidden md:block" : ""} ${
            compact ? "pointer-events-none mb-0 max-h-0 opacity-0" : "mb-5 max-h-8 opacity-100"
          }`}
        >
          {breadcrumb}
        </div>
      ) : null}
      <div className={`flex justify-between gap-4 transition-[align-items] duration-200 ${compact ? "items-center" : "items-start"}`}>
        <div className={`min-w-0 ${compact ? "flex flex-1 items-baseline gap-3" : ""}`}>
          {eyebrow ? <div className={compact ? "sr-only" : "mb-1"}>{eyebrow}</div> : null}
          <h1 className={`m-0 shrink-0 font-bold tracking-[-0.56px] text-foreground transition-[font-size,line-height] duration-200 ease-out motion-reduce:transition-none ${
            compact
              ? mobileDense
                ? "text-[18px] leading-7 md:text-[19px] md:leading-8"
                : "text-[19px] leading-8"
              : mobileMinimal
                ? "text-[22px] leading-8 md:text-[28px] md:leading-[42px]"
                : mobileDense
                  ? "text-[24px] leading-8 md:text-[28px] md:leading-[42px]"
                : "text-[28px] leading-[42px]"
          }`}>
            {title}
          </h1>
          <p className={`m-0 min-w-0 truncate font-normal tracking-[-0.45px] text-muted-foreground transition-[margin,line-height] duration-200 ease-out motion-reduce:transition-none ${
            mobileDense ? "text-[12px] md:text-[14px]" : "text-[14px]"
          } ${
            compact ? "mt-0 leading-6" : mobileDense ? "mt-1 leading-5 md:mt-1.5 md:leading-[25px]" : "mt-1.5 leading-[25px]"
          } ${mobileMinimal ? "hidden md:block" : ""}`}>
            {description}
          </p>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
