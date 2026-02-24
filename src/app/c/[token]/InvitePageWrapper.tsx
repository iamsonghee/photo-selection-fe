"use client";

import dynamic from "next/dynamic";

const InvitePageClient = dynamic(
  () => import("./InvitePageClient").then((m) => m.default),
  { ssr: false, loading: () => <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]"><p className="text-zinc-400">로딩 중...</p></div> }
);

export default function InvitePageWrapper() {
  return <InvitePageClient />;
}
