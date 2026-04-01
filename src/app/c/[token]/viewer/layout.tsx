"use client";

import { useParams } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const token = (useParams()?.token as string) ?? "";
  const inviteHref = token ? `/c/${token}` : undefined;

  return (
    <>
      <div
        className="fixed left-0 top-0 right-0 z-[100] flex h-10 items-center px-3 md:right-[280px] md:px-4"
        style={{
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(10px)",
        }}
      >
        <BrandLogoBar size="sm" href={inviteHref} />
      </div>
      {children}
    </>
  );
}
