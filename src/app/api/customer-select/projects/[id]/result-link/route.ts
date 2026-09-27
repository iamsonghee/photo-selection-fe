import { NextRequest, NextResponse } from "next/server";
import { signCustomerResultToken } from "@/lib/customer-select-result-auth";
import { resolveCustomerProjectAccess, shareTokenFromRequest } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveCustomerProjectAccess(getAdminClient(), id, shareTokenFromRequest(req, id));
  if (access instanceof NextResponse) return access;
  if (!access.isOwner) return NextResponse.json({ error: "프로젝트 소유자만 결과 링크를 만들 수 있습니다." }, { status: 403 });
  return NextResponse.json({
    url: `/customer-select/result/${id}/access?result_token=${signCustomerResultToken(id)}`,
  });
}
