import { createClient } from "@/lib/supabase/server";

export async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUserId = session?.user?.id;
  if (!authUserId) return null;

  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", authUserId)
    .limit(1)
    .single();
  return data?.id ?? null;
}
