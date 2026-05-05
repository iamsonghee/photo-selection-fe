import type { Metadata } from "next";
import { Suspense } from "react";
import AboutPageClient from "./AboutPageClient";

export const metadata: Metadata = {
  title: "처음 오셨나요?",
  description: "A-CUT 고객 안내 — 갤러리에서 셀렉하는 방법을 안내합니다.",
};

export default function CustomerAboutPage() {
  return (
    <Suspense fallback={null}>
      <AboutPageClient />
    </Suspense>
  );
}
