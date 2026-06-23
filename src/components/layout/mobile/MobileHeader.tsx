"use client";

import Link from "next/link";
import { useProfile } from "@/contexts/ProfileContext";
import { getProfileImageUrl } from "@/lib/photographer";

export function MobileHeader() {
  const { profile } = useProfile();
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "작가";

  return (
    <header className="photographer-mobile-header fixed top-0 left-0 right-0 z-50 md:hidden flex items-center justify-between px-5 py-4 bg-background/90 backdrop-blur-md border-b border-border">
      <Link href="/photographer/dashboard" className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded bg-accent flex items-center justify-center text-white font-black text-sm tracking-tighter">
          A
        </div>
        <span className="font-bold text-foreground text-lg tracking-tight">A-CUT.</span>
      </Link>

      <div className="w-8 h-8 rounded-full bg-surface-raised overflow-hidden border border-border-strong flex items-center justify-center text-sm font-bold text-foreground shrink-0">
        {profile?.profileImageUrl ? (
          <img
            src={getProfileImageUrl(profile.profileImageUrl)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </div>
    </header>
  );
}
