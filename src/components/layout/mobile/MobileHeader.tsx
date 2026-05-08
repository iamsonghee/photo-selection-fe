"use client";

import Link from "next/link";
import { useProfile } from "@/contexts/ProfileContext";
import { getProfileImageUrl } from "@/lib/photographer";

export function MobileHeader() {
  const { profile } = useProfile();
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "작가";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 md:hidden flex items-center justify-between px-5 py-4 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-[#121215]">
      <Link href="/photographer/dashboard" className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded bg-[#FF4D00] flex items-center justify-center text-white font-black text-sm tracking-tighter">
          A
        </div>
        <span className="font-bold text-white text-lg tracking-tight">A-CUT.</span>
      </Link>

      <div className="w-8 h-8 rounded-full bg-[#27272c] overflow-hidden border border-[#3f3f46] flex items-center justify-center text-sm font-bold text-white shrink-0">
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
