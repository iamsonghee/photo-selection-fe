"use client";

import dynamic from "next/dynamic";

const GalleryPageClient = dynamic(
  () => import("./GalleryPageClient").then((m) => m.default),
  { ssr: false, loading: () => <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]"><p className="text-zinc-400">갤러리 불러오는 중...</p></div> }
);

export default function GalleryPageWrapper() {
  return <GalleryPageClient />;
}
