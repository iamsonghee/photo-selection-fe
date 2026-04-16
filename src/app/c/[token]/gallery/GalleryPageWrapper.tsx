"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

const GalleryPageClient = dynamic(
  () => import("./GalleryPageClient").then((m) => m.default),
  {
    ssr: false,
    loading: () => <SystemLoadingScreen />,
  }
);

export default function GalleryPageWrapper() {
  return (
    <Suspense fallback={<SystemLoadingScreen />}>
      <GalleryPageClient />
    </Suspense>
  );
}
