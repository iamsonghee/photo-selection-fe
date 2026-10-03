import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getCustomerList } from "@/lib/photographer-customer-list-server";

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
    return NextResponse.json(await getCustomerList(owner, search, filter, page), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET photographer/customers]", error);
    return NextResponse.json({ error: "고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
