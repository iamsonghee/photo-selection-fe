import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { isValidKoreanPhone, normalizePhone } from "@/lib/phone";
import { CUSTOMER_NAME_MAX_LENGTH, CUSTOMER_NOTE_MAX_LENGTH, isCustomerId } from "@/lib/photographer-customers";
import type { CustomerHistoryProject } from "@/lib/photographer-customers";

const customerFields = "id,name,phone,note,updated_at";
const mapCustomer = (row: { id: string; name: string; phone: string | null; note: string; updated_at: string }) =>
  ({ id: row.id, name: row.name, phone: row.phone, note: row.note, updatedAt: row.updated_at });
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const owner = await getPhotographerIdFromSession();
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!isCustomerId(id)) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
    const admin = getAdminClient();
    const { data: customer, error } = await admin.from("photographer_customers").select(customerFields).eq("id", id).eq("photographer_id", owner).maybeSingle();
    if (error) throw error;
    if (!customer) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
    const projects: CustomerHistoryProject[] = [];
    // Batch below PostgREST's row cap; never silently truncate a returning customer's history.
    const batchSize = 100;
    for (let start = 0; ; start += batchSize) {
      const result = await admin.from("projects")
        .select("id,name,shoot_date,shoot_type,location,status,photo_count,cover_photo_id")
        .eq("photographer_id", owner).eq("customer_id", id)
        .order("shoot_date", { ascending: false }).order("id").range(start, start + batchSize - 1);
      if (result.error) throw result.error;
      const rows = result.data ?? [];
      if (!rows.length) break;
      const ids = rows.map(row => row.id);
      const coverIds = rows.flatMap(row => row.cover_photo_id ? [row.cover_photo_id] : []);
      const [first, covers] = await Promise.all([
        admin.from("photos").select("project_id,r2_thumb_url").in("project_id", ids).eq("number", 1),
        coverIds.length ? admin.from("photos").select("id,project_id,r2_thumb_url").in("id", coverIds).in("project_id", ids) : Promise.resolve({ data: [], error: null }),
      ]);
      if (first.error || covers.error) throw first.error ?? covers.error;
      const firstByProject = new Map((first.data ?? []).map(row => [row.project_id, row.r2_thumb_url]));
      for (const row of rows) {
        const cover = covers.data?.find(photo => photo.id === row.cover_photo_id && photo.project_id === row.id);
        projects.push({ id: row.id, name: row.name, shootDate: row.shoot_date, shootType: row.shoot_type,
          location: row.location, status: row.status, photoCount: row.photo_count,
          thumbnailUrl: cover?.r2_thumb_url ?? firstByProject.get(row.id) ?? null });
      }
      if (rows.length < batchSize) break;
    }
    return NextResponse.json({ customer: { ...mapCustomer(customer), projects } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET photographer/customer]", error);
    return NextResponse.json({ error: "고객 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const owner = await getPhotographerIdFromSession();
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!isCustomerId(id)) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) {
      return NextResponse.json({ error: "저장할 고객 정보를 확인해주세요." }, { status: 400 });
    }
    const payload: { name?: string; phone?: string | null; note?: string; updated_at: string } = { updated_at: new Date().toISOString() };
    if ("name" in body || "phone" in body) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > CUSTOMER_NAME_MAX_LENGTH ||
        !(body.phone === null || typeof body.phone === "string") ||
        (body.phone?.trim() && !isValidKoreanPhone(body.phone))) {
        return NextResponse.json({ error: "이름과 연락처를 확인해주세요. 연락처는 010-0000-0000 형식입니다." }, { status: 400 });
      }
      payload.name = body.name.trim(); payload.phone = body.phone ? normalizePhone(body.phone) || null : null;
    }
    if ("note" in body) {
      if (typeof body.note !== "string" || body.note.length > CUSTOMER_NOTE_MAX_LENGTH) {
        return NextResponse.json({ error: "고객 메모는 2,000자 이내로 입력해주세요." }, { status: 400 });
      }
      payload.note = body.note.trim();
    }
    if (Object.keys(payload).length === 1) return NextResponse.json({ error: "변경할 내용을 입력해주세요." }, { status: 400 });
    const admin = getAdminClient();
    const result = await admin.from("photographer_customers").update(payload)
      .eq("id", id).eq("photographer_id", owner).eq("updated_at", body.updatedAt).select(customerFields).maybeSingle();
    if (result.error?.code === "23505") return NextResponse.json({ error: "같은 이름과 연락처로 등록된 고객이 있습니다. 입력 정보를 확인해주세요." }, { status: 409 });
    if (result.error) throw result.error;
    if (!result.data) {
      const existing = await admin.from("photographer_customers").select("id").eq("id", id).eq("photographer_id", owner).maybeSingle();
      if (existing.error) throw existing.error;
      return NextResponse.json({ error: existing.data ? "다른 화면에서 고객 정보가 변경되었습니다. 닫고 새로고침한 뒤 다시 수정해주세요." : "고객을 찾을 수 없습니다." }, { status: existing.data ? 409 : 404 });
    }
    return NextResponse.json({ customer: mapCustomer(result.data) });
  } catch (error) {
    console.error("[PATCH photographer/customer]", error);
    return NextResponse.json({ error: "고객 정보를 저장하지 못했습니다. 입력 내용은 유지됩니다." }, { status: 500 });
  }
}
