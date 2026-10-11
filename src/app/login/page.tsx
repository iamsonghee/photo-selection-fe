import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/post-login-redirect";
import { EntryPage } from "@/components/entry/EntryPage";
import { LoginPanel } from "@/components/entry/LoginPanel";

export const metadata = { title: "로그인 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = resolvePostLoginPath(typeof params.next === "string" ? params.next : null);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(next);
  return <EntryPage login><LoginPanel next={next} failed={Boolean(params.error)} /></EntryPage>;
}
