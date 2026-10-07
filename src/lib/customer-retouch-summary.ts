import type { SupabaseClient } from "@supabase/supabase-js";

/** Count originals with a retouch among the current selection, not version rows. */
export async function customerRetouchCount(admin: SupabaseClient, projectId: string): Promise<number | null> {
  const { count, error } = await admin.from("customer_photos")
    .select("id, customer_selections!inner(is_selected), customer_photo_versions!inner(id)", { count: "exact", head: true })
    .eq("project_id", projectId).eq("customer_selections.is_selected", true);
  return error ? null : count ?? 0;
}
