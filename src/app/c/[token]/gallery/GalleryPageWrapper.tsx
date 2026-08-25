import { Suspense } from "react";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import GalleryPageClient from "./GalleryPageClient";

export default function GalleryPageWrapper() {
  return (
    <Suspense fallback={<SystemLoadingScreen />}>
      <GalleryPageClient />
    </Suspense>
  );
}
