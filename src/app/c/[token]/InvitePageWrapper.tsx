"use client";

import dynamic from "next/dynamic";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

const InvitePageClient = dynamic(
  () => import("./InvitePageClient").then((m) => m.default),
  {
    ssr: false,
    loading: () => <SystemLoadingScreen />,
  }
);

export default function InvitePageWrapper() {
  return <InvitePageClient />;
}
