"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };
type Stat = { label: string; value: string | number; accent?: boolean };

type Props = {
  crumbs: Crumb[];
  title: string;
  description?: string;
  onBack?: () => void;
  stats?: Stat[];
  actions?: React.ReactNode;
};

export function PhotographerPageHeader({ crumbs, title, description, onBack, stats, actions }: Props) {
  return (
    <header
      className="sticky top-16 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md md:top-0 md:px-8"
      style={{ minHeight: 80 }}
    >
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-subtle-foreground hover:text-foreground hover:bg-surface-raised transition-colors shrink-0 mt-1"
            aria-label="뒤로가기"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          {crumbs.some((c) => c.href) ? (
            <div className="flex items-center gap-1 text-xs font-semibold text-accent mb-1">
              {crumbs.filter((c) => c.href).map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={11} className="text-subtle-foreground" strokeWidth={2.5} />}
                  <Link href={c.href!} className="hover:opacity-80 transition-opacity">
                    {c.label}
                  </Link>
                </span>
              ))}
            </div>
          ) : null}
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
          >
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>

      {(stats || actions) && (
        <div className="flex items-center gap-6">
          {stats && stats.length > 0 && (
            <div className="hidden md:flex gap-6 pr-6 border-r border-border">
              {stats.map((s, i) => (
                <div key={i} className="text-right">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider ${s.accent ? "text-accent" : "text-muted-foreground"}`}
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {s.label}
                  </div>
                  <div className={`text-xl font-bold leading-none mt-1 ${s.accent ? "text-accent" : "text-foreground"}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {actions}
        </div>
      )}
    </header>
  );
}
