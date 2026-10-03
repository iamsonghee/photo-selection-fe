import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_PAGE_SIZE } from "@/lib/photographer-customers";

export async function GET(req: NextRequest) {
  try {
    const owner = await getPhotographerIdFromSession();
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = req.nextUrl.searchParams;
    const page = Number(params.get("page") ?? 1);
    const search = (params.get("q") ?? "").trim();
    const filter = params.get("filter") ?? "all";
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 100 || !["all", "new", "returning"].includes(filter)) {
      return NextResponse.json({ error: "검색 조건이 올바르지 않습니다." }, { status: 400 });
    }
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
    return NextResponse.json({
      customers: (result.data ?? []).map(row => ({ id: row.id, name: row.name, phone: row.phone,
        projectCount: row.project_count, activeProjectCount: row.active_project_count,
        firstShootDate: row.first_shoot_date, latestShootDate: row.latest_shoot_date })),
      total: result.count ?? 0, page, pageSize: CUSTOMER_PAGE_SIZE,
      counts: { all: all.count ?? 0, new: (all.count ?? 0) - (returning.count ?? 0), returning: returning.count ?? 0 },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET photographer/customers]", error);
    return NextResponse.json({ error: "고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
