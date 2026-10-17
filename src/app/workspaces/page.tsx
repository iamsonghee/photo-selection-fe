import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { EntryPage } from "@/components/entry/EntryPage";
import { createClient } from "@/lib/supabase/server";
import { LAST_WORKSPACE_KEY, WORKSPACE_SAVE_FAILED_COOKIE, lastWorkspacePath } from "@/lib/workspaces";

export const metadata = { title: "작업 공간 선택 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function WorkspacesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const saveFailed = (await cookies()).get(`${WORKSPACE_SAVE_FAILED_COOKIE}_${user.id}`)?.value === "1";
  const path = saveFailed ? null : lastWorkspacePath(user.user_metadata[LAST_WORKSPACE_KEY]);
  if (path) redirect(path);
  return <EntryPage choose />;
}
