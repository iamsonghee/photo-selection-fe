import { getAppSettings } from "@/lib/app-settings";
import { createClient } from "@/lib/supabase/server";
import { StudioLanding } from "./_landing/StudioLanding";

export const metadata = { title: "작가·스튜디오 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function StudioLandingPage() {
  const supabase = await createClient();
  const [{ data: { user } }, settings] = await Promise.all([supabase.auth.getUser(), getAppSettings()]);
  return <StudioLanding loggedIn={!!user} maxProjects={settings.generalMaxProjects} maxPhotos={settings.generalMaxPhotosPerProject} />;
}
