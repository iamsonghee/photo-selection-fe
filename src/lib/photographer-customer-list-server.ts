import "server-only";
import { getAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_PAGE_SIZE } from "@/lib/photographer-customers";

export async function getCustomerList(owner: string, search = "", filter = "all", page = 1) {
    const admin = getAdminClient();
    let query = admin.from("photographer_customer_summaries")
      .select("id,name,phone,project_count,active_project_count,first_shoot_date,latest_shoot_date", { count: "exact" })
      .eq("photographer_id", owner);
    if (search) {
      // Select one search column, avoiding interpolation into PostgREST OR syntax.
      const phoneOnly = /^[\d\s()+-]+$/.test(search);
      const term = phoneOnly ? search.replace(/\D/g, "") : search;
      const literal = term.replace(/[\\%_]/g, "\\$&");
      query = query.ilike(phoneOnly && term ? "phone" : "name", `%${literal}%`);
    }
    if (filter === "new") query = query.lte("project_count", 1);
    if (filter === "returning") query = query.gt("project_count", 1);
    const [result, all, returning] = await Promise.all([
      query.order("latest_shoot_date", { ascending: false, nullsFirst: false }).order("id")
        .range((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE - 1),
      admin.from("photographer_customer_summaries").select("id", { count: "exact", head: true }).eq("photographer_id", owner),
      admin.from("photographer_customer_summaries").select("id", { count: "exact", head: true }).eq("photographer_id", owner).gt("project_count", 1),
    ]);
    if (result.error || all.error || returning.error) throw result.error ?? all.error ?? returning.error;
    return {
      fetchedAt: Date.now(),
      customers: (result.data ?? []).map(row => ({ id: row.id, name: row.name, phone: row.phone,
        projectCount: row.project_count, activeProjectCount: row.active_project_count,
        firstShootDate: row.first_shoot_date, latestShootDate: row.latest_shoot_date })),
      total: result.count ?? 0, page, pageSize: CUSTOMER_PAGE_SIZE,
      counts: { all: all.count ?? 0, new: (all.count ?? 0) - (returning.count ?? 0), returning: returning.count ?? 0 },
    };
}
