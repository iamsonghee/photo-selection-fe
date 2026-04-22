"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };
type Stat = { label: string; value: string | number; accent?: boolean };

type Props = {
  crumbs: Crumb[];
  title: string;
  stats?: Stat[];
  actions?: React.ReactNode;
};

export function PhotographerPageHeader({ crumbs, title, stats, actions }: Props) {
  return (
    <header
      className="px-8 flex items-center justify-between border-b border-[#1a1a1e] bg-[#0a0a0c]/90 backdrop-blur-md sticky top-0 z-10 shrink-0"
      style={{ minHeight: 80 }}
    >
      <div>
        {crumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs font-semibold text-[#FF4D00] mb-1">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} className="text-zinc-600" strokeWidth={2.5} />}
                {c.href ? (
                  <Link href={c.href} className="hover:opacity-80 transition-opacity">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-zinc-400 font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <h1
          className="text-2xl font-bold tracking-tight text-white"
          style={{ fontFamily: "var(--font-inter, sans-serif)" }}
        >
          {title}
        </h1>
      </div>

      {(stats || actions) && (
        <div className="flex items-center gap-6">
          {stats && stats.length > 0 && (
            <div className="flex gap-6 pr-6 border-r border-[#1a1a1e]">
              {stats.map((s, i) => (
                <div key={i} className="text-right">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider ${s.accent ? "text-[#FF4D00]" : "text-zinc-500"}`}
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {s.label}
                  </div>
                  <div className={`text-xl font-bold leading-none mt-1 ${s.accent ? "text-[#FF4D00]" : "text-white"}`}>
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
