"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";

function GalleryLoading() {
  const token = (useParams()?.token as string) ?? "";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505]">
      <BrandLogoBar size="md" priority href={token ? `/c/${token}` : undefined} />
      <p className="text-sm text-zinc-500">갤러리 불러오는 중...</p>
    </div>
  );
}

const GalleryPageClient = dynamic(
  () => import("./GalleryPageClient").then((m) => m.default),
  {
    ssr: false,
    loading: () => <GalleryLoading />,
  }
);

export default function GalleryPageWrapper() {
  return <GalleryPageClient />;
}
