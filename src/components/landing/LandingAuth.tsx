"use client";

import { useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";
import "@/app/select/_lib/customer-select-auth.css";
import { AuthModal } from "@/components/AuthModal";
import { clearPostLoginRedirect, resolvePostLoginPath } from "@/lib/post-login-redirect";

/** 링크의 새 탭/JS 없는 이동은 유지하고, 일반 로그인 클릭만 현재 랜딩 위에서 연다. */
export function LandingAuth({ loggedIn, children }: { loggedIn: boolean; children: ReactNode }) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);

  function handleNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin) return;
    // Next.js는 이미 보이는 페이지의 스크롤을 유지하므로 랜딩 메뉴 이동은 명시적으로 초기화한다.
    if (["/", "/studio", "/select"].includes(url.pathname) && !url.hash) {
      event.preventDefault();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      router.push(url.pathname + url.search, { scroll: false });
      return;
    }
    if (loggedIn || !["/login", "/beta/apply"].includes(url.pathname)) return;
    event.preventDefault();
    setDestination(url.pathname === "/beta/apply" ? "/beta/apply" : resolvePostLoginPath(url.searchParams.get("next")));
  }

  return <>
    <div style={{ display: "contents" }} onClickCapture={handleNavigation}>{children}</div>
    <div className="cs-auth"><AuthModal isOpen={destination !== null} redirectPath={destination ?? undefined} onClose={() => {
      clearPostLoginRedirect();
      setDestination(null);
    }} /></div>
  </>;
}
