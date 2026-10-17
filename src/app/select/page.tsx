import { getAppSettings } from "@/lib/app-settings";
import { createClient } from "@/lib/supabase/server";
import { SelectLanding } from "./_landing/SelectLanding";

export const metadata = { title: "내 사진 셀렉 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function SelectLandingPage() {
  const supabase = await createClient();
  const [{ data: { user } }, settings] = await Promise.all([supabase.auth.getUser(), getAppSettings()]);
  return <SelectLanding loggedIn={!!user} retentionDays={settings.guestRetentionDays} />;
}
