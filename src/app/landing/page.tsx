import { getAppSettings } from "@/lib/app-settings";
import { LandingPageClient } from "./LandingPageClient";

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
