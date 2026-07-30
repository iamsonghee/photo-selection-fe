import type { Metadata } from "next";
import { Suspense } from "react";
import { getAppSettings } from "@/lib/app-settings";
import GuidePageClient from "./GuidePageClient";

export const metadata: Metadata = {
  title: "A컷 사용 가이드 — 베타 서비스 안내",
  description: "A컷 베타 서비스 사용 방법을 단계별로 안내합니다. 프로젝트 생성부터 고객 셀렉 확인까지.",
};

// app_settings는 어드민이 재배포 없이 실시간으로 바꿀 수 있는 값이라 빌드 타임 정적 프리렌더로
// 값이 고정되면 안 된다 — 매 요청마다 다시 조회하도록 강제한다.
export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const settings = await getAppSettings();

  return (
    <Suspense>
      <GuidePageClient betaMaxProjectsTotal={settings.betaMaxProjectsTotal} />
    </Suspense>
  );
}
