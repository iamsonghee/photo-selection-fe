import { getAppSettings } from "@/lib/app-settings";
import { LandingPageClient } from "./LandingPageClient";

// app_settings는 어드민이 재배포 없이 실시간으로 바꿀 수 있는 값이라 빌드 타임 정적 프리렌더로
// 값이 고정되면 안 된다 — 매 요청마다 다시 조회하도록 강제한다.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const settings = await getAppSettings();

  return (
    <LandingPageClient
      limits={{
        generalMaxProjects: settings.generalMaxProjects,
        generalMaxPhotosPerProject: settings.generalMaxPhotosPerProject,
        betaMaxProjectsTotal: settings.betaMaxProjectsTotal,
        betaMaxPhotosPerProject: settings.betaMaxPhotosPerProject,
      }}
    />
  );
}
