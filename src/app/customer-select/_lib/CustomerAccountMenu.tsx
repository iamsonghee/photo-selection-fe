"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type CustomerAccountSummary = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  provider: string | null;
  photoCount: number;
  photoLimit: number | null; // null = 관리자 무제한
};

export function CustomerAccountMenu({ account }: { account: CustomerAccountSummary }) {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/customer-select/login");
  }

  const initial = account.displayName.trim().charAt(0).toLocaleUpperCase("ko") || "A";
  const provider = account.provider === "google" ? "Google" : account.provider === "kakao" ? "Kakao" : null;

  return <details className="group relative">
    <summary aria-label="계정 메뉴" className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 [&::-webkit-details-marker]:hidden">
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-bold text-white">
        {account.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={account.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
          : initial}
      </span>
      <span className="hidden max-w-28 truncate text-[13px] font-semibold text-foreground sm:block">{account.displayName}</span>
    </summary>
    <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-[0_16px_40px_rgba(2,56,82,0.14)]">
      <div className="px-4 py-4">
        <p className="truncate text-sm font-bold text-foreground">{account.displayName}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{account.email}</p>
        {provider ? <p className="mt-1 text-[11px] text-muted-foreground">{provider} 계정으로 로그인</p> : null}
      </div>
      <div className="border-t border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">전체 사진 이용량</span>
          <strong className="text-foreground">{account.photoCount.toLocaleString()} / {account.photoLimit === null ? "무제한" : `${account.photoLimit.toLocaleString()}장`}</strong>
        </div>
      </div>
      <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center gap-2 border-t border-border-subtle px-4 text-sm font-semibold text-muted-foreground hover:bg-surface-raised hover:text-foreground"><LogOut size={16} />로그아웃</button>
    </div>
  </details>;
}
