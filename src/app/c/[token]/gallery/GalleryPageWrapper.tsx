import { Suspense } from "react";
import { CustomerPageSkeleton } from "../CustomerPageSkeleton";
import GalleryPageClient from "./GalleryPageClient";

export default function GalleryPageWrapper() {
  return (
    <Suspense fallback={<CustomerPageSkeleton variant="gallery" />}>
      <GalleryPageClient />
    </Suspense>
  );
}
