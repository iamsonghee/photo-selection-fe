import type { Metadata } from "next";
import { Suspense } from "react";
import AboutPageClient from "./AboutPageClient";

export const metadata: Metadata = {
  title: "A-CUT :: 처음 오셨나요?",
  description: "A컷 고객 안내 — 갤러리 셀렉 방법을 안내합니다.",
};

export default function CustomerAboutPage() {
  return (
    <Suspense fallback={null}>
      <AboutPageClient />
    </Suspense>
  );
}
