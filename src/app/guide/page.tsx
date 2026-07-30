import type { Metadata } from "next";
import { Suspense } from "react";
import { getAppSettings } from "@/lib/app-settings";
import GuidePageClient from "./GuidePageClient";

export const metadata: Metadata = {
  title: "A컷 사용 가이드 — 베타 서비스 안내",
  description: "A컷 베타 서비스 사용 방법을 단계별로 안내합니다. 프로젝트 생성부터 고객 셀렉 확인까지.",
};

export default async function GuidePage() {
  const settings = await getAppSettings();

  return (
    <Suspense>
      <GuidePageClient betaMaxProjectsTotal={settings.betaMaxProjectsTotal} />
    </Suspense>
  );
}
